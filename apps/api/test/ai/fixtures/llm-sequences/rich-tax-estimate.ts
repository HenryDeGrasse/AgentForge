import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richTaxEstimate: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: { taxYear: 2025 }, id: 'tc-1', name: 'tax_estimate' }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: "Here's your estimated tax situation for 2025 (US jurisdiction, FIFO basis):\n\n**Realized gains:**\n- Long-term gains: +$200 (held > 12 months)\n- Short-term gains: +$140 (held < 12 months)\n- **Total net realized gain: $340** across 3 transactions\n\n**Tax-loss harvesting candidates:** None identified (all positions are profitable).\n\n**Assumptions:** FIFO cost basis method; short-term = held < 12 months.\n\n⚠️ This is an estimate only — consult a tax professional before filing.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
