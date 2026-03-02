import { ActionExtractorService } from '@ghostfolio/api/app/endpoints/ai/action-extractor.service';
import {
  AGENT_ALLOWED_TOOL_NAMES,
  AGENT_HEARTBEAT_INTERVAL_MS,
  AGENT_MAX_HISTORY_PAIRS
} from '@ghostfolio/api/app/endpoints/ai/agent/agent.constants';
import {
  ReactAgentService,
  SseAgentDoneEvent
} from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import { buildSystemPrompt } from '@ghostfolio/api/app/endpoints/ai/agent/system-prompt-builder';
import { ChartDataExtractorService } from '@ghostfolio/api/app/endpoints/ai/chart-data-extractor.service';
import { toToolNameArray } from '@ghostfolio/api/app/endpoints/ai/chat-conversation.service';
import { VerifiedResponse } from '@ghostfolio/api/app/endpoints/ai/contracts/final-response.schema';
import {
  LLM_CLIENT_TOKEN,
  LLMClient,
  LLMMessage
} from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
import { LangfuseService } from '@ghostfolio/api/app/endpoints/ai/observability/langfuse.service';
import { ToolRouterService } from '@ghostfolio/api/app/endpoints/ai/routing/tool-router.service';
import { validateConversationHistory } from '@ghostfolio/api/app/endpoints/ai/utils/conversation-history-validator';
import { ResponseVerifierService } from '@ghostfolio/api/app/endpoints/ai/verification/response-verifier.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { Filter } from '@ghostfolio/common/interfaces';
import type { SseEvent } from '@ghostfolio/common/interfaces';
import type { AiPromptMode } from '@ghostfolio/common/types';

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger
} from '@nestjs/common';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import { randomUUID } from 'node:crypto';
import type { ColumnDescriptor } from 'tablemark';

export interface ChatResponse extends VerifiedResponse {
  conversationId: string;
}

@Injectable()
export class AiService {
  private static readonly HOLDINGS_TABLE_COLUMN_DEFINITIONS: ({
    key:
      | 'ALLOCATION_PERCENTAGE'
      | 'ASSET_CLASS'
      | 'ASSET_SUB_CLASS'
      | 'CURRENCY'
      | 'NAME'
      | 'SYMBOL';
  } & ColumnDescriptor)[] = [
    { key: 'NAME', name: 'Name' },
    { key: 'SYMBOL', name: 'Symbol' },
    { key: 'CURRENCY', name: 'Currency' },
    { key: 'ASSET_CLASS', name: 'Asset Class' },
    { key: 'ASSET_SUB_CLASS', name: 'Asset Sub Class' },
    {
      align: 'right',
      key: 'ALLOCATION_PERCENTAGE',
      name: 'Allocation in Percentage'
    }
  ];

  public constructor(
    private readonly actionExtractorService: ActionExtractorService,
    private readonly chartDataExtractorService: ChartDataExtractorService,
    private readonly langfuseService: LangfuseService,
    @Inject(LLM_CLIENT_TOKEN)
    private readonly llmClient: LLMClient,
    private readonly portfolioService: PortfolioService,
    private readonly prismaService: PrismaService,
    private readonly reactAgentService: ReactAgentService,
    private readonly responseVerifierService: ResponseVerifierService,
    private readonly toolRouterService: ToolRouterService
  ) {}

  public getHealth() {
    return {
      status: getReasonPhrase(StatusCodes.OK)
    };
  }

  public async generateText({ prompt }: { prompt: string }) {
    return this.llmClient.complete({
      messages: [{ content: prompt, role: 'user' }],
      temperature: 0
    });
  }

