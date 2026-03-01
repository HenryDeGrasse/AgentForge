import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richComplianceFull: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'compliance_check' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: '**Full Compliance Check Results:**\n\nOverall status: **non-compliant**\n\n**Rules checked (1):**\n- ❌ **Max single position (25%)**: SYM-A is at 40% — FAIL (exceeds by 15pp)\n\n**Remediation:**\nTo become compliant, reduce SYM-A from $4,000 (40%) to below $2,500 (25%) of your $10,000 holdings value. This would require selling at least $1,500 of SYM-A.\n\nPortfolio value: $10,000 across 4 holdings.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
