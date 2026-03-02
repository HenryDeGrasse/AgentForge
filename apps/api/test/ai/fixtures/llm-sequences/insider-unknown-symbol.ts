import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * LLM queries get_insider_activity for an unknown symbol XYZFAKE123.
 * The tool returns a partial result with no transactions.
 * The LLM responds indicating no insider activity was found.
 */
export const insiderUnknownSymbol: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { symbols: ['XYZFAKE123'] },
        id: 'tc-1',
        name: 'get_insider_activity'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'No insider activity was found for XYZFAKE123. This symbol may not be tracked or there are no recent Form 4 filings available for it.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
