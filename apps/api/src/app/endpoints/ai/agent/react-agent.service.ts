import {
  AGENT_CIRCUIT_BREAKER_COOLDOWN_MS,
  AGENT_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  AGENT_COST_LIMIT_USD,
  AGENT_FALLBACK_COST_PER_1K_TOKENS_USD,
  AGENT_MAX_ITERATIONS,
  AGENT_TIMEOUT_MS
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

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

class AgentTimeoutError extends Error {}

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
  systemPrompt?: string;
  toolNames?: string[];
  userId: string;
}

export interface ReactAgentRunResult {
  elapsedMs: number;
  estimatedCostUsd: number;
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

  public async run(input: ReactAgentRunInput): Promise<ReactAgentRunResult> {
    const guardrails = this.getGuardrails(input.guardrails);
    const startedAt = Date.now();

    if (this.isCircuitBreakerOpen(guardrails, startedAt)) {
      return this.buildGuardrailResult({
        estimatedCostUsd: 0,
        guardrail: 'CIRCUIT_BREAKER',
        iterations: 0,
        startedAt,
        toolCalls: 0
      });
    }

    const messages: LLMMessage[] = [];

    if (input.systemPrompt?.trim()) {
      messages.push({ content: input.systemPrompt, role: 'system' });
    }

    // Inject prior conversation turns (history cap enforced by caller)
    if (input.priorMessages?.length) {
      messages.push(...input.priorMessages);
    }

    messages.push({ content: input.prompt, role: 'user' });

    const toolRegistry = this.getToolRegistry();
    const tools = toolRegistry.list(input.toolNames);
    let estimatedCostUsd = 0;
    let iterationCount = 0;
    let toolCallsCount = 0;

    try {
      for (
        let iteration = 1;
        iteration <= guardrails.maxIterations;
        iteration++
      ) {
        iterationCount = iteration;

        if (this.hasTimedOut(startedAt, guardrails.timeoutMs)) {
          this.recordSuccess();

          return this.buildGuardrailResult({
            estimatedCostUsd,
            guardrail: 'TIMEOUT',
            iterations: iterationCount,
            startedAt,
            toolCalls: toolCallsCount
          });
        }

        if (estimatedCostUsd >= guardrails.costLimitUsd) {
          this.recordSuccess();

          return this.buildGuardrailResult({
            estimatedCostUsd,
            guardrail: 'COST_LIMIT',
            iterations: iterationCount,
            startedAt,
            toolCalls: toolCallsCount
          });
        }

        const completion = await this.withTimeout(
          this.llmClient.complete({
            messages,
            temperature: 0,
            ...(tools.length
              ? {
                  toolChoice: 'auto',
                  tools: tools.map(
                    ({ description, inputSchema, name }): LLMToolDefinition => {
                      return {
                        description,
                        inputSchema: inputSchema as unknown as Record<
                          string,
                          unknown
                        >,
                        name
                      };
                    }
                  )
                }
              : {})
          }),
          this.getRemainingTime(startedAt, guardrails.timeoutMs)
        );

        estimatedCostUsd += this.getEstimatedCostUsd(completion, guardrails);

        if (estimatedCostUsd > guardrails.costLimitUsd) {
          this.recordSuccess();

          return this.buildGuardrailResult({
            estimatedCostUsd,
            guardrail: 'COST_LIMIT',
            iterations: iterationCount,
            startedAt,
            toolCalls: toolCallsCount
          });
        }

        if (completion.toolCalls.length > 0) {
          toolCallsCount += completion.toolCalls.length;

          messages.push({
            content: completion.text ?? '',
            role: 'assistant',
            toolCalls: completion.toolCalls
          });

          for (const toolCall of completion.toolCalls) {
            const toolMessage = await this.executeToolCall({
              startedAt,
              timeoutMs: guardrails.timeoutMs,
              toolCall,
              toolRegistry,
              userId: input.userId
            });

            messages.push(toolMessage);
          }

          continue;
        }

        if (completion.text?.trim()) {
          this.recordSuccess();

          return {
            elapsedMs: Date.now() - startedAt,
            estimatedCostUsd: this.roundCost(estimatedCostUsd),
            iterations: iterationCount,
            response: completion.text.trim(),
            status: 'completed',
            toolCalls: toolCallsCount
          };
        }
      }

      this.recordSuccess();

      return this.buildGuardrailResult({
        estimatedCostUsd,
        guardrail: 'MAX_ITERATIONS',
        iterations: guardrails.maxIterations,
        startedAt,
        toolCalls: toolCallsCount
      });
    } catch (error) {
      if (error instanceof AgentTimeoutError) {
        this.recordSuccess();

        return this.buildGuardrailResult({
          estimatedCostUsd,
          guardrail: 'TIMEOUT',
          iterations: iterationCount,
          startedAt,
          toolCalls: toolCallsCount
        });
      }

      Logger.error(
        `ReactAgentService run failed: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
        'ReactAgentService'
      );

      this.recordFailure(guardrails, Date.now());

      return {
        elapsedMs: Date.now() - startedAt,
        estimatedCostUsd: this.roundCost(estimatedCostUsd),
        iterations: iterationCount,
        response:
          'The AI assistant is temporarily unavailable. Please try again shortly.',
        status: 'failed',
        toolCalls: toolCallsCount
      };
    }
  }

  private buildGuardrailResult({
    estimatedCostUsd,
    guardrail,
    iterations,
    startedAt,
    toolCalls
  }: {
    estimatedCostUsd: number;
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
      guardrail,
      iterations,
      response: responseByGuardrail[guardrail],
      status: 'partial',
      toolCalls
    };
  }

  private async executeToolCall({
    startedAt,
    timeoutMs,
    toolCall,
    toolRegistry,
    userId
  }: {
    startedAt: number;
    timeoutMs: number;
    toolCall: LLMToolCall;
    toolRegistry: ToolRegistry;
    userId: string;
  }): Promise<LLMMessage> {
    try {
      const toolResponse = await this.withTimeout(
        toolRegistry.execute({
          context: {
            userId
          },
          input: toolCall.arguments,
          name: toolCall.name
        }),
        this.getRemainingTime(startedAt, timeoutMs)
      );

      return {
        content: JSON.stringify(toolResponse),
        name: toolCall.name,
        role: 'tool',
        toolCallId: toolCall.id
      };
    } catch (error) {
      if (error instanceof AgentTimeoutError) {
        throw error;
      }

      return {
        content: JSON.stringify({
          error: {
            code: 'tool_registry_failure',
            message: this.getErrorMessage(error)
          },
          status: 'error'
        }),
        name: toolCall.name,
        role: 'tool',
        toolCallId: toolCall.id
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
