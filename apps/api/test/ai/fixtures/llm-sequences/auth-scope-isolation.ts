import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * Auth scoping test: verifies that tool stubs receive context.userId
 * from the agent input (not from LLM arguments).
 * The invocationLog records context.userId for each tool execution.
 *
 * NOTE: LLM args must conform to the tool's inputSchema (additionalProperties: false),
 * so we don't inject a fake userId here. The security boundary is that context.userId
 * is set by the agent framework, never by LLM output.
 */
export const authScopeIsolation: LLMCompletionResponse[] = [
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
    text: 'Your portfolio has 4 holdings with a total value of $10,000.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
