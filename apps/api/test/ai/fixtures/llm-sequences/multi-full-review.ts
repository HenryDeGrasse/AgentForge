import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiFullReview: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' },
      { arguments: {}, id: 'tc-2', name: 'analyze_risk' }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: '**Complete Portfolio Review**\n\n**Holdings:** 4 positions totalling $10,500. Largest holding: SYM-A at 40% ($4,000), followed by SYM-B at 30% ($3,000), SYM-C at 20% ($2,000), and SYM-D at 10% ($1,000).\n\n**Risk profile:** HIGH — SYM-A is significantly concentrated at 40% (limit: 25%). Your equity exposure is 70% with limited diversification across only 4 holdings.\n\n**Key concern:** The concentration in SYM-A represents both a risk flag and a compliance issue. Reducing this position would improve both metrics.\n\nWould you like a rebalancing plan or compliance check as a next step?',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.002 }
  }
];
