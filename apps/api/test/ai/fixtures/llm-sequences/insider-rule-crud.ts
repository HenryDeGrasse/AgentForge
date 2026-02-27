import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * LLM creates an insider monitoring rule for sell transactions > $100k
 * across the top 3 portfolio holdings. Confirms creation in the response.
 */
export const insiderRuleCrud: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: {
          minValueUsd: 100000,
          scope: 'top_n',
          side: 'sell',
          topN: 3
        },
        id: 'tc-1',
        name: 'create_insider_monitoring_rule'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your insider monitoring rule has been created successfully. You will receive an alert at the start of each chat session when any insider sell transaction exceeds $100,000 in your top 3 holdings.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
