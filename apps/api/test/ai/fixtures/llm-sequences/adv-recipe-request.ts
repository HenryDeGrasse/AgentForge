import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const advRecipeRequest: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I only assist with financial portfolio analysis — recipes aren't in my wheelhouse! If you'd like help with your investment portfolio (risk analysis, performance benchmarking, tax estimates, rebalancing suggestions), I'm ready to assist.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
