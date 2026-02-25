import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richRiskAnalysis: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'analyze_risk' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your portfolio has a medium overall risk level. There is a concentration risk flag: SYM-A represents 40% of your portfolio, exceeding the 25% threshold. Your top 3 holdings account for 90% of the portfolio, and diversification across asset classes shows 70% equity, 20% bonds, and 10% commodities.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
