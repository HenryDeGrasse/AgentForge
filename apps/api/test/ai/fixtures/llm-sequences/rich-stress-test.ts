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
    text: "Here's your portfolio stress test under the **2008 Market Crash** scenario:\n\n**Scenario:** 50% equity drawdown, 10% bond drawdown\n\n**Estimated total loss: -$2,000 (-19%)** on a $10,000 portfolio\n\n**Position-level impacts:**\n- SYM-A (Equity): -$2,000 (-50%)\n- SYM-B (Equity): -$1,500 (-50%)\n- SYM-C (Bond): -$200 (-10%)\n- SYM-D (Commodity): -$100 (-10%)\n\n**Most vulnerable**: SYM-A and SYM-B (equity concentration)\n\nYour heavy equity allocation (70%) is the primary driver of potential losses in a severe market crash. Consider increasing bond/cash allocation to buffer downside risk.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
