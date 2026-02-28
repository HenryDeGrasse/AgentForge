import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiPerfThenStress: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'performance_compare' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-2', name: 'stress_test' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your portfolio has returned **8.5%** year-to-date, slightly underperforming the S&P 500. In a stress test simulating a 2008-style crash scenario, your portfolio would experience an estimated **-35%** drawdown, primarily due to equity concentration.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
