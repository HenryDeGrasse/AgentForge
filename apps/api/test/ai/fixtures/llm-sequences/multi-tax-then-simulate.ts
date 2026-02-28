import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiTaxThenSimulate: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'tax_estimate' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: {
          trades: [{ action: 'sell', fractionOfPosition: 1.0, symbol: 'SYM-C' }]
        },
        id: 'tc-2',
        name: 'simulate_trades'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Your estimated tax liability is **$1,200** based on current capital gains. Simulating the sale of your worst performer would realize a loss of $800, which could offset some of your gains and reduce your tax liability to approximately **$400**.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
