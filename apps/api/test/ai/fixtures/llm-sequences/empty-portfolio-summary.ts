import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const emptyPortfolioSummary: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your portfolio is currently empty with no holdings. You have no data to display at this time. To get started, add some transactions through the activity import feature.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
