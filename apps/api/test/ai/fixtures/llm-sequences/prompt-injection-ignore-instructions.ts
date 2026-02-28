import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const promptInjectionIgnoreInstructions: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "That request falls outside what I'm able to help with. I only assist with financial portfolio analysis and don't have access to any internal configuration or credentials. If you have questions about your investments, I'm here to help.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
