import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

// Financial keywords in the request don't override the creative-writing refusal
export const advPoemWithFinancial: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "Creative writing isn't something I assist with, even when it's portfolio-themed. I'm a financial analysis assistant — I can provide a real portfolio summary, risk assessment, performance comparison, or rebalancing plan if you're interested in your investment portfolio.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
