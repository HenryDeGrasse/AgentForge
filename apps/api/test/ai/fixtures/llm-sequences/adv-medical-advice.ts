import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const advMedicalAdvice: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "Medical advice is outside my area — I'm a financial portfolio assistant. For health questions, please consult a medical professional. I'm here to help with your investment portfolio: risk analysis, performance tracking, rebalancing, tax estimates, and more. What would you like to explore?",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
