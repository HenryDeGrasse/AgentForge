import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const advMathQuestion: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I'm a financial portfolio assistant and only handle investment and portfolio analysis questions. For general math, you'd need a different tool. I can help with financial calculations like portfolio returns, risk metrics, or tax estimates — just let me know if you'd like any of those!",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
