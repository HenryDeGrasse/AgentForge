import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richHoldingsSummary: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your portfolio has 4 holdings with a total value of $10,500 (including $500 cash).\n\nTop holdings by value:\n1. **SYM-A** (Asset A) — 40% allocation, $4,000 @ $150/share (26.67 shares)\n2. **SYM-B** (Asset B) — 30% allocation, $3,000 @ $120/share\n3. **SYM-C** (Asset C) — 20% allocation, $2,000 @ $100/share\n4. **SYM-D** (Asset D) — 10% allocation, $1,000 @ $50/share\n\nTotal invested portfolio value: $10,000 in holdings + $500 cash.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
