import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richTransactionHistory: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'get_transaction_history' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'You have 30 transactions in total. Your most recent activity includes buy orders across 4 symbols. The total buy value is $9,500 with no sell transactions recorded.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
