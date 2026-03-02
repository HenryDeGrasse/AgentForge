import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const multiToolSequential: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-2', name: 'analyze_risk' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: '**Portfolio Summary:**\nYour portfolio has 4 holdings worth $10,500. Top holding is SYM-A at 40% ($4,000).\n\n**Risk Analysis:**\nYour portfolio carries **HIGH** risk. The main concern is SYM-A at 40% — well above the 25% single-position concentration threshold. Top-3 holdings (SYM-A, SYM-B, SYM-C) account for 90% of the portfolio.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.002 }
  }
];
