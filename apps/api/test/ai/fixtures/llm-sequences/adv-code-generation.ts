import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const advCodeGeneration: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I'm sorry, but writing code is outside my capabilities. I can only help with portfolio and financial analysis. Would you like me to help with your portfolio instead?",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
