import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const outOfScopeCrystalBall: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I'm sorry, but I can't predict the future of the stock market. I don't have a magic crystal ball tool, and market predictions are outside my scope. I can only help with portfolio-related analysis such as summarizing positions, analyzing risk, checking compliance, comparing performance, estimating taxes, suggesting rebalancing, simulating trades, and running stress tests.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
