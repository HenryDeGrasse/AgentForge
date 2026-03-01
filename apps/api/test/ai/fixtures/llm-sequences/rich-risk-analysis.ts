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
    text: 'Your portfolio is rated **HIGH** risk based on concentration analysis.\n\n**Key risk flags:**\n- **Single-position concentration**: SYM-A is 40% of your portfolio (threshold: 25%) — HIGH severity\n- **Top-3 concentration**: SYM-A + SYM-B + SYM-C account for 90% of holdings\n- **Asset class exposure**: 70% in equities\n\n**Holdings count**: 4 positions totalling $10,000\n\nRecommendation: Consider diversifying out of SYM-A to reduce concentration risk.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