  public async chat({
    conversationId,
    message,
    toolNames,
    userId
  }: {
    conversationId?: string;
    message: string;
    toolNames?: string[];
    userId: string;
  }): Promise<ChatResponse> {
    // 1. Validate toolNames against allowlist
    const sanitizedToolNames = this.sanitizeToolNames(toolNames);

    // 1a. Route tools based on message content
    const routedToolNames = this.routeTools(
      message,
      sanitizedToolNames,
      toolNames
    );

    // 2. Resolve prior context and effective system prompt
    let priorMessages: LLMMessage[] = [];
    let effectiveSystemPrompt: string;
    let resolvedConversationId: string | undefined = conversationId;

    if (conversationId) {
      // Load stored system prompt (ownership enforced — throws 404 if wrong user)
      const conversation = await this.prismaService.chatConversation.findFirst({
        select: { systemPrompt: true },
        where: { id: conversationId, userId }
      });

      if (!conversation) {
        throw new BadRequestException(
          `Conversation not found: ${conversationId}`
        );
      }

      effectiveSystemPrompt = conversation.systemPrompt;

      // Load last N messages (constant DB IO — do not load all then slice)
      const recentMessages = await this.prismaService.chatMessage.findMany({
        orderBy: { seq: 'desc' },
        select: { content: true, role: true, seq: true },
        take: AGENT_MAX_HISTORY_PAIRS * 2,
        where: { conversationId }
      });

      // Restore chronological order
      recentMessages.reverse();
      priorMessages = validateConversationHistory(
        recentMessages.map((m) => ({
          content: m.content,
          role: m.role as LLMMessage['role']
        })),
        'AiService.chat'
      );
    } else {
      // New conversation — build a prompt tailored to the selected tool set.
      // Always uses the server-controlled prompt builder; caller-supplied
      // system prompts are not accepted to prevent guardrail bypass.
      effectiveSystemPrompt = buildSystemPrompt(routedToolNames);
    }

    // 3. Run the agent (outside any transaction — failure = no DB writes)
    const requestId = randomUUID();

    // Start Langfuse trace (no-ops when LANGFUSE_PUBLIC_KEY is not set)
    const { traceId, end: endTrace } = this.langfuseService.startTrace({
      conversationId,
      message,
      requestId,
      toolNames: routedToolNames,
      userId
    });

    const result = await this.reactAgentService.run({
      prompt: message,
      priorMessages,
      requestId,
      systemPrompt: effectiveSystemPrompt,
      toolNames: routedToolNames,
      userId
    });

    // 4. Verify response
    // Derive invoked tools from agent result (not requested list)
    const invokedToolNames = [
      ...new Set((result.executedTools ?? []).map((t) => t.toolName))
    ];

    const verified = this.responseVerifierService.verify(
      result,
      invokedToolNames,
      traceId
    );

    // Finalise the Langfuse trace with outcome metadata
    endTrace({
      confidence: verified.confidence,
      elapsedMs: verified.elapsedMs,
      estimatedCostUsd: verified.estimatedCostUsd,
      invokedToolNames: verified.invokedToolNames,
      iterations: verified.iterations,
      requiresHumanReview: verified.requiresHumanReview,
      status: verified.status,
      toolCalls: verified.toolCalls,
      warnings: verified.warnings
    });

    // 4b. Extract chart data from tool results
    const chartData = this.chartDataExtractorService.extract(
      result.executedTools ?? []
    );
    verified.chartData = chartData;

    // 4c. Extract deterministic follow-up actions from invoked tools
    verified.actions = this.actionExtractorService.extract(invokedToolNames);

    // 5. Normalise title (collapse whitespace, truncate)
    const title = message.replace(/\s+/g, ' ').trim().slice(0, 60);

    // 6. Persist atomically: two explicit sequential creates so seq ordering is guaranteed
    resolvedConversationId = await this.prismaService.$transaction(
      async (tx) => {
        let convId = conversationId;

        if (!convId) {
          const conv = await tx.chatConversation.create({
            data: {
              systemPrompt: effectiveSystemPrompt,
              title,
              userId
            },
            select: { id: true }
          });

          convId = conv.id;
        } else {
          // Explicitly touch updatedAt (belt-and-suspenders for @updatedAt on nested writes)
          await tx.chatConversation.update({
            data: { updatedAt: new Date() },
            where: { id: convId }
          });
        }

        // User message first — seq ordering guaranteed by insertion order
        await tx.chatMessage.create({
          data: {
            content: message,
            conversationId: convId,
            requestedToolNames: [],
            role: 'user'
          }
        });

        // Assistant message second
        await tx.chatMessage.create({
          data: {
            chartData: verified.chartData as any,
            content: verified.response,
            conversationId: convId,
            estimatedCostUsd: verified.estimatedCostUsd,
            requestedToolNames: toToolNameArray(verified.sources),
            role: 'assistant'
          }
        });

        return convId;
      }
    );

    return { ...verified, conversationId: resolvedConversationId };
  }

