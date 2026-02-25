import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richPerformance: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'performance_compare' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your portfolio has returned 8% year-to-date with a net performance of $800. Compared to the S&P 500 benchmark, your portfolio is underperforming. Your total investment is $9,500 with a current net worth of $10,500.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
