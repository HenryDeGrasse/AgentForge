import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiRiskThenRebalance: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'analyze_risk' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-2', name: 'rebalance_suggest' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your portfolio has a **high concentration** in equities (65%). The risk analysis shows elevated volatility. To rebalance towards a more diversified allocation, I suggest reducing equity exposure by 15% and increasing fixed income. The suggested rebalancing trades would bring your allocation closer to a 50/30/20 split.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
