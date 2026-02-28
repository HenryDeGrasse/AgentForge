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
    text: 'Your portfolio has 10 holdings with a total value of $55,440.\n\nTop holdings by value:\n1. **VOO** (Vanguard S&P 500 ETF) — 45% allocation, $24,565 @ $500/share\n2. **NVDA** (NVIDIA Corporation) — 21% allocation, $11,524 @ $134/share\n3. **BND** (Vanguard Total Bond Market ETF) — 9% allocation, $4,780 @ $73.50/share\n4. **SYM-A** (Asset A) — 40% allocation, $4,000 @ $150/share (26.67 shares)\n5. **AAPL** (Apple Inc.) — 2.4% allocation, $2,280 @ $228/share\n\nAll 10 positions are tracked across 2 accounts (Brokerage and Retirement IRA).',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
