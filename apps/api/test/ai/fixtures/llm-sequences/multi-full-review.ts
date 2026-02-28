import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiFullReview: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' },
      { arguments: {}, id: 'tc-2', name: 'analyze_risk' }
    ],
    usage: { estimatedCostUsd: 0.002 }
  },
  {
    finishReason: 'stop',
    text: 'Here is your complete portfolio review:\n\n**Holdings**: 4 positions with a total value of $10,000.\n**Risk Profile**: Moderate risk with some concentration in equities.\n\nOverall, your portfolio is well-structured for a growth-oriented investor.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
