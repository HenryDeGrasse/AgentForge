import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const malformedQueryGibberish: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I'm sorry, but I don't understand your request. Could you rephrase it? I can only help with portfolio-related questions such as viewing your positions, analyzing risk, checking compliance, comparing performance, estimating taxes, suggesting rebalancing, simulating trades, and running stress tests.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
