import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richMarketPrice: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: { symbol: 'SYM-A' }, id: 'tc-1', name: 'market_data_lookup' }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'The current price of **SYM-A** (Asset A) is **$150.00 USD**.\n\n- 24h change: +$3.67 (+2.5%)\n- Asset class: Equity / Stock\n- Sector: Technology\n- Last updated: 2025-06-01',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
