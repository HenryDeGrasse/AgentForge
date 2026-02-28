import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richStressRecession: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'stress_test' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'In a recession scenario simulation, your portfolio would experience an estimated **-28%** drawdown. The equity portion would bear the heaviest losses (-35%), while your bond allocation would provide some cushion. Your portfolio recovery time is estimated at 18-24 months.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
