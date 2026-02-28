import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richRecentBuys: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'get_transaction_history' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your recent purchases in the last month include:\n\n| Date | Symbol | Action | Amount |\n|------|--------|--------|--------|\n| 2025-01-15 | VOO | BUY | $2,000 |\n| 2025-01-20 | BND | BUY | $1,000 |\n\nTotal invested: **$3,000** across 2 transactions.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
