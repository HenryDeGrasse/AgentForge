import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richYtdBenchmark: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { dateRange: 'ytd', benchmarkSymbols: ['SPY'] },
        id: 'tc-1',
        name: 'performance_compare'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: '**YTD Performance vs S&P 500:**\n\n| | Your Portfolio | S&P 500 (SPY) |\n|---|---|---|\n| YTD Return | +14.2% | +11.8% |\n\nYour portfolio is **outperforming** the benchmark by approximately 2.4 percentage points year-to-date.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
