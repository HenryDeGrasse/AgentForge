import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiSummaryThenCompliance: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' },
      { arguments: {}, id: 'tc-2', name: 'compliance_check' }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your portfolio has 4 holdings with a total value of $10,000. The compliance check shows all positions are within regulatory limits and your portfolio is **compliant** with current guidelines.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
