import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * Edge case: price lookup for a symbol (TSLA) not held in the user's portfolio.
 * The LLM must still call market_data_lookup — the tool accepts any ticker.
 */
export const edgeUnknownSymbol: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { symbol: 'TSLA', dataSource: 'YAHOO' },
        id: 'tc-1',
        name: 'market_data_lookup'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: "Here's the current market data for **Tesla (TSLA)**:\n\n- **Price:** $245.00\n- **Currency:** USD\n- **Data source:** Yahoo Finance\n\nNote: TSLA is not currently in your portfolio. If you'd like to see how adding it might affect your holdings, I can run a trade simulation.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
