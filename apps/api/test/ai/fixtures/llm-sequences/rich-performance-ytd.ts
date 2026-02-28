import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richPerformanceYtd: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'performance_compare' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your portfolio has returned **8.5%** year-to-date. This compares to the S&P 500 return of 10.2% over the same period, meaning your portfolio has slightly underperformed the benchmark by **1.7 percentage points**.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
