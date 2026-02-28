import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richSectorRisk: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'analyze_risk' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: "Based on your risk analysis, your portfolio is rated **HIGH** risk with notable concentration issues:\n\n**Concentration flags:**\n- SYM-A accounts for **40%** of your portfolio — significantly above the 25% single-position threshold\n- Your top 3 holdings (SYM-A, SYM-B, SYM-C) represent 90% of total holdings\n\n**Asset class exposure:**\n- Equities: 70%\n- Bonds: 20%\n- Commodities: 10%\n\nWhile your sector breakdown isn't highly concentrated in a single sector, your equity-heavy allocation combined with SYM-A concentration creates meaningful concentration risk. Diversifying into more holdings would reduce this.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
