import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const edgeBoundaryDateRange: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { startDate: '2021-01-01', endDate: '2021-12-31' },
        id: 'tc-1',
        name: 'get_transaction_history'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: "I searched your transaction history for the period around 5 years ago (January–December 2021). The results show no transactions found for that period — your earliest recorded activity appears to be from 2023. If you'd like to see your complete transaction history, I can show recent activity instead.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
