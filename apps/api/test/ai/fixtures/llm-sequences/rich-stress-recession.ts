import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richStressRecession: LLMCompletionResponse[] = [
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
    text: '**Recession / 2008 crash scenario:**\n\nUnder a severe market crash (50% equity drawdown), your portfolio would suffer an estimated **loss of $2,000 (-19%)**, bringing total value from $10,000 down to ~$8,000.\n\n**Most vulnerable positions:**\n- SYM-A: -$2,000 (-50%) — largest loss due to 40% portfolio weight\n- SYM-B: -$1,500 (-50%)\n- SYM-C: -$200 (-10%, bond cushion)\n\n**Recovery needed:** +23% from trough to return to current value.\n\nYour heavy equity allocation (70%) is the primary driver. Consider increasing bond/cash allocation to buffer recession risk.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
