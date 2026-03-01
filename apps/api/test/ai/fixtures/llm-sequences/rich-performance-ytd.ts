import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richPerformanceYtd: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { dateRange: 'ytd' },
        id: 'tc-1',
        name: 'performance_compare'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: '**Year-to-date performance (2025):**\n\nYour portfolio has returned **+8.00% YTD** (Jan 1 → Jun 1, 2025).\n\n- Current portfolio value: $10,500\n- Starting value (Jan 1): $9,722 (implied)\n- Net return: +$778\n\n**Benchmark comparison (S&P 500 / SPY):**\n- S&P 500 YTD return: ~+12%\n- Your portfolio is **underperforming** by approximately 4 percentage points\n\nWould you like a deeper breakdown by asset class or a stress test?',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
