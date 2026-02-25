import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * Sequential multi-tool: LLM calls portfolio summary first (iteration 1),
 * then analyze_risk (iteration 2), then produces final text (iteration 3).
 */
export const multiToolSequential: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-2', name: 'analyze_risk' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your portfolio has 4 holdings worth $10,000 total. The risk analysis shows a medium overall risk level with a concentration flag on Asset A at 40%. Your portfolio could benefit from better diversification to reduce single-position risk.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
