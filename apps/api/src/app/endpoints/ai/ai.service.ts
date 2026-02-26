import { ActionExtractorService } from '@ghostfolio/api/app/endpoints/ai/action-extractor.service';
import {
  AGENT_ALLOWED_TOOL_NAMES,
  AGENT_DEFAULT_SYSTEM_PROMPT,
  AGENT_MAX_HISTORY_PAIRS
} from '@ghostfolio/api/app/endpoints/ai/agent/agent.constants';
import {
  ReactAgentService,
  SseAgentDoneEvent
} from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import { ChartDataExtractorService } from '@ghostfolio/api/app/endpoints/ai/chart-data-extractor.service';
import { toToolNameArray } from '@ghostfolio/api/app/endpoints/ai/chat-conversation.service';
import { VerifiedResponse } from '@ghostfolio/api/app/endpoints/ai/contracts/final-response.schema';
import {
  LLM_CLIENT_TOKEN,
  LLMClient,
  LLMMessage
} from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
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
    @Inject(LLM_CLIENT_TOKEN)
    private readonly llmClient: LLMClient,
    private readonly portfolioService: PortfolioService,
    private readonly prismaService: PrismaService,
    private readonly reactAgentService: ReactAgentService,
    private readonly responseVerifierService: ResponseVerifierService
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
    systemPrompt,
    toolNames,
    userId
  }: {
    conversationId?: string;
    message: string;
    systemPrompt?: string;
    toolNames?: string[];
    userId: string;
  }): Promise<ChatResponse> {
    // 1. Validate toolNames against allowlist
    const sanitizedToolNames = this.sanitizeToolNames(toolNames);

    // 1b. Deterministic scope gate — classify request before reaching the LLM
    const scopeResult = this.checkScopeGate(message);

    if (scopeResult.type === 'REJECT') {
      return this.buildScopedRefusal({
        conversationId,
        message,
        refusalText: scopeResult.reason,
        systemPrompt: systemPrompt ?? AGENT_DEFAULT_SYSTEM_PROMPT,
        userId
      });
    }

    // 2. Resolve prior context and effective system prompt
    let priorMessages: LLMMessage[] = [];
    let effectiveSystemPrompt: string;
    let resolvedConversationId: string | undefined = conversationId;

    if (conversationId) {
      // Continuing an existing conversation
      if (systemPrompt) {
        throw new BadRequestException(
          'Cannot change the system prompt of an existing conversation'
        );
      }

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
      priorMessages = recentMessages.map((m) => ({
        content: m.content,
        role: m.role as LLMMessage['role']
      }));
    } else {
      // New conversation — resolve and freeze the effective system prompt
      effectiveSystemPrompt = systemPrompt ?? AGENT_DEFAULT_SYSTEM_PROMPT;
    }

    // 2b. Handle AMBIGUOUS messages now that we have conversation history.
    //     Vague follow-ups are only valid when the prior conversation was on-topic.
    if (scopeResult.type === 'AMBIGUOUS') {
      const lastAssistantMsg = [...priorMessages]
        .reverse()
        .find((m) => m.role === 'assistant');

      if (!lastAssistantMsg) {
        // No prior context — ask for clarification
        return this.buildScopedRefusal({
          conversationId,
          message,
          refusalText: AiService.AMBIGUOUS_CLARIFICATION_RESPONSE,
          systemPrompt: effectiveSystemPrompt,
          userId
        });
      }

      if (AiService.REFUSAL_RESPONSE_PATTERN.test(lastAssistantMsg.content)) {
        // Last response was a refusal — don't let "based on that" sneak past
        return this.buildScopedRefusal({
          conversationId,
          message,
          refusalText: AiService.AMBIGUOUS_CLARIFICATION_RESPONSE,
          systemPrompt: effectiveSystemPrompt,
          userId
        });
      }

      // Last response was portfolio-related — allow the follow-up through
    }

    // 3. Run the agent (outside any transaction — failure = no DB writes)
    const result = await this.reactAgentService.run({
      prompt: message,
      priorMessages,
      systemPrompt: effectiveSystemPrompt,
      toolNames: sanitizedToolNames,
      userId
    });

    // 4. Verify response
    // Derive invoked tools from agent result (not requested list)
    const invokedToolNames = [
      ...new Set((result.executedTools ?? []).map((t) => t.toolName))
    ];

    const verified = this.responseVerifierService.verify(
      result,
      invokedToolNames
    );

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
    systemPrompt,
    toolNames,
    userId
  }: {
    conversationId?: string;
    message: string;
    signal?: AbortSignal;
    systemPrompt?: string;
    toolNames?: string[];
    userId: string;
  }): AsyncIterable<SseEvent> {
    // 1. Validate toolNames against allowlist
    const sanitizedToolNames = this.sanitizeToolNames(toolNames);

    // 1b. Deterministic scope gate
    const scopeResult = this.checkScopeGate(message);

    if (scopeResult.type === 'REJECT') {
      const refusalResponse = await this.buildScopedRefusal({
        conversationId,
        message,
        refusalText: scopeResult.reason,
        systemPrompt: systemPrompt ?? AGENT_DEFAULT_SYSTEM_PROMPT,
        userId
      });

      yield {
        type: 'done',
        payload: {
          actions: refusalResponse.actions,
          chartData: refusalResponse.chartData,
          confidence: refusalResponse.confidence,
          conversationId: refusalResponse.conversationId,
          elapsedMs: refusalResponse.elapsedMs,
          estimatedCostUsd: refusalResponse.estimatedCostUsd,
          invokedToolNames: refusalResponse.invokedToolNames,
          iterations: refusalResponse.iterations,
          response: refusalResponse.response,
          sources: refusalResponse.sources,
          status: refusalResponse.status,
          toolCalls: refusalResponse.toolCalls,
          warnings: refusalResponse.warnings
        }
      };

      return;
    }

    // 2. Resolve prior context and effective system prompt
    let priorMessages: LLMMessage[] = [];
    let effectiveSystemPrompt: string;

    if (conversationId) {
      if (systemPrompt) {
        yield {
          type: 'error',
          message: 'Cannot change the system prompt of an existing conversation'
        };

        return;
      }

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
      priorMessages = recentMessages.map((m) => ({
        content: m.content,
        role: m.role as LLMMessage['role']
      }));
    } else {
      effectiveSystemPrompt = systemPrompt ?? AGENT_DEFAULT_SYSTEM_PROMPT;
    }

    // 2b. Handle AMBIGUOUS messages
    if (scopeResult.type === 'AMBIGUOUS') {
      const lastAssistantMsg = [...priorMessages]
        .reverse()
        .find((m) => m.role === 'assistant');

      if (
        !lastAssistantMsg ||
        AiService.REFUSAL_RESPONSE_PATTERN.test(lastAssistantMsg.content)
      ) {
        const refusalResponse = await this.buildScopedRefusal({
          conversationId,
          message,
          refusalText: AiService.AMBIGUOUS_CLARIFICATION_RESPONSE,
          systemPrompt: effectiveSystemPrompt,
          userId
        });

        yield {
          type: 'done',
          payload: {
            actions: refusalResponse.actions,
            chartData: refusalResponse.chartData,
            confidence: refusalResponse.confidence,
            conversationId: refusalResponse.conversationId,
            elapsedMs: refusalResponse.elapsedMs,
            estimatedCostUsd: refusalResponse.estimatedCostUsd,
            invokedToolNames: refusalResponse.invokedToolNames,
            iterations: refusalResponse.iterations,
            response: refusalResponse.response,
            sources: refusalResponse.sources,
            status: refusalResponse.status,
            toolCalls: refusalResponse.toolCalls,
            warnings: refusalResponse.warnings
          }
        };

        return;
      }
    }

    // 3. Start heartbeat timer (top-level, not inside agent)
    const HEARTBEAT_INTERVAL_MS = 15_000;
    const heartbeatQueue: SseEvent[] = [];
    const heartbeatTimer = setInterval(() => {
      heartbeatQueue.push({ type: 'heartbeat' });
    }, HEARTBEAT_INTERVAL_MS);

    try {
      // 4. Run the streaming agent
      let agentResult: SseAgentDoneEvent['result'] | undefined;

      for await (const event of this.reactAgentService.runStreaming({
        priorMessages,
        prompt: message,
        signal,
        systemPrompt: effectiveSystemPrompt,
        toolNames: sanitizedToolNames,
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
        invokedToolNames
      );

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
          response: verified.response,
          sources: verified.sources,
          status: verified.status,
          toolCalls: verified.toolCalls,
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

  // ─── Deterministic scope gate ──────────────────────────────────────────────

  /**
   * Pattern: "use my X tool" / "use the X tool" / "run X tool" where X
   * is NOT in AGENT_ALLOWED_TOOL_NAMES. Captures the tool-like token.
   */
  private static readonly UNKNOWN_TOOL_PATTERN =
    /\b(?:use|run|invoke|call|execute)\b.*?\b(\w+?)(?:_tool|_helper)?\s+tool\b/i;

  /**
   * Hard out-of-scope phrases. Matched as case-insensitive substrings.
   */
  private static readonly OUT_OF_SCOPE_PATTERNS: readonly string[] = [
    'predict the future',
    'medical advice',
    'legal advice',
    'diagnose',
    'prescription',
    'write code',
    'generate code',
    'write a poem',
    'tell me a joke',
    'lottery',
    'gambling advice'
  ];

  /**
   * Regex patterns that indicate the request is plausibly about finance or
   * portfolio analysis. If a message does NOT match any of these AND is not
   * a short conversational follow-up (e.g. "yes", "tell me more"), it is
   * treated as out-of-scope.
   */
  private static readonly FINANCIAL_RELEVANCE_PATTERNS: readonly RegExp[] = [
    /portfoli/i,
    /hold(?:ing|s)/i,
    /stock/i,
    /bond/i,
    /etf/i,
    /fund/i,
    /equit/i,
    /asset/i,
    /invest/i,
    /market/i,
    /trad(?:e|ing)/i,
    /transact/i,
    /dividend/i,
    /return/i,
    /performance/i,
    /risk/i,
    /rebalanc/i,
    /allocat/i,
    /tax/i,
    /compliance/i,
    /ticker/i,
    /share/i,
    /crypto/i,
    /bitcoin/i,
    /price/i,
    /value/i,
    /gain/i,
    /loss/i,
    /profit/i,
    /sector/i,
    /diversif/i,
    /volatil/i,
    /yield/i,
    /interest rate/i,
    /inflation/i,
    /s&p/i,
    /nasdaq/i,
    /dow/i,
    /vanguard/i,
    /fidelity/i,
    /schwab/i,
    /brokerage/i,
    /401k/i,
    /ira/i,
    /roth/i,
    /capital/i,
    /financ/i,
    /money/i,
    /wealth/i,
    /budget/i,
    /expense/i,
    /earning/i,
    /revenue/i,
    /fiscal/i,
    /currency/i,
    /forex/i,
    /commodit/i,
    /option/i,
    /futures/i,
    /hedge/i,
    /mutual/i,
    /index/i,
    /benchmark/i,
    /annuali[sz]/i,
    /net\s*worth/i,
    /cost\s*basis/i,
    /unreali[sz]ed/i,
    /reali[sz]ed/i,
    /simulat/i,
    /what.if/i,
    /hypothetical/i,
    /stress.test/i,
    /scenario/i
  ];

  /**
   * Short acknowledgements / greetings that are safe to let through.
   * These are so short and generic they can't carry portfolio context-bleed.
   */
  private static readonly SAFE_SMALLTALK_PATTERN =
    /^(yes|no|yeah|yep|nope|sure|ok|okay|please|thanks|thank you|go ahead|do it|sounds good|got it|right|hello|hi|hey|help)[\s?!.]*$/i;

  /**
   * Vague follow-ups that depend on prior conversation context.
   * These need history-aware routing: allowed only when the last exchange
   * was portfolio-related, otherwise ask for clarification.
   */
  private static readonly AMBIGUOUS_FOLLOWUP_PATTERN =
    /^(tell me more|more details?|explain|why|how|what do you (?:mean|think|suggest)|can you|show me|based on (?:that|this|the above)|what about (?:that|this|it)|and (?:that|this|the)|how about|what else|anything else|go on|continue|elaborate|compared? to|versus|vs|now (?:do|show|what|how|compare|analyze|check))[\s\w?!.,]*$/i;

  /**
   * Pattern to detect if an assistant message was a scope refusal.
   * Used to prevent vague follow-ups from bypassing a prior refusal.
   */
  private static readonly REFUSAL_RESPONSE_PATTERN =
    /\b(?:can.t help|cannot help|only help with|outside.{0,20}scope|can only help|portfolio.related questions)\b/i;

  private static readonly AMBIGUOUS_CLARIFICATION_RESPONSE =
    "Could you be more specific about what you'd like to do? I can help with: portfolio summaries, risk analysis, compliance checks, transaction history, market data lookups, performance comparisons, rebalancing suggestions, tax estimates, trade simulations (what-if analysis), or portfolio stress testing.";

  private static readonly SCOPE_REFUSAL_RESPONSE =
    "I can't help with that request. I'm a portfolio analysis assistant and can only help with: portfolio summaries, transaction history, risk analysis, compliance checks, market data lookups, performance comparisons, rebalancing suggestions, tax estimates, trade simulations, and stress testing. Please ask me about your portfolio and I'll be happy to help!";

  /**
   * Deterministic request router. Classifies the message into one of:
   * - ALLOW: message has clear financial/portfolio relevance → run agent
   * - REJECT: message is clearly out-of-scope → refuse with reason
   * - AMBIGUOUS: vague follow-up that needs history context to decide
   */
  private checkScopeGate(
    message: string
  ):
    | { type: 'ALLOW' }
    | { type: 'REJECT'; reason: string }
    | { type: 'AMBIGUOUS' } {
    const normalized = message.toLowerCase();

    // Check for explicit references to unknown/non-existent tools
    const toolMatch = message.match(AiService.UNKNOWN_TOOL_PATTERN);

    if (toolMatch) {
      const extractedName = toolMatch[1].toLowerCase().replace(/[_\s]/g, '_');
      const isKnown = (AGENT_ALLOWED_TOOL_NAMES as readonly string[]).some(
        (allowed) => {
          return (
            allowed.includes(extractedName) ||
            extractedName.includes(allowed.replace(/_/g, ''))
          );
        }
      );

      if (!isKnown) {
        return {
          reason: `I don't have a "${toolMatch[1]}" tool. ${AiService.SCOPE_REFUSAL_RESPONSE}`,
          type: 'REJECT'
        };
      }
    }

    // Check hard out-of-scope patterns
    for (const pattern of AiService.OUT_OF_SCOPE_PATTERNS) {
      if (normalized.includes(pattern)) {
        return { reason: AiService.SCOPE_REFUSAL_RESPONSE, type: 'REJECT' };
      }
    }

    // Check for clear financial relevance first — if present, always allow
    const hasFinancialRelevance = AiService.FINANCIAL_RELEVANCE_PATTERNS.some(
      (pattern) => pattern.test(message)
    );

    if (hasFinancialRelevance) {
      return { type: 'ALLOW' };
    }

    // Safe smalltalk (greetings, acks) — let through without history check
    if (AiService.SAFE_SMALLTALK_PATTERN.test(message.trim())) {
      return { type: 'ALLOW' };
    }

    // Vague follow-ups ("based on that", "tell me more", "explain") —
    // need history context to decide if they're valid
    if (AiService.AMBIGUOUS_FOLLOWUP_PATTERN.test(message.trim())) {
      return { type: 'AMBIGUOUS' };
    }

    // No financial relevance and not a recognized follow-up → reject
    return {
      reason:
        "Sorry, but I can only help you with financial and portfolio-related questions. Try asking about your holdings, transactions, risk analysis, market data, or other portfolio topics and I'll be happy to assist!",
      type: 'REJECT'
    };
  }

  /**
   * Builds a complete ChatResponse for a scope-gated refusal without
   * calling the agent. Still persists the exchange in conversation history.
   */
  private async buildScopedRefusal({
    conversationId,
    message,
    refusalText,
    systemPrompt,
    userId
  }: {
    conversationId?: string;
    message: string;
    refusalText: string;
    systemPrompt: string;
    userId: string;
  }): Promise<ChatResponse> {
    const verified: VerifiedResponse = {
      actions: [],
      chartData: [],
      confidence: 'high',
      elapsedMs: 0,
      estimatedCostUsd: 0,
      invokedToolNames: [],
      iterations: 0,
      response: refusalText,
      sources: [],
      status: 'completed',
      toolCalls: 0,
      warnings: []
    };

    const title = message.replace(/\s+/g, ' ').trim().slice(0, 60);

    const resolvedConversationId = await this.prismaService.$transaction(
      async (tx) => {
        let convId = conversationId;

        if (!convId) {
          const conv = await tx.chatConversation.create({
            data: { systemPrompt, title, userId },
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
            content: refusalText,
            conversationId: convId,
            estimatedCostUsd: 0,
            requestedToolNames: [],
            role: 'assistant'
          }
        });

        return convId;
      }
    );

    return { ...verified, conversationId: resolvedConversationId };
  }

  /**
   * Validates toolNames against the allowlist. Returns undefined if input is
   * undefined (agent uses all tools). Throws 400 for unknown tool names.
   */
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

  private async toMarkdownTable({
    columns,
    rows
  }: {
    columns: ColumnDescriptor[];
    rows: Record<string, string>[];
  }) {
    try {
      // Dynamic import to load ESM module from CommonJS context
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const dynamicImport = new Function('s', 'return import(s)') as (
        s: string
      ) => Promise<typeof import('tablemark')>;
      const { tablemark } = await dynamicImport('tablemark');

      return tablemark(rows, {
        columns
      });
    } catch {
      return this.getMarkdownFallback({ columns, rows });
    }
  }
}
