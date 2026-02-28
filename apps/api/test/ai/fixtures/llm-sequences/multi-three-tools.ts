import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiThreeTools: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' },
      { arguments: {}, id: 'tc-2', name: 'analyze_risk' },
      { arguments: {}, id: 'tc-3', name: 'compliance_check' }
    ],
    usage: { estimatedCostUsd: 0.002 }
  },
  {
    finishReason: 'stop',
    text: 'Here is your complete portfolio review:\n\n**Summary**: 4 holdings valued at $10,000 total.\n**Risk**: Moderate risk with some concentration in equities.\n**Compliance**: All positions within regulatory limits.\n\nOverall your portfolio is well-structured but could benefit from more diversification.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
