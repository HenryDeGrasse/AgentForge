import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richTransactionHistory: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { pageSize: 10 },
        id: 'tc-1',
        name: 'get_transaction_history'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Here are your recent transactions (showing 5 of 30 total):\n\n1. **BUY** SYM-A — 2 shares @ $100 = $200 on 2025-01-01\n2. **BUY** SYM-B — 3 shares @ $100 = $300 on 2025-01-02\n3. **BUY** SYM-C — 5 shares @ $80 = $400 on 2025-01-03\n4. **BUY** SYM-D — 10 shares @ $50 = $500 on 2025-01-04\n5. **BUY** SYM-A — 4 shares @ $110 = $440 on 2025-01-05\n\nAll recent activity has been BUY transactions. Total activity count: 30.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
