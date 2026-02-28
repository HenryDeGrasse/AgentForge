import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richHoldingsDetail: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: { topN: 3 }, id: 'tc-1', name: 'get_portfolio_summary' }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your top 3 holdings by value:\n\n1. **SYM-A** (Asset A) — $4,000 | 40% allocation | $150/share | Equity\n2. **SYM-B** (Asset B) — $3,000 | 30% allocation | $120/share | Equity\n3. **SYM-C** (Asset C) — $2,000 | 20% allocation | $100/share | Bond\n\nThese three positions together account for 90% of your total portfolio value of $10,500.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
