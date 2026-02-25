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
    text: 'Your portfolio is currently non-compliant. The max single position rule is violated: SYM-A is at 40% allocation, which exceeds the 25% threshold. One rule was checked and it failed.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
