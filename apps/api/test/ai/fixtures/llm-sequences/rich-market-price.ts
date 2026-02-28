import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richMarketPrice: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: { symbol: 'NVDA' }, id: 'tc-1', name: 'market_data_lookup' }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'The current price of **NVDA (NVIDIA Corporation)** is **$875.50**. The stock has seen a 52-week high of $950 and a 52-week low of $450.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
