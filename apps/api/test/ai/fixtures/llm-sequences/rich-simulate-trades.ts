import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * Trade simulation using real demo-account symbols (NVDA and BND).
 * Updated from SYM-A/SYM-B placeholders so this case can run as a live eval.
 */
export const richSimulateTrades: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: {
          trades: [
            { action: 'sell', quantity: 5, symbol: 'NVDA' },
            { action: 'buy', quantity: 10, symbol: 'BND' }
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
    text: "Here's the trade simulation for selling 5 shares of **NVDA** and buying 10 shares of **BND**:\n\n**Before:**\n- NVDA: $11,524 (20.8% of portfolio)\n- BND: $4,780 (8.6% of portfolio)\n\n**After simulation:**\n- NVDA: reduced by 5 shares (~$5,762 proceeds)\n- BND: increased by 10 shares\n- Net portfolio impact: shift from growth to income/stability\n\n**Trade results:**\n- ✅ NVDA: SELL 5 shares executed\n- ✅ BND: BUY 10 shares executed\n\n⚠️ This is a simulation only — no actual trades were executed. Your actual positions remain unchanged.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
