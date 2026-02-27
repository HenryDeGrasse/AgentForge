import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richSimulateTrades: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: {
          trades: [
            { action: 'sell', quantity: 10, symbol: 'SYM-A' },
            { action: 'buy', quantity: 5, symbol: 'SYM-B' }
          ]
        },
        id: 'tc-1',
        name: 'simulate_trades'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'I simulated your trades and updated the portfolio projections. The trade simulation shows how the buy/sell changes would shift allocations and cash balance.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
