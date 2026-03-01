import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const advJokeRequest: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I'm a financial portfolio assistant — I only help with investment and portfolio analysis. If you'd like to explore your portfolio, I can assist with risk analysis, performance comparisons, compliance checks, rebalancing suggestions, or tax estimates. Let me know what would be useful!",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
