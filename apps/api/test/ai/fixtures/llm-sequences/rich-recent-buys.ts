import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richRecentBuys: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { types: ['BUY'] },
        id: 'tc-1',
        name: 'get_transaction_history'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Here are your recent BUY transactions (showing 5 of 30 total):\n\n1. **BUY** SYM-A — 2 shares @ $100 on 2025-01-01 ($200)\n2. **BUY** SYM-B — 3 shares @ $115 on 2025-01-02 ($345)\n3. **BUY** SYM-C — 1 share @ $100 on 2025-01-03 ($100)\n4. **BUY** SYM-D — 2 shares @ $130 on 2025-01-04 ($260)\n5. **BUY** SYM-A — 3 shares @ $145 on 2025-01-05 ($435)\n\nAll 30 recorded transactions are purchases. No sells or dividends recorded.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
