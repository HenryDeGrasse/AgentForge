import {
  AGENT_CIRCUIT_BREAKER_COOLDOWN_MS,
  AGENT_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  AGENT_COST_LIMIT_USD,
  AGENT_FALLBACK_COST_PER_1K_TOKENS_USD,
  AGENT_MAX_ITERATIONS,
  AGENT_TIMEOUT_MS,
  AGENT_TOOL_OUTPUT_MAX_CHARS
} from '@ghostfolio/api/app/endpoints/ai/agent/agent.constants';
import {
  LLM_CLIENT_TOKEN,
  LLMClient,
  LLMCompletionResponse,
  LLMMessage,
  LLMToolCall,
  LLMToolDefinition
} from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
import { ToolRegistry } from '@ghostfolio/api/app/endpoints/ai/tools/tool.registry';
import { ToolResultEnvelope } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { summarizeToolOutput } from '@ghostfolio/api/app/endpoints/ai/tools/utils/tool-summarizers';
import type { SseEvent } from '@ghostfolio/common/interfaces';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export class AgentTimeoutError extends Error {
  constructor(message = 'The agent exceeded its timeout budget.') {
    super(message);
    this.name = 'AgentTimeoutError';
  }
}

export type AgentGuardrailType =
  | 'CIRCUIT_BREAKER'
  | 'COST_LIMIT'
  | 'MAX_ITERATIONS'
  | 'TIMEOUT';

export interface ReactAgentGuardrails {
  circuitBreakerCooldownMs: number;
  circuitBreakerFailureThreshold: number;
  costLimitUsd: number;
  fallbackCostPer1kTokensUsd: number;
  maxIterations: number;
  timeoutMs: number;
}

export interface ReactAgentRunInput {
  guardrails?: Partial<ReactAgentGuardrails>;
  priorMessages?: LLMMessage[]; // rehydrated conversation history (already capped by caller)
  prompt: string;
  requestId?: string;
  signal?: AbortSignal;
  systemPrompt?: string;
  toolNames?: string[];
  userId: string;
}

/** Internal event yielded at the end of runStreaming() to pass the final result. */
export interface SseAgentDoneEvent {
  type: '_agent_done';
  result: ReactAgentRunResult;
}

export type AgentStreamEvent = SseAgentDoneEvent | SseEvent;

export interface ExecutedToolEntry {
  envelope: ToolResultEnvelope;
  toolName: string;
}

export interface ReactAgentRunResult {
  elapsedMs: number;
  estimatedCostUsd: number;
  executedTools: ExecutedToolEntry[];
  guardrail?: AgentGuardrailType;
  iterations: number;
  response: string;
  status: 'completed' | 'failed' | 'partial';
  toolCalls: number;
}

interface CircuitBreakerState {
  consecutiveFailures: number;
  openedAt: number;
  state: 'closed' | 'half_open' | 'open';
}

@Injectable()
export class ReactAgentService {
  private circuitBreaker: CircuitBreakerState = {
    consecutiveFailures: 0,
    openedAt: 0,
    state: 'closed'
  };

  private readonly fallbackToolRegistry = new ToolRegistry();

  public constructor(
    @Inject(LLM_CLIENT_TOKEN) private readonly llmClient: LLMClient,
    @Optional() private readonly toolRegistry?: ToolRegistry
  ) {}

  /**
   * Consumes runStreaming() and returns the final result.
   * Single execution path — no logic drift.
   */
  public async run(input: ReactAgentRunInput): Promise<ReactAgentRunResult> {
    const requestId = input.requestId ?? randomUUID();
    let result: ReactAgentRunResult | undefined;

    for await (const event of this.runStreaming({ ...input, requestId })) {
      if (event.type === '_agent_done') {
        result = (event as SseAgentDoneEvent).result;
      }
    }

    return result!;
  }

