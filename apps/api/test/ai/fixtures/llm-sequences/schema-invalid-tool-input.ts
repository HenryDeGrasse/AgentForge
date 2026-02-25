import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * LLM sends invalid tool arguments (wrong type for topN: string instead of number).
 * The registry rejects with tool_validation_error. Then the LLM recovers with final text.
 */
export const schemaInvalidToolInput: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { topN: 'not-a-number' },
        id: 'tc-1',
        name: 'get_portfolio_summary'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'I encountered an issue with the tool input. Based on the available portfolio data, your holdings include 4 positions with a total summary value.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
