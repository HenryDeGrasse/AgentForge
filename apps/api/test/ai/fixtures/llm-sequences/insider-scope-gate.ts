import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * Scope gate test: insider question passes the scope gate.
 * LLM queries portfolio-scoped insider activity (no symbols = uses portfolio holdings)
 * and reports on insider sell activity in top holdings.
 */
export const insiderScopeGate: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { symbols: [] },
        id: 'tc-1',
        name: 'get_insider_activity'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Yes, there is recent insider sell activity in your top holdings. One insider sold shares in a position you hold. This is informational only and not investment advice — please review the source filings for full details.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
