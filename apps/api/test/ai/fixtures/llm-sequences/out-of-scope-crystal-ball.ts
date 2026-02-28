import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

// No tool calls — agent declines the unknown tool request and redirects to financial analysis
export const outOfScopeCrystalBall: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I don't have a magic_crystal_ball tool available, and market prediction isn't something I'm able to assist with. I'm a financial portfolio assistant — I can only help with analysis of your existing portfolio data, such as risk assessment, compliance checks, performance benchmarking, or trade simulations. Would any of those be helpful?",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
