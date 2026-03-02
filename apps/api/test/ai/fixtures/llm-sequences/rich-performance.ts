import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const richPerformance: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'performance_compare' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: "Here's your portfolio performance compared to the S&P 500 (SPY) year-to-date:\n\n**Your portfolio:**\n- Net performance: +8.00% return\n- Current value: $10,500\n- Total invested: $9,500\n\n**S&P 500 (SPY):**\n- YTD return: approximately +12% (benchmark)\n- Market condition: BULL\n- 50-day trend: UP, 200-day trend: UP\n\n**Comparison:**\n- Your portfolio is **underperforming** the S&P 500 by approximately 4 percentage points YTD.\n\nWould you like a breakdown by asset class or a stress test to see how you'd hold up in a downturn?",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
