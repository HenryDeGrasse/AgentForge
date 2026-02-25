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
    text: 'Your portfolio contains 4 holdings with a total value of $10,000. The largest position is Asset A at 40% allocation, followed by Asset B at 30%. Your total portfolio value including cash is $10,500.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
