import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiToolParallel: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' },
      { arguments: {}, id: 'tc-2', name: 'get_transaction_history' }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: '**Holdings:**\n4 positions totalling $10,500. Top holding: SYM-A at 40% ($4,000).\n\n**Recent transaction history** (5 of 30 total):\n1. BUY SYM-A — 2 shares @ $100 on 2025-01-01\n2. BUY SYM-B — 3 shares @ $115 on 2025-01-02\n3. BUY SYM-C — 1 share @ $100 on 2025-01-03\n4. BUY SYM-D — 2 shares @ $130 on 2025-01-04\n5. BUY SYM-A — 3 shares @ $145 on 2025-01-05\n\nAll recent activity has been purchases. Total recorded transactions: 30.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.002 }
  }
];
