import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const edgeTypoInToolRef: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'compliance_check' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'I ran the compliance check for you. Your portfolio is **compliant** with all current regulatory guidelines. No violations were detected.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
