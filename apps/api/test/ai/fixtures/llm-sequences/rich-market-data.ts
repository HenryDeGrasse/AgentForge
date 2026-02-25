import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richMarketData: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: { symbol: 'SYM-A' }, id: 'tc-1', name: 'market_data_lookup' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Asset A (SYM-A) is currently priced at $150 USD. It is classified as an equity in the Technology sector. The price has changed by +2.5% recently, an increase of $3.67.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
