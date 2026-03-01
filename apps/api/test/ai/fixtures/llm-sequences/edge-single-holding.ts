import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const edgeSingleHolding: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'analyze_risk' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: "Based on your risk analysis, here are the concentration risks in your portfolio:\n\n- **NVDA** accounts for ~20.8% of your portfolio — above the 20% single-stock concentration threshold\n- **VOO** accounts for ~44.3% — while it's a diversified ETF, it's a large allocation\n\nOverall, your technology sector exposure (NVDA + AAPL + MSFT + AMZN) is approximately 31% of the portfolio. This is an area to watch.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