  /**
   * Streaming version of chat(). Yields SSE events as an async iterable.
   * The final `done` event is only emitted after successful DB persistence.
   * A top-level heartbeat timer runs throughout to keep connections alive.
   */
  public async *chatStream({
    conversationId,
    message,
    signal,
    toolNames,
    userId
  }: {
    conversationId?: string;
    message: string;
    signal?: AbortSignal;
    toolNames?: string[];
    userId: string;
  }): AsyncIterable<SseEvent> {
    // 1. Validate toolNames against allowlist
    const sanitizedToolNames = this.sanitizeToolNames(toolNames);

    // 1a. Route tools based on message content
    const routedToolNames = this.routeTools(
      message,
      sanitizedToolNames,
      toolNames
    );

    // 2. Resolve prior context and effective system prompt
    let priorMessages: LLMMessage[] = [];
    let effectiveSystemPrompt: string;

    if (conversationId) {
      const conversation = await this.prismaService.chatConversation.findFirst({
        select: { systemPrompt: true },
        where: { id: conversationId, userId }
      });

      if (!conversation) {
        yield {
          type: 'error',
          message: `Conversation not found: ${conversationId}`
        };

        return;
      }

      effectiveSystemPrompt = conversation.systemPrompt;

      const recentMessages = await this.prismaService.chatMessage.findMany({
        orderBy: { seq: 'desc' },
        select: { content: true, role: true, seq: true },
        take: AGENT_MAX_HISTORY_PAIRS * 2,
        where: { conversationId }
      });

      recentMessages.reverse();
      priorMessages = validateConversationHistory(
        recentMessages.map((m) => ({
          content: m.content,
          role: m.role as LLMMessage['role']
        })),
        'AiService.chatStream'
      );
    } else {
      effectiveSystemPrompt = buildSystemPrompt(routedToolNames);
    }

    // 3. Start heartbeat timer (top-level, not inside agent)
    const heartbeatQueue: SseEvent[] = [];
    const heartbeatTimer = setInterval(() => {
      heartbeatQueue.push({ type: 'heartbeat' });
    }, AGENT_HEARTBEAT_INTERVAL_MS);

    try {
      // 4. Run the streaming agent
      const requestId = randomUUID();

      // Start Langfuse trace (mirrors the non-streaming chat() path)
      const { traceId: streamTraceId, end: endStreamTrace } =
        this.langfuseService.startTrace({
          conversationId,
          message,
          requestId,
          toolNames: routedToolNames,
          userId
        });

      let agentResult: SseAgentDoneEvent['result'] | undefined;

      for await (const event of this.reactAgentService.runStreaming({
        priorMessages,
        prompt: message,
        requestId,
        signal,
        systemPrompt: effectiveSystemPrompt,
        toolNames: routedToolNames,
        userId
      })) {
        if (signal?.aborted) {
          return;
        }

        if (event.type === '_agent_done') {
          agentResult = (event as SseAgentDoneEvent).result;
        } else {
          yield event as SseEvent;
        }

        // Flush any queued heartbeats
        while (heartbeatQueue.length > 0) {
          yield heartbeatQueue.shift()!;
        }
      }

      if (!agentResult || signal?.aborted) {
        return;
      }

      // 5. Verify, extract charts + actions
      const invokedToolNames = [
        ...new Set((agentResult.executedTools ?? []).map((t) => t.toolName))
      ];

      const verified = this.responseVerifierService.verify(
        agentResult,
        invokedToolNames,
        streamTraceId
      );

      // Finalise Langfuse trace with outcome metadata
      endStreamTrace({
        confidence: verified.confidence,
        elapsedMs: verified.elapsedMs,
        estimatedCostUsd: verified.estimatedCostUsd,
        invokedToolNames: verified.invokedToolNames,
        iterations: verified.iterations,
        requiresHumanReview: verified.requiresHumanReview,
        status: verified.status,
        toolCalls: verified.toolCalls,
        warnings: verified.warnings
      });

      verified.chartData = this.chartDataExtractorService.extract(
        agentResult.executedTools ?? []
      );
      verified.actions = this.actionExtractorService.extract(invokedToolNames);

      // 6. Persist before emitting done (critical ordering)
      const title = message.replace(/\s+/g, ' ').trim().slice(0, 60);

      let resolvedConversationId: string;

      try {
        resolvedConversationId = await this.prismaService.$transaction(
          async (tx) => {
            let convId = conversationId;

            if (!convId) {
              const conv = await tx.chatConversation.create({
                data: {
                  systemPrompt: effectiveSystemPrompt,
                  title,
                  userId
                },
                select: { id: true }
              });

              convId = conv.id;
            } else {
              await tx.chatConversation.update({
                data: { updatedAt: new Date() },
                where: { id: convId }
              });
            }

            await tx.chatMessage.create({
              data: {
                content: message,
                conversationId: convId,
                requestedToolNames: [],
                role: 'user'
              }
            });

            await tx.chatMessage.create({
              data: {
                chartData: verified.chartData as any,
                content: verified.response,
                conversationId: convId,
                estimatedCostUsd: verified.estimatedCostUsd,
                requestedToolNames: toToolNameArray(verified.sources),
                role: 'assistant'
              }
            });

            return convId;
          }
        );
      } catch (persistError) {
        Logger.error(
          `chatStream persistence failed: ${persistError instanceof Error ? persistError.message : persistError}`,
          persistError instanceof Error ? persistError.stack : undefined,
          'AiService'
        );

        yield {
          type: 'error',
          message:
            'Failed to save conversation. Your response was generated but could not be persisted.'
        };

        return;
      }

      // 7. Emit done with full envelope (only after successful persistence)
      yield {
        type: 'done',
        payload: {
          actions: verified.actions,
          chartData: verified.chartData,
          confidence: verified.confidence,
          conversationId: resolvedConversationId,
          elapsedMs: verified.elapsedMs,
          estimatedCostUsd: verified.estimatedCostUsd,
          invokedToolNames: verified.invokedToolNames,
          iterations: verified.iterations,
          requiresHumanReview: verified.requiresHumanReview,
          response: verified.response,
          sources: verified.sources,
          status: verified.status,
          toolCalls: verified.toolCalls,
          traceId: verified.traceId,
          warnings: verified.warnings
        }
      };
    } catch (error) {
      Logger.error(
        `chatStream failed: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
        'AiService'
      );

      yield {
        type: 'error',
        message: 'An unexpected error occurred during streaming.'
      };
    } finally {
      clearInterval(heartbeatTimer);
    }
  }

  public async getPrompt({
    filters,
    impersonationId,
    languageCode,
    mode,
    userCurrency,
    userId
  }: {
    filters?: Filter[];
    impersonationId: string;
    languageCode: string;
    mode: AiPromptMode;
    userCurrency: string;
    userId: string;
  }) {
    const { holdings } = await this.portfolioService.getDetails({
      filters,
      impersonationId,
      userId
    });

    const holdingsTableColumns: ColumnDescriptor[] =
      AiService.HOLDINGS_TABLE_COLUMN_DEFINITIONS.map(({ align, name }) => {
        return { name, align: align ?? 'left' };
      });

    const holdingsTableRows = Object.values(holdings)
      .sort((a, b) => {
        return b.allocationInPercentage - a.allocationInPercentage;
      })
      .map(
        ({
          allocationInPercentage,
          assetClass,
          assetSubClass,
          currency,
          name: label,
          symbol
        }) => {
          return AiService.HOLDINGS_TABLE_COLUMN_DEFINITIONS.reduce(
            (row, { key, name }) => {
              switch (key) {
                case 'ALLOCATION_PERCENTAGE':
                  row[name] = `${(allocationInPercentage * 100).toFixed(3)}%`;
                  break;

                case 'ASSET_CLASS':
                  row[name] = assetClass ?? '';
                  break;

                case 'ASSET_SUB_CLASS':
                  row[name] = assetSubClass ?? '';
                  break;

                case 'CURRENCY':
                  row[name] = currency;
                  break;

                case 'NAME':
                  row[name] = label;
                  break;

                case 'SYMBOL':
                  row[name] = symbol;
                  break;

                default:
                  row[name] = '';
                  break;
              }

              return row;
            },
            {} as Record<string, string>
          );
        }
      );

    const holdingsTableString = await this.toMarkdownTable({
      columns: holdingsTableColumns,
      rows: holdingsTableRows
    });

    if (mode === 'portfolio') {
      return holdingsTableString;
    }

    return [
      `You are a neutral financial assistant. Please analyze the following investment portfolio (base currency being ${userCurrency}) in simple words.`,
      holdingsTableString,
      'Structure your answer with these sections:',
      "Overview: Briefly summarize the portfolio's composition and allocation rationale.",
      'Risk Assessment: Identify potential risks, including market volatility, concentration, and sectoral imbalances.',
      'Advantages: Highlight strengths, focusing on growth potential, diversification, or other benefits.',
      'Disadvantages: Point out weaknesses, such as overexposure or lack of defensive assets.',
      'Target Group: Discuss who this portfolio might suit (e.g., risk tolerance, investment goals, life stages, and experience levels).',
      'Optimization Ideas: Offer ideas to complement the portfolio, ensuring they are constructive and neutral in tone.',
      'Conclusion: Provide a concise summary highlighting key insights.',
      `Provide your answer in the following language: ${languageCode}.`
    ].join('\n');
  }

  /**
   * Returns the sanitized tool list directly.
   *
   * Tool-use models select the right tool from the full definition list;
   * a keyword pre-filter is not needed and introduces misrouting risk.
   * The ToolRouterService is kept in the DI graph for caller-override
   * support and future extensibility.
   */
  private routeTools(
    message: string,
    sanitizedToolNames: string[],
    originalToolNames: string[] | undefined
  ): string[] {
    const routingResult = this.toolRouterService.selectTools(
      message,
      sanitizedToolNames,
      originalToolNames?.length ? sanitizedToolNames : undefined
    );

    return routingResult.tools;
  }

  private sanitizeToolNames(toolNames: string[] | undefined): string[] {
    if (!toolNames) {
      return [...AGENT_ALLOWED_TOOL_NAMES];
    }

    // Trim + de-dupe
    const normalized = [
      ...new Set(toolNames.map((n) => n.trim()).filter(Boolean))
    ];

    const unknown = normalized.filter(
      (n) => !(AGENT_ALLOWED_TOOL_NAMES as readonly string[]).includes(n)
    );

    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown tool name(s): ${unknown.join(', ')}`
      );
    }

    return normalized.length > 0 ? normalized : [...AGENT_ALLOWED_TOOL_NAMES];
  }

