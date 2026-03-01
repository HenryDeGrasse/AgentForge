import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiMarketThenSimulate: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { symbol: 'MSFT', dataSource: 'YAHOO' },
        id: 'tc-1',
        name: 'market_data_lookup'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: {
          trades: [{ action: 'buy', quantity: 10, symbol: 'MSFT' }]
        },
        id: 'tc-2',
        name: 'simulate_trades'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: '**MSFT Current Price:** $420.00\n\n**Trade Simulation — Buy 10 shares of MSFT:**\n\n- Cost: 10 × $420 = **$4,200**\n- Current MSFT holding: $2,100 (5 shares)\n- After purchase: $6,300 (15 shares)\n- MSFT allocation: 3.8% → 10.2% of portfolio\n\n⚠️ This is a simulation — no actual trade was executed.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
