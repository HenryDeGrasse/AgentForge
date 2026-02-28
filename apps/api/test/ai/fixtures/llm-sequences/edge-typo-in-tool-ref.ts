import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

// Agent understands "complience" = "compliance" and routes to compliance_check
export const edgeTypoInToolRef: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'compliance_check' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: '**Compliance Check:**\nYour portfolio status is **NON_COMPLIANT** with standard investment guidelines.\n\n- ❌ Single-position limit: SYM-A is at 40% (regulation threshold: 25%)\n- ✅ All other checks passed\n\nTo become compliant, reduce your SYM-A position below 25%.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
