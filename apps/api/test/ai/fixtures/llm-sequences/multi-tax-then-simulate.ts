import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiTaxThenSimulate: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: { taxYear: 2025 }, id: 'tc-1', name: 'tax_estimate' }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: {
          trades: [{ action: 'sell', fractionOfPosition: 1, symbol: 'SYM-D' }]
        },
        id: 'tc-2',
        name: 'simulate_trades'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: '**Tax estimate (2025):**\nYou have $340 in net realized gains ($200 long-term + $140 short-term) across 3 transactions.\n\n**Trade simulation — sell SYM-D (worst performer):**\nSimulating a full sale of SYM-D ($1,000 position):\n- Portfolio value changes from $10,500 → $10,450\n- SYM-D position removed from holdings\n- Proceeds: ~$1,000 added to cash balance\n\nNote: Selling SYM-D would generate additional taxable gains — factor this into your tax planning.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.002 }
  }
];