  private escapeMarkdownCell(value: unknown) {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value).split('|').join('\\|');
  }

  private getMarkdownFallback({
    columns,
    rows
  }: {
    columns: ColumnDescriptor[];
    rows: Record<string, string>[];
  }) {
    const header = `| ${columns
      .map(({ name }) => {
        return this.escapeMarkdownCell(name);
      })
      .join(' | ')} |`;

    const separator = `| ${columns
      .map(() => {
        return '---';
      })
      .join(' | ')} |`;

    const body = rows.map((row) => {
      return `| ${columns
        .map(({ name }) => {
          return this.escapeMarkdownCell(row[name]);
        })
        .join(' | ')} |`;
    });

    return [header, separator, ...body].join('\n');
  }

  private toMarkdownTable({
    columns,
    rows
  }: {
    columns: ColumnDescriptor[];
    rows: Record<string, string>[];
  }): string {
    // Use the inline fallback directly.
    //
    // The previous implementation used new Function('s','return import(s)')
    // (functionally equivalent to eval) to load the ESM-only `tablemark`
    // package at runtime.  This pattern:
    //  - Violates Content-Security-Policy (CSP) in strict environments
    //  - Triggers security scanners (SonarQube, Semgrep unsafe-function-new)
    //  - Fails silently in environments that block eval
    //
    // The fallback produces correct pipe-delimited markdown and is already
    // the safety net — there is no reason to prefer tablemark over it.
    // If column-alignment formatting becomes important, configure the build
    // system for ESM interop instead of using runtime eval.
    return this.getMarkdownFallback({ columns, rows });
  }
}
