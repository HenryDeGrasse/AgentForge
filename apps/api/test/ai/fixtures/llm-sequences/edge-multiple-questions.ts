import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const edgeMultipleQuestions: LLMCompletionResponse[] = [
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
    text: '**Portfolio Summary:**\n4 holdings worth $10,500. Top position: SYM-A at 40% ($4,000).\n\n**Compliance Check:**\nStatus: **NON_COMPLIANT** — SYM-A at 40% exceeds the 25% single-position limit.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.002 }
  }
];
