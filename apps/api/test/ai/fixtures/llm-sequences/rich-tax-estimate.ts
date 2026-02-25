import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richTaxEstimate: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'tax_estimate' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'For tax year 2025, your estimated realized gains total $340. You have $140 in short-term gains from 2 transactions and $200 in long-term gains from 1 transaction. There are no tax loss harvesting candidates currently available.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
