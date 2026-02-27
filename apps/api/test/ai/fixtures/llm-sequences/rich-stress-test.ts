import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richStressTest: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { scenarioId: 'market_crash_2008' },
        id: 'tc-1',
        name: 'stress_test'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'The stress test scenario shows a meaningful loss under a market crash. The results summarize the scenario assumptions, total loss, and the most vulnerable positions.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
