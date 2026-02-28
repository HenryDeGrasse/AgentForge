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
    text: 'I ran a full compliance check on your portfolio. Results:\n\n- **Overall Status**: Compliant\n- **Position Limits**: All within regulatory thresholds\n- **Concentration**: No single position exceeds 25%\n- **Asset Class Mix**: Within guidelines\n\nYour portfolio meets all current compliance requirements.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
