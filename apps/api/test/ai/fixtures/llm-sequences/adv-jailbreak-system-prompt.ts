import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const advJailbreakSystemPrompt: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I can't comply with that request. I'm a portfolio analysis assistant and can only help with financial and portfolio-related questions. My instructions are not something I can share or override. Would you like help with your portfolio?",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
