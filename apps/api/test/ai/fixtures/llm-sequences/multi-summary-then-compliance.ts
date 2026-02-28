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
    text: '**Portfolio Summary:**\nYou have 4 holdings totalling $10,500 (including $500 cash). Top position is SYM-A at 40% ($4,000), followed by SYM-B at 30% ($3,000).\n\n**Compliance Check:**\nYour portfolio is **NON_COMPLIANT**.\n- ❌ SYM-A exceeds the 25% single-position limit (currently at 40%)\n- ✅ All other rules passed\n\nTo become compliant, reduce your SYM-A position below 25% of total portfolio value (~$2,500).',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.002 }
  }
];
