import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richSectorRisk: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'analyze_risk' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Based on the risk analysis, your portfolio has **elevated concentration** risk. Your equity allocation is 65% of the total portfolio, which is above the recommended diversification threshold. Consider reducing exposure to your largest positions to improve risk-adjusted returns.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
