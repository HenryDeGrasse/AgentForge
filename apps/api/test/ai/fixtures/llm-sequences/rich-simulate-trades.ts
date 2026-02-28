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
    text: "Here's the simulation for selling 10 shares of SYM-A and buying 5 shares of SYM-B:\n\n**Before:**\n- SYM-A: $4,000 (38%)\n- SYM-B: $3,000 (29%)\n- Portfolio total: $10,500\n\n**After simulation:**\n- SYM-A: $3,500 (33%) — reduced by $500\n- SYM-B: $3,500 (33%) — increased by $500\n- Portfolio total: $10,450 (net impact: -$50 due to price difference)\n\n**Trade results:**\n- ✅ SYM-A: SELL 10 shares @ $150 = $1,500 proceeds\n- ✅ SYM-B: BUY 5 shares @ $120 = $600 cost\n\n⚠️ This is a simulation only — no actual trades were executed.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
