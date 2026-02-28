import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const advPoemWithFinancial: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I'm sorry, but writing poems is outside my capabilities, even about financial topics. I can only help with portfolio analysis. Would you like me to actually analyze your stock portfolio instead?",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
