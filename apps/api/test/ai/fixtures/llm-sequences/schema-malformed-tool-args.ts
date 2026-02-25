import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * LLM sends empty args to market_data_lookup which requires a `symbol` field.
 * The LLM adapter normalizes invalid JSON to {} — empty object fails input validation
 * (missing required fields) → registry returns tool_validation_error.
 * Then the LLM recovers gracefully.
 */
export const schemaMalformedToolArgs: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: {},
        id: 'tc-1',
        name: 'market_data_lookup'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'I was unable to look up market data without a symbol. However, based on your portfolio data, you hold several assets across different classes.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
