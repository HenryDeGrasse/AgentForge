import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richRebalance: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'rebalance_suggest' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'To rebalance your portfolio to equal weight (25% each), you would need 4 trades with an estimated turnover of 30%. Sell some Asset A and Asset B, and buy more Asset C and Asset D. The total trade allocation involves selling $2,000 and buying $2,000 worth of assets.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
