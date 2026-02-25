import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

import { authScopeCrossTool } from './auth-scope-cross-tool';
import { authScopeIsolation } from './auth-scope-isolation';
import { emptyPortfolioSummary } from './empty-portfolio-summary';
import { guardrailCircuitBreaker } from './guardrail-circuit-breaker';
import { guardrailCostLimit } from './guardrail-cost-limit';
import { guardrailMaxIterations } from './guardrail-max-iterations';
import { guardrailTimeout } from './guardrail-timeout';
import { multiToolParallel } from './multi-tool-parallel';
import { multiToolSequential } from './multi-tool-sequential';
import { richCompliance } from './rich-compliance';
import { richHoldingsSummary } from './rich-holdings-summary';
import { richMarketData } from './rich-market-data';
import { richPerformance } from './rich-performance';
import { richRebalance } from './rich-rebalance';
import { richRiskAnalysis } from './rich-risk-analysis';
import { richTaxEstimate } from './rich-tax-estimate';
import { richTransactionHistory } from './rich-transaction-history';
import { schemaInvalidToolInput } from './schema-invalid-tool-input';
import { schemaMalformedToolArgs } from './schema-malformed-tool-args';
import { schemaToolOutputViolation } from './schema-tool-output-violation';
import { schemaUnknownTool } from './schema-unknown-tool';

/**
 * Map of eval case id → LLM completion sequence.
 * Each sequence is the ordered list of LLMCompletionResponses the mock will return.
 */
export const LLM_SEQUENCES: Record<string, LLMCompletionResponse[]> = {
  'auth-scope-cross-tool': authScopeCrossTool,
  'auth-scope-isolation': authScopeIsolation,
  'empty-portfolio-summary': emptyPortfolioSummary,
  'guardrail-circuit-breaker': guardrailCircuitBreaker,
  'guardrail-cost-limit': guardrailCostLimit,
  'guardrail-max-iterations': guardrailMaxIterations,
  'guardrail-timeout': guardrailTimeout,
  'multi-tool-parallel': multiToolParallel,
  'multi-tool-sequential': multiToolSequential,
  'rich-compliance': richCompliance,
  'rich-holdings-summary': richHoldingsSummary,
  'rich-market-data': richMarketData,
  'rich-performance': richPerformance,
  'rich-rebalance': richRebalance,
  'rich-risk-analysis': richRiskAnalysis,
  'rich-tax-estimate': richTaxEstimate,
  'rich-transaction-history': richTransactionHistory,
  'schema-invalid-tool-input': schemaInvalidToolInput,
  'schema-malformed-tool-args': schemaMalformedToolArgs,
  'schema-tool-output-violation': schemaToolOutputViolation,
  'schema-unknown-tool': schemaUnknownTool
};

/**
 * Load an LLM sequence by eval case id.
 * Throws if the sequence is not found.
 */
export function loadLlmSequence(caseId: string): LLMCompletionResponse[] {
  const sequence = LLM_SEQUENCES[caseId];

  if (!sequence) {
    throw new Error(
      `No LLM sequence fixture found for case "${caseId}". ` +
      `Available: ${Object.keys(LLM_SEQUENCES).join(', ')}`
    );
  }

  return sequence;
}
