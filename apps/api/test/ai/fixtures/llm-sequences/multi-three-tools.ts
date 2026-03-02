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
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: '**Portfolio Summary:**\n4 holdings, total value $10,500. Largest position: SYM-A at 40% ($4,000).\n\n**Risk Analysis:**\nOverall risk: **HIGH**. Single-position concentration flag: SYM-A at 40% exceeds the 25% threshold. Top-3 holdings = 90% of portfolio.\n\n**Compliance:**\nStatus: **NON_COMPLIANT**. SYM-A (40%) exceeds the max single-position rule (25%). 1 rule failed, all others passed.\n\n**Recommendation:** Reduce SYM-A below 25% to address both the risk flag and compliance violation simultaneously.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.003 }
  }
];
