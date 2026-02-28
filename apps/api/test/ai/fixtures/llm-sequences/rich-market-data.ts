import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richMarketData: LLMCompletionResponse[] = [
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
    text: 'Here is the current market data for **SYM-A** (Asset A):\n\n- **Current price**: $150.00 USD\n- **Asset class**: Equity / Stock\n- **24h change**: +$3.67 (+2.5%)\n- **Sector**: Technology\n- **Country**: US\n- **Data source**: MANUAL\n- **Price last updated**: 2025-06-01\n\nWould you like to see historical price data or compare this to other holdings?',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
