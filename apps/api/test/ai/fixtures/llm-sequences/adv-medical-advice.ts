import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const advMedicalAdvice: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I'm sorry, but providing medical advice is outside my capabilities. I can only help with portfolio and financial analysis. Please consult a healthcare professional for medical questions.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
