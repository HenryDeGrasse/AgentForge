import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richSimulateBuyOnly: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: {
          trades: [{ action: 'buy', quantity: 20, symbol: 'AAPL' }]
        },
        id: 'tc-1',
        name: 'simulate_trades'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: "Here's the simulation for buying 20 shares of **AAPL**:\n\n**Trade result:** BUY 20 shares @ $228.00 = $4,560 cost\n\n**After simulation:**\n- AAPL increases from $2,280 (10 shares) to $6,840 (30 shares)\n- AAPL allocation: 4.1% → 11.0% of portfolio\n\n⚠️ This is a simulation only — no actual trades were executed.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
