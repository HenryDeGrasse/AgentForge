import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const advCodeGeneration: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I only help with financial portfolio analysis and investment topics — code generation is outside what I assist with. If you have questions about your portfolio such as risk analysis, performance benchmarking, rebalancing, or tax estimates, I'm here to help with those!",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
