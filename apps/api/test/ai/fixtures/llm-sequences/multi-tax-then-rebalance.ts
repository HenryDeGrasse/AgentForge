import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiTaxThenRebalance: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'rebalance_suggest' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: {
          hypotheticalTrades: [
            { action: 'sell', symbol: 'NVDA', fractionOfPosition: 0.5 }
          ]
        },
        id: 'tc-2',
        name: 'tax_estimate'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: "**Rebalancing to 60/40 — Tax Impact Analysis:**\n\nTo reach a 60% equity / 40% bond allocation, I'd need to:\n- **Sell:** Reduce NVDA, AAPL, and other equities by ~$8,200\n- **Buy:** Add BND and similar bond ETFs\n\n**Estimated tax on sales:**\n- NVDA sale (partial): ~$450 in estimated capital gains tax\n- Total estimated tax from rebalancing: ~$680\n\n⚠️ These are estimates only. Actual tax depends on your jurisdiction, filing status, and specific lot selection. Consult a tax professional before rebalancing.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
