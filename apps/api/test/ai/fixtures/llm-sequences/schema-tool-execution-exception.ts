import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * LLM sequence for the tool-execution-exception eval case.
 *
 * Step 1: LLM calls get_portfolio_summary — but the test uses a special stub
 *         that throws an exception. The ToolRegistry catches it and returns a
 *         tool_execution_failed error envelope.
 * Step 2: LLM receives the error envelope and recovers gracefully.
 */
export const schemaToolExecutionException: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: {},
        id: 'tc-1',
        name: 'get_portfolio_summary'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'I encountered an issue while trying to retrieve your portfolio data. There was a problem executing the portfolio summary tool. Please try again later, or let me know if there is another way I can help with your portfolio analysis.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
