import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const edgeEmptyPortfolioRebalance: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: "Your portfolio appears to have no holdings yet. There's nothing to rebalance at this time. Once you add your first investment, I can provide rebalancing suggestions based on your target allocation.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
