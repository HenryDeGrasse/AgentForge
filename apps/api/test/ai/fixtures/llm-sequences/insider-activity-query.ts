import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * LLM queries get_insider_activity for NVDA, receives transactions,
 * then summarises insider sell activity.
 */
export const insiderActivityQuery: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { symbols: ['NVDA'] },
        id: 'tc-1',
        name: 'get_insider_activity'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Here is the recent insider activity for NVDA. There were insider sell transactions reported in the last 30 days. One executive sold shares worth approximately $2M. You can review the full transaction details and source URLs for verification.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
