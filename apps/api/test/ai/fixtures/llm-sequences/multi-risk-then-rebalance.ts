import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiRiskThenRebalance: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'analyze_risk' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { strategy: 'equal_weight' },
        id: 'tc-2',
        name: 'rebalance_suggest'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: '**Risk Analysis:**\nYour portfolio is rated **HIGH** risk. The primary flag is SYM-A at 40% concentration (threshold: 25%). Top-3 holdings account for 90% of the portfolio.\n\n**Rebalance Plan (equal weight):**\nTo reduce concentration risk, here are the suggested trades:\n- **SELL SYM-A**: $1,500 to bring it down to 25%\n- **SELL SYM-B**: $500 to trim to 25%\n- **BUY SYM-C**: $500 to build up to 25%\n- **BUY SYM-D**: $1,500 to build up to 25%\n\nThis rebalance addresses the concentration risk directly by reducing SYM-A from 40% to 25%.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.002 }
  }
];
