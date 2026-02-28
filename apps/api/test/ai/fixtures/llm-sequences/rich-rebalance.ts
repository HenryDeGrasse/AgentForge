import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richRebalance: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { strategy: 'equal_weight' },
        id: 'tc-1',
        name: 'rebalance_suggest'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: "Here's your equal-weight rebalance plan (targeting 25% per position):\n\n**Suggested trades:**\n- **SELL VOO**: Reduce from 45% → 25% (sell ~$1,500 worth)\n- **SELL SYM-A**: Reduce from 40% → 25% (sell ~$1,500 worth, ~10 shares @ $150)\n- **SELL SYM-B**: Reduce from 30% → 25% (sell ~$500 worth, ~4 shares @ $120)\n- **BUY SYM-C**: Increase from 20% → 25% (buy ~$500 worth, ~5 shares @ $100)\n- **BUY SYM-D**: Increase from 10% → 25% (buy ~$1,500 worth, ~30 shares @ $50)\n\n**Summary:**\n- Total buys: $2,000 | Total sells: $2,000 (cash-neutral)\n- Estimated turnover: 30%\n\n⚠️ This is a suggestion only — please review before executing any trades.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
