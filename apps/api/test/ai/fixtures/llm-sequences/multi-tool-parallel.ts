import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * Parallel multi-tool: LLM calls both tools in a single iteration
 * (2 tool_calls in one completion). Both execute, then final text.
 */
export const multiToolParallel: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' },
      { arguments: {}, id: 'tc-2', name: 'get_transaction_history' }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your portfolio holds 4 assets worth $10,000 with $500 in cash. Looking at your transaction history, you have 30 buy orders totaling $9,500 across 4 symbols. Your most recent transactions include purchases of SYM-A and SYM-B.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
