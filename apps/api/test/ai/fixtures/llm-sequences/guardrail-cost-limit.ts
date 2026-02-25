import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * LLM returns a response with cost exceeding the budget (costLimitUsd=0.001).
 * The first completion already busts the budget.
 */
export const guardrailCostLimit: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: 'Here is your portfolio data...',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.05 }
  }
];
