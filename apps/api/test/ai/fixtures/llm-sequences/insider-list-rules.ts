import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * LLM lists the user's insider monitoring rules and summarises them.
 */
export const insiderListRules: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: {},
        id: 'tc-1',
        name: 'list_insider_monitoring_rules'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'You have 1 active insider monitoring rule: it alerts you when insiders sell more than $100,000 in your top portfolio holdings. You can manage these rules at any time.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
