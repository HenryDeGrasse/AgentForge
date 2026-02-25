import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * LLM keeps requesting tools, never producing final text.
 * With maxIterations=2, the agent will hit the iteration limit.
 */
export const guardrailMaxIterations: LLMCompletionResponse[] = [
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
  // This third response would never be reached with maxIterations=2
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-3', name: 'get_portfolio_summary' }],
    usage: { estimatedCostUsd: 0.001 }
  }
];
