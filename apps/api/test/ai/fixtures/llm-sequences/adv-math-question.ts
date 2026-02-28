import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const advMathQuestion: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I'm sorry, but solving math problems is outside my capabilities. I can only help with portfolio and financial analysis. Would you like me to analyze your portfolio instead?",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
