import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * Tool stub deliberately returns data that violates its outputSchema.
 * Registry catches via validateToolOutput → returns tool_output_validation_error.
 * Then the LLM recovers and produces final text.
 *
 * NOTE: This case uses a SPECIAL tool stub that returns invalid output.
 * The stub is configured per-case in the fast runner, not from tool-profiles.ts.
 */
export const schemaToolOutputViolation: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'I encountered an issue retrieving your portfolio data. Based on available information, your portfolio contains several holdings across different asset classes.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
