import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const advPoemRequest: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I'm sorry, but writing poems is outside my capabilities. I can only help with portfolio and financial analysis, including: portfolio summaries, risk analysis, compliance checks, transaction history, market data, performance comparisons, rebalancing suggestions, tax estimates, trade simulations, and stress testing. Would you like help with any of these?",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
