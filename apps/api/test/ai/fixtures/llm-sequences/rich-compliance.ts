import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richCompliance: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'compliance_check' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your portfolio is **NON_COMPLIANT** with standard compliance rules.\n\n**Failed rules:**\n- ❌ **Single position limit**: SYM-A is 40% of portfolio (limit: 25%) — exceeds by 15 percentage points\n\n**Passed rules:**\n- ✅ Asset class diversification\n- ✅ No restricted symbols\n- ✅ Minimum holdings count (4 ≥ 3)\n\n**Summary:** 1 rule failed out of 4 checked. To become compliant, consider reducing your SYM-A position below 25% of total portfolio value.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
