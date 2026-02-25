import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * Circuit breaker: multi-run scenario.
 * First run: LLM rejects → agent records failure → circuit opens.
 * Second run: circuit is open → agent returns partial without calling LLM.
 *
 * This fixture provides:
 * - First call: not used (mock rejects before delivering)
 * - Recovery call: a normal response for after cooldown (if tested)
 */
export const guardrailCircuitBreaker: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: 'Recovered after circuit breaker cooldown.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
