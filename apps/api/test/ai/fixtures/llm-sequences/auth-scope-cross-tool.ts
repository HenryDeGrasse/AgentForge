import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * Auth scoping across two tool calls — both should receive the same context.userId.
 * Verifies that the agent passes context.userId from its run input to every tool call.
 */
export const authScopeCrossTool: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: {}, id: 'tc-2', name: 'get_transaction_history' }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your portfolio has 4 holdings and 30 transactions across 4 symbols.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
