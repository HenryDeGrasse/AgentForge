import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const edgeMultipleQuestions: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { arguments: {}, id: 'tc-1', name: 'get_portfolio_summary' },
      { arguments: {}, id: 'tc-2', name: 'compliance_check' }
    ],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: 'Here are the results for both of your questions:\n\n**Portfolio Summary**: You have 4 holdings with a total value of $10,000.\n\n**Compliance Check**: Your portfolio is compliant with all current regulatory guidelines.',
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
