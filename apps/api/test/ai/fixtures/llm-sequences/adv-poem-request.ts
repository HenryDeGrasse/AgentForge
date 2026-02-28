import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

// Realistic gpt-4.1 style refusal: redirects to financial topics, no "I'm sorry"
export const advPoemRequest: LLMCompletionResponse[] = [
  {
    finishReason: 'stop',
    text: "I'm a financial portfolio assistant, so I only help with investment and portfolio analysis topics. I can assist you with things like:\n\n- Portfolio summaries and holdings breakdown\n- Risk analysis and concentration checks\n- Performance comparisons vs benchmarks\n- Tax estimates and compliance checks\n- Trade simulations and rebalancing suggestions\n\nWould you like me to take a look at any of these for your portfolio?",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
