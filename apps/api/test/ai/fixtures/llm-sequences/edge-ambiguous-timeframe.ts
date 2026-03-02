import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

/**
 * "Recently" is ambiguous — gpt-4.1 defaults to mtd (month-to-date) as a
 * reasonable interpretation when no timeframe is specified.
 */
export const edgeAmbiguousTimeframe: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      {
        arguments: { dateRange: 'mtd' },
        id: 'tc-1',
        name: 'performance_compare'
      }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: "Here's your portfolio performance for the past month (month-to-date):\n\n- **MTD return:** +3.2%\n- **Period:** month-to-date\n\nYour portfolio is up this month. Would you like to see a different timeframe (e.g., YTD, 1 year)?",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
