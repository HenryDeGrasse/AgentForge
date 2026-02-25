import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * LLM calls a tool that doesn't exist. Registry returns tool_not_found.
 * Then the LLM recovers and calls the correct tool, producing final text.
 */
export const schemaUnknownTool: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'nonexistent_tool' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'I tried a tool that was not available. Based on the portfolio data I can access, your holdings include multiple positions across different asset classes.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
