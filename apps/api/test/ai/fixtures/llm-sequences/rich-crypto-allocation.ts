import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richCryptoAllocation: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: "Based on your portfolio summary, your crypto exposure is:\n\n- **BTC-USD (Bitcoin):** $4,875 — **8.8%** of total portfolio\n\nYour total portfolio is approximately $55,440. Crypto represents a moderate allocation. If you'd like to adjust this, I can run a simulation or suggest a rebalance.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