  /**
   * Core execution engine. Yields typed SSE events during the ReAct loop,
   * ending with an internal `_agent_done` event containing the final result.
   */
  public async *runStreaming(
    input: ReactAgentRunInput
  ): AsyncIterable<AgentStreamEvent> {
    const guardrails = this.getGuardrails(input.guardrails);
    const requestId = input.requestId ?? randomUUID();
    const startedAt = Date.now();
    const signal = input.signal;
    let finalResult: ReactAgentRunResult | undefined;

    const doneEvent = (result: ReactAgentRunResult): SseAgentDoneEvent => {
      finalResult = result;

      return {
        result,
        type: '_agent_done'
      };
    };

    if (this.isCircuitBreakerOpen(guardrails, startedAt)) {
      yield doneEvent(
        this.buildGuardrailResult({
          estimatedCostUsd: 0,
          executedTools: [],
          guardrail: 'CIRCUIT_BREAKER',
          iterations: 0,
          startedAt,
          toolCalls: 0
        })
      );

      return;
    }

    const messages: LLMMessage[] = [];

    if (input.systemPrompt?.trim()) {
      messages.push({ content: input.systemPrompt, role: 'system' });
    }

    if (input.priorMessages?.length) {
      messages.push(...input.priorMessages);
    }

    messages.push({ content: input.prompt, role: 'user' });

    const toolRegistry = this.getToolRegistry();
    const tools = toolRegistry.list(input.toolNames);
    const toolDefinitions: LLMToolDefinition[] = tools.map(
      ({ description, inputSchema, name }): LLMToolDefinition => ({
        description,
        inputSchema: inputSchema as unknown as Record<string, unknown>,
        name
      })
    );
    const executedToolResults: ExecutedToolEntry[] = [];
    let estimatedCostUsd = 0;
    let consecutiveDuplicateToolCalls = 0;
    let escalationAttempted = false;
    let escalationPending = false;
    let iterationCount = 0;
    let lastToolSignature: string | null = null;
    let toolCallsCount = 0;

    try {
      for (
        let iteration = 1;
        iteration <= guardrails.maxIterations;
        iteration++
      ) {
        iterationCount = iteration;

        // Check abort signal before each iteration
        if (signal?.aborted) {
          yield doneEvent({
            elapsedMs: Date.now() - startedAt,
            estimatedCostUsd: this.roundCost(estimatedCostUsd),
            executedTools: executedToolResults,
            iterations: iterationCount,
            response: 'Request was cancelled.',
            status: 'partial',
            toolCalls: toolCallsCount
          });

          return;
        }

        // Emit thinking event
        yield {
          type: 'thinking',
          iteration,
          maxIterations: guardrails.maxIterations
        };

        if (this.hasTimedOut(startedAt, guardrails.timeoutMs)) {
          this.recordSuccess();

          yield doneEvent(
            this.buildGuardrailResult({
              estimatedCostUsd,
              executedTools: executedToolResults,
              guardrail: 'TIMEOUT',
              iterations: iterationCount,
              startedAt,
              toolCalls: toolCallsCount
            })
          );

          return;
        }

        if (estimatedCostUsd >= guardrails.costLimitUsd) {
          this.recordSuccess();

          yield doneEvent(
            this.buildGuardrailResult({
              estimatedCostUsd,
              executedTools: executedToolResults,
              guardrail: 'COST_LIMIT',
              iterations: iterationCount,
              startedAt,
              toolCalls: toolCallsCount
            })
          );

          return;
        }

        const toolChoice = escalationPending ? 'required' : 'auto';

        // Use streaming LLM if available, otherwise fall back to non-streaming
        let completion: LLMCompletionResponse;

        if (this.llmClient.completeStream) {
          completion = yield* this.streamLlmCompletion(
            messages,
            toolDefinitions,
            toolChoice,
            guardrails,
            startedAt,
            signal
          );
        } else {
          completion = await this.withTimeout(
            this.llmClient.complete({
              messages,
              temperature: 0,
              ...(toolDefinitions.length
                ? { toolChoice, tools: toolDefinitions }
                : {})
            }),
            this.getRemainingTime(startedAt, guardrails.timeoutMs)
          );
        }

        estimatedCostUsd += this.getEstimatedCostUsd(completion, guardrails);

        if (escalationPending) {
          escalationPending = false;
        }

        if (estimatedCostUsd > guardrails.costLimitUsd) {
          this.recordSuccess();

          yield doneEvent(
            this.buildGuardrailResult({
              estimatedCostUsd,
              executedTools: executedToolResults,
              guardrail: 'COST_LIMIT',
              iterations: iterationCount,
              startedAt,
              toolCalls: toolCallsCount
            })
          );

          return;
        }

        if (completion.toolCalls.length > 0) {
          toolCallsCount += completion.toolCalls.length;

          // Duplicate tool-call loop detection
          const currentSignature = JSON.stringify(
            completion.toolCalls.map((tc) => ({
              args: tc.arguments,
              name: tc.name
            }))
          );

          if (currentSignature === lastToolSignature) {
            consecutiveDuplicateToolCalls++;
          } else {
            consecutiveDuplicateToolCalls = 1;
            lastToolSignature = currentSignature;
          }

          if (consecutiveDuplicateToolCalls >= 3) {
            this.recordSuccess();

            yield doneEvent({
              elapsedMs: Date.now() - startedAt,
              estimatedCostUsd: this.roundCost(estimatedCostUsd),
              executedTools: executedToolResults,
              iterations: iterationCount,
              response:
                'The assistant could not make progress and stopped to avoid repeating the same action.',
              status: 'partial',
              toolCalls: toolCallsCount
            });

            return;
          }

          messages.push({
            content: completion.text ?? '',
            role: 'assistant',
            toolCalls: completion.toolCalls
          });

          // Check abort before tool execution
          if (signal?.aborted) {
            yield doneEvent({
              elapsedMs: Date.now() - startedAt,
              estimatedCostUsd: this.roundCost(estimatedCostUsd),
              executedTools: executedToolResults,
              iterations: iterationCount,
              response: 'Request was cancelled.',
              status: 'partial',
              toolCalls: toolCallsCount
            });

            return;
          }

          // Emit tool_call events for all tools before starting parallel execution
          for (const toolCall of completion.toolCalls) {
            yield {
              type: 'tool_call',
              toolName: toolCall.name,
              iteration
            };
          }

          // Execute all tool calls from this LLM turn in parallel.
          // Individual tool errors are caught inside executeToolCall and
          // returned as error envelopes so that one failing tool does not
          // prevent the others from running.
          const toolResults = await Promise.all(
            completion.toolCalls.map((toolCall) =>
              this.executeToolCall({
                requestId,
                startedAt,
                timeoutMs: guardrails.timeoutMs,
                toolCall,
                toolRegistry,
                userId: input.userId
              })
            )
          );

          // Collect results: push tool messages, accumulate executed tools,
          // emit tool_result events (order matches the original toolCalls order).
          for (let i = 0; i < completion.toolCalls.length; i++) {
            const toolCall = completion.toolCalls[i];
            const { envelope, message: toolMessage } = toolResults[i];

            messages.push(toolMessage);
            executedToolResults.push({
              envelope,
              toolName: toolCall.name
            });

            yield {
              type: 'tool_result',
              toolName: toolCall.name,
              status: envelope.status === 'success' ? 'success' : 'error',
              summary: this.summarizeToolResult(toolCall.name, envelope)
            };
          }

          continue;
        }

        if (completion.text?.trim()) {
          const responseText = completion.text.trim();

          // Detect unbacked portfolio claims: the LLM is making specific
          // assertions about the user's portfolio data without having called
          // any tools to fetch that data. This is the only scenario where
          // escalation (forcing tool use) is appropriate.
          //
          // We intentionally do NOT detect "refusals" (negative) because the
          // LLM can refuse in countless ways. Instead we detect the positive
          // signal: portfolio-specific claims that should be backed by tools.
          //
          // The pattern requires a concrete assertion (verb + predicate),
          // not just a mention of "portfolio" (which could be a greeting
          // like "How can I help with your portfolio?").
          const looksLikeUnbackedPortfolioClaim =
            toolCallsCount === 0 &&
            /\b(?:your portfolio (?:is|has|shows|contains|looks|total|value|worth)|your holdings (?:are|include|show|consist)|total value (?:is|of)|net worth (?:is|of)|worth (?:about |approximately )?\$[\d,]+|(?:you have|you own|you hold) [\d]+ (?:share|position|holding|stock|asset)|(?:portfolio|account) (?:is worth|has a|total is|value is|contains)|(?:gain|loss|return) of [\d.]+%|risk (?:score|level|rating) (?:is|of) |(?:compliant|non-compliant) with|(?:tax liability|tax estimate) (?:is|of)|your (?:allocation is|exposure is|positions? (?:are|include)))\b/i.test(
              responseText
            );

          if (
            toolDefinitions.length > 0 &&
            looksLikeUnbackedPortfolioClaim &&
            !escalationAttempted
          ) {
            escalationAttempted = true;
            escalationPending = true;

            messages.push({ content: responseText, role: 'assistant' });
            messages.push({
              content:
                "You appear to be making claims about the user's portfolio without calling any tools to verify. Please call the appropriate tool to get real data, or if the request is outside your scope, decline politely.",
              role: 'user'
            });

            continue;
          }

          this.recordSuccess();

          yield doneEvent({
            elapsedMs: Date.now() - startedAt,
            estimatedCostUsd: this.roundCost(estimatedCostUsd),
            executedTools: executedToolResults,
            iterations: iterationCount,
            response: responseText,
            status: 'completed',
            toolCalls: toolCallsCount
          });

          return;
        }
      }

      this.recordSuccess();

      yield doneEvent(
        this.buildGuardrailResult({
          estimatedCostUsd,
          executedTools: executedToolResults,
          guardrail: 'MAX_ITERATIONS',
          iterations: guardrails.maxIterations,
          startedAt,
          toolCalls: toolCallsCount
        })
      );
    } catch (error) {
      if (error instanceof AgentTimeoutError) {
        this.recordSuccess();

        yield doneEvent(
          this.buildGuardrailResult({
            estimatedCostUsd,
            executedTools: executedToolResults,
            guardrail: 'TIMEOUT',
            iterations: iterationCount,
            startedAt,
            toolCalls: toolCallsCount
          })
        );

        return;
      }

      Logger.error(
        `ReactAgentService run failed: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
        'ReactAgentService'
      );

      this.recordFailure(guardrails, Date.now());

      yield doneEvent({
        elapsedMs: Date.now() - startedAt,
        estimatedCostUsd: this.roundCost(estimatedCostUsd),
        executedTools: executedToolResults,
        iterations: iterationCount,
        response:
          'The AI assistant is temporarily unavailable. Please try again shortly.',
        status: 'failed',
        toolCalls: toolCallsCount
      });
    } finally {
      if (finalResult) {
        this.emitTelemetry(finalResult, requestId);
      }
    }
  }

  /**
   * Streams an LLM completion, yielding response_chunk events for text deltas.
   * Returns the accumulated LLMCompletionResponse.
   */
  private async *streamLlmCompletion(
    messages: LLMMessage[],
    toolDefinitions: LLMToolDefinition[],
    toolChoice: 'auto' | 'none' | 'required',
    _guardrails: ReactAgentGuardrails,
    _startedAt: number,
    signal?: AbortSignal
  ): AsyncGenerator<SseEvent, LLMCompletionResponse> {
    let fullText = '';
    let finishReason: LLMCompletionResponse['finishReason'] = 'unknown';
    let toolCalls: LLMToolCall[] = [];
    let usage: LLMCompletionResponse['usage'];

    const stream = this.llmClient.completeStream!(
      {
        messages,
        temperature: 0,
        ...(toolDefinitions.length
          ? { toolChoice, tools: toolDefinitions }
          : {})
      },
      signal
    );

    for await (const chunk of stream) {
      if (signal?.aborted) {
        break;
      }

      if (chunk.delta) {
        fullText += chunk.delta;
        yield { type: 'response_chunk', text: chunk.delta };
      }

      if (chunk.finishReason) {
        finishReason = chunk.finishReason;
      }

      if (chunk.toolCalls) {
        toolCalls = chunk.toolCalls;
      }

      if (chunk.usage) {
        usage = chunk.usage;
      }
    }

    return {
      finishReason,
      text: fullText,
      toolCalls,
      ...(usage ? { usage } : {})
    };
  }

  private buildGuardrailResult({
    estimatedCostUsd,
    executedTools,
    guardrail,
    iterations,
    startedAt,
    toolCalls
  }: {
    estimatedCostUsd: number;
    executedTools: ExecutedToolEntry[];
    guardrail: AgentGuardrailType;
    iterations: number;
    startedAt: number;
    toolCalls: number;
  }): ReactAgentRunResult {
    const responseByGuardrail: Record<AgentGuardrailType, string> = {
      CIRCUIT_BREAKER:
        'The assistant is temporarily paused due to upstream instability. Please try again shortly.',
      COST_LIMIT:
        'The assistant stopped because the cost budget was reached. Please refine your question.',
      MAX_ITERATIONS:
        'The assistant reached its reasoning step limit. Please narrow your request and try again.',
      TIMEOUT:
        'The assistant stopped because the request exceeded the time budget. Please try a shorter question.'
    };

    return {
      elapsedMs: Date.now() - startedAt,
      estimatedCostUsd: this.roundCost(estimatedCostUsd),
      executedTools,
      guardrail,
      iterations,
      response: responseByGuardrail[guardrail],
      status: 'partial',
      toolCalls
    };
  }

  private async executeToolCall({
    requestId,
    startedAt,
    timeoutMs,
    toolCall,
    toolRegistry,
    userId
  }: {
    requestId: string;
    startedAt: number;
    timeoutMs: number;
    toolCall: LLMToolCall;
    toolRegistry: ToolRegistry;
    userId: string;
  }): Promise<{ envelope: ToolResultEnvelope; message: LLMMessage }> {
    try {
      const toolResponse = await this.withTimeout(
        toolRegistry.execute({
          context: {
            requestId,
            userId
          },
          input: toolCall.arguments,
          name: toolCall.name
        }),
        this.getRemainingTime(startedAt, timeoutMs)
      );

      // Normalise to ToolResultEnvelope
      const envelope: ToolResultEnvelope =
        typeof toolResponse === 'object' &&
        toolResponse !== null &&
        'status' in toolResponse
          ? (toolResponse as unknown as ToolResultEnvelope)
          : {
              data: toolResponse as unknown as Record<string, unknown>,
              status: 'success'
            };

      // Context-window guard: summarize + truncate oversized tool output
      // before injecting it into the LLM conversation. Without this a single
      // large response (e.g. a full transaction history) can silently overflow
      // the context window, causing the LLM to error or produce garbled answers.
      const TRUNCATION_SUFFIX =
        '\n[TRUNCATED: tool output exceeded the context window limit]';

      const rawContent = summarizeToolOutput(
        toolCall.name,
        // Pass data-only to the summarizer for human-readable output, but
        // embed the full toolResponse (envelope) as the raw JSON so that
        // downstream toolEnvelope checks can still find status/error fields.
        envelope.data ?? toolResponse,
        toolResponse
      );

      const content =
        rawContent.length > AGENT_TOOL_OUTPUT_MAX_CHARS
          ? rawContent.slice(
              0,
              AGENT_TOOL_OUTPUT_MAX_CHARS - TRUNCATION_SUFFIX.length
            ) + TRUNCATION_SUFFIX
          : rawContent;

      return {
        envelope,
        message: {
          content,
          name: toolCall.name,
          role: 'tool',
          toolCallId: toolCall.id
        }
      };
    } catch (error) {
      if (error instanceof AgentTimeoutError) {
        throw error;
      }

      const errorEnvelope: ToolResultEnvelope = {
        error: {
          code: 'tool_registry_failure',
          message: this.getErrorMessage(error)
        },
        status: 'error'
      };

      return {
        envelope: errorEnvelope,
        message: {
          content: JSON.stringify(errorEnvelope),
          name: toolCall.name,
          role: 'tool',
          toolCallId: toolCall.id
        }
      };
    }
  }

  private getErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown tool execution error.';
  }

  private getEstimatedCostUsd(
    completion: LLMCompletionResponse,
    guardrails: ReactAgentGuardrails
  ) {
    if (completion.usage?.estimatedCostUsd !== undefined) {
      return completion.usage.estimatedCostUsd;
    }

    const totalTokens = completion.usage?.totalTokens;

    if (totalTokens !== undefined) {
      return this.tokensToCost(
        totalTokens,
        guardrails.fallbackCostPer1kTokensUsd
      );
    }

    if (
      completion.usage?.promptTokens !== undefined &&
      completion.usage.completionTokens !== undefined
    ) {
      return this.tokensToCost(
        completion.usage.promptTokens + completion.usage.completionTokens,
        guardrails.fallbackCostPer1kTokensUsd
      );
    }

    return 0;
  }

  private getGuardrails(
    guardrails?: Partial<ReactAgentGuardrails>
  ): ReactAgentGuardrails {
    return {
      circuitBreakerCooldownMs: this.getPositiveNumber(
        guardrails?.circuitBreakerCooldownMs,
        AGENT_CIRCUIT_BREAKER_COOLDOWN_MS
      ),
      circuitBreakerFailureThreshold: this.getPositiveNumber(
        guardrails?.circuitBreakerFailureThreshold,
        AGENT_CIRCUIT_BREAKER_FAILURE_THRESHOLD
      ),
      costLimitUsd: this.getPositiveNumber(
        guardrails?.costLimitUsd,
        AGENT_COST_LIMIT_USD
      ),
      fallbackCostPer1kTokensUsd: this.getPositiveNumber(
        guardrails?.fallbackCostPer1kTokensUsd,
        AGENT_FALLBACK_COST_PER_1K_TOKENS_USD
      ),
      maxIterations: this.getPositiveNumber(
        guardrails?.maxIterations,
        AGENT_MAX_ITERATIONS
      ),
      timeoutMs: this.getPositiveNumber(guardrails?.timeoutMs, AGENT_TIMEOUT_MS)
    };
  }

  private getPositiveNumber(value: number | undefined, fallback: number) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }

    return fallback;
  }

  private getToolRegistry() {
    return this.toolRegistry ?? this.fallbackToolRegistry;
  }

  private getRemainingTime(startedAt: number, timeoutMs: number) {
    const elapsedMs = Date.now() - startedAt;

    if (elapsedMs >= timeoutMs) {
      throw new AgentTimeoutError('The agent exceeded its timeout budget.');
    }

    return timeoutMs - elapsedMs;
  }

  private hasTimedOut(startedAt: number, timeoutMs: number) {
    return Date.now() - startedAt >= timeoutMs;
  }

  private isCircuitBreakerOpen(
    guardrails: ReactAgentGuardrails,
    now: number
  ): boolean {
    if (this.circuitBreaker.state !== 'open') {
      return false;
    }

    if (
      now - this.circuitBreaker.openedAt <
      guardrails.circuitBreakerCooldownMs
    ) {
      return true;
    }

    this.circuitBreaker.state = 'half_open';

    return false;
  }

  private recordFailure(guardrails: ReactAgentGuardrails, now: number) {
    if (this.circuitBreaker.state === 'half_open') {
      this.circuitBreaker = {
        consecutiveFailures: guardrails.circuitBreakerFailureThreshold,
        openedAt: now,
        state: 'open'
      };

      return;
    }

    const consecutiveFailures = this.circuitBreaker.consecutiveFailures + 1;

    this.circuitBreaker.consecutiveFailures = consecutiveFailures;

    if (consecutiveFailures >= guardrails.circuitBreakerFailureThreshold) {
      this.circuitBreaker.openedAt = now;
      this.circuitBreaker.state = 'open';
    }
  }

  private recordSuccess() {
    this.circuitBreaker = {
      consecutiveFailures: 0,
      openedAt: 0,
      state: 'closed'
    };
  }

  /**
   * Emits a structured JSON telemetry log after every agent run.
   *
   * Log fields:
   *  - status / guardrail  — outcome classification
   *  - toolCalls / iterations — reasoning depth
   *  - estimatedCostUsd / elapsedMs — cost & latency
   *  - requestId — correlation ID for log tracing
   *
   * userId is intentionally omitted from telemetry to avoid PII in logs.
   */
  private emitTelemetry(result: ReactAgentRunResult, requestId: string): void {
    const record: Record<string, unknown> = {
      elapsedMs: result.elapsedMs,
      estimatedCostUsd: result.estimatedCostUsd,
      iterations: result.iterations,
      requestId,
      status: result.status,
      toolCalls: result.toolCalls
    };

    if (result.guardrail) {
      record['guardrail'] = result.guardrail;
    }

    Logger.log(JSON.stringify(record), 'ReactAgentService');
  }

  private summarizeToolResult(
    toolName: string,
    envelope: ToolResultEnvelope
  ): string {
    if (envelope.status !== 'success') {
      return `${toolName} encountered an error.`;
    }

    const data = envelope.data;

    if (!data || typeof data !== 'object') {
      return `${toolName} completed successfully.`;
    }

    const keys = Object.keys(data);

    if (keys.length === 0) {
      return `${toolName} returned no data.`;
    }

    return `${toolName} returned ${keys.length} field(s).`;
  }

  private roundCost(value: number) {
    return Number(value.toFixed(6));
  }

  private tokensToCost(totalTokens: number, costPer1kTokensUsd: number) {
    return (totalTokens / 1000) * costPer1kTokensUsd;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    if (timeoutMs <= 0) {
      throw new AgentTimeoutError('The agent exceeded its timeout budget.');
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(() => {
            reject(
              new AgentTimeoutError('The agent exceeded its timeout budget.')
            );
          }, timeoutMs);
        })
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
