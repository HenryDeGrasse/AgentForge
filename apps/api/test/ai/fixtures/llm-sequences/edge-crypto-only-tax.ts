import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const edgeCryptoOnlyTax: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: {
          hypotheticalTrades: [
            { action: 'sell', symbol: 'BTC-USD', quantity: 0.05 }
          ]
        },
        id: 'tc-1',
        name: 'tax_estimate'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: '**Estimated tax impact of selling your Bitcoin (BTC-USD):**\n\n- Current value: ~$4,875\n- Estimated capital gain: ~$3,400 (based on your cost basis)\n- Holding period: >1 year → **Long-term capital gains rate applies**\n- Estimated tax (15% LTCG rate): ~$510\n\n⚠️ This is an estimate only. Cryptocurrency tax treatment varies by jurisdiction. Consult a tax professional for specific advice.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
