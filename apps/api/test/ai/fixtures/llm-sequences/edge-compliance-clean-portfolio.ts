import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

export const edgeComplianceCleanPortfolio: LLMCompletionResponse[] = [
  {
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [{ arguments: {}, id: 'tc-1', name: 'compliance_check' }],
    usage: { estimatedCostUsd: 0.001 }
  },
  {
    finishReason: 'stop',
    text: "**Compliance Check Results:**\n\nI've run a rule-based compliance check against standard portfolio guidelines:\n\n✅ **Compliant** — No violations found\n\n**Rules checked:**\n- Single-stock concentration (<25%): All holdings pass\n- Sector concentration (<40%): Technology at ~31% — within limits\n- Restricted assets: None flagged\n\n⚠️ Note: ESG compliance requires additional ESG ratings data not currently available. This check covers concentration and restricted-asset rules only.",
    toolCalls: [],
    usage: { estimatedCostUsd: 0.001 }
  }
];
