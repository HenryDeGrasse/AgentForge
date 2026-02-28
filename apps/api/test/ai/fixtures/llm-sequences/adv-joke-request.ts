import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const advJokeRequest: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I'm sorry, but telling jokes is outside my capabilities. I can only help with portfolio and financial analysis. Would you like me to summarize your portfolio, check compliance, or analyze risk instead?",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
