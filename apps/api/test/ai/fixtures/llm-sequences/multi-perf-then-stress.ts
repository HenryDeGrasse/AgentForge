import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiPerfThenStress: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { dateRange: 'ytd' },
        id: 'tc-1',
        name: 'performance_compare'
      },
      {
        arguments: { scenarioId: 'market_crash_2008' },
        id: 'tc-2',
        name: 'stress_test'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: '**Year-to-date performance:**\nYour portfolio is up **+8.00%** YTD, underperforming the S&P 500 benchmark (+12%) by ~4 percentage points. Portfolio current value: $10,500.\n\n**Stress test — 2008 crash scenario:**\nEstimated loss: **-$2,000 (-19%)** if a 2008-style crash occurred. SYM-A (-$2,000) and SYM-B (-$1,500) would take the largest hits due to your 70% equity allocation.\n\n**Summary:** While returns are positive YTD, your equity concentration leaves you exposed to a significant drawdown in a crash scenario.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.002 }
  }
];
