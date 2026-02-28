import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const malformedQueryGibberish: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "That doesn't look like a clear question — could you rephrase what you'd like to know? I'm a financial portfolio assistant and can only help with investment topics such as portfolio summaries, risk analysis, performance comparisons, compliance checks, tax estimates, rebalancing, and trade simulations.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
