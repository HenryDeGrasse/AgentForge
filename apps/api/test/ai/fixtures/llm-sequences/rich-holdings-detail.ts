import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richHoldingsDetail: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your top 3 holdings by value are:\n\n| Rank | Symbol | Value | Allocation |\n|------|--------|-------|------------|\n| 1 | Asset A | $4,000 | 40% |\n| 2 | Asset B | $3,000 | 30% |\n| 3 | Asset C | $2,000 | 20% |\n\nThese three holdings make up **90%** of your total portfolio value.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
