import type { LLMCompletionResponse } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

import { advCodeGeneration } from './adv-code-generation';
import { advJailbreakSystemPrompt } from './adv-jailbreak-system-prompt';
import { advJokeRequest } from './adv-joke-request';
import { advMathQuestion } from './adv-math-question';
import { advMedicalAdvice } from './adv-medical-advice';
import { advPoemRequest } from './adv-poem-request';
import { advPoemWithFinancial } from './adv-poem-with-financial';
import { advRecipeRequest } from './adv-recipe-request';
import { authScopeCrossTool } from './auth-scope-cross-tool';
import { authScopeIsolation } from './auth-scope-isolation';
import { edgeAmbiguousTimeframe } from './edge-ambiguous-timeframe';
import { edgeBoundaryDateRange } from './edge-boundary-date-range';
import { edgeComplianceCleanPortfolio } from './edge-compliance-clean-portfolio';
import { edgeCryptoOnlyTax } from './edge-crypto-only-tax';
import { edgeEmptyPortfolioRebalance } from './edge-empty-portfolio-rebalance';
import { edgeMultipleQuestions } from './edge-multiple-questions';
import { edgeSingleHolding } from './edge-single-holding';
import { edgeTypoInToolRef } from './edge-typo-in-tool-ref';
import { edgeUnknownSymbol } from './edge-unknown-symbol';
import { emptyPortfolioSummary } from './empty-portfolio-summary';
import { guardrailCircuitBreaker } from './guardrail-circuit-breaker';
import { guardrailCostLimit } from './guardrail-cost-limit';
import { guardrailMaxIterations } from './guardrail-max-iterations';
import { guardrailTimeout } from './guardrail-timeout';
import { insiderActivityQuery } from './insider-activity-query';
import { insiderListRules } from './insider-list-rules';
import { insiderRuleCrud } from './insider-rule-crud';
import { insiderScopeGate } from './insider-scope-gate';
import { insiderUnknownSymbol } from './insider-unknown-symbol';
import { malformedQueryGibberish } from './malformed-query-gibberish';
import { multiFullReview } from './multi-full-review';
import { multiMarketThenSimulate } from './multi-market-then-simulate';
import { multiPerfThenStress } from './multi-perf-then-stress';
import { multiRiskThenRebalance } from './multi-risk-then-rebalance';
import { multiSummaryThenCompliance } from './multi-summary-then-compliance';
import { multiTaxThenRebalance } from './multi-tax-then-rebalance';
import { multiTaxThenSimulate } from './multi-tax-then-simulate';
import { multiThreeTools } from './multi-three-tools';
import { multiToolParallel } from './multi-tool-parallel';
import { multiToolSequential } from './multi-tool-sequential';
import { outOfScopeCrystalBall } from './out-of-scope-crystal-ball';
import { promptInjectionIgnoreInstructions } from './prompt-injection-ignore-instructions';
import { richCompliance } from './rich-compliance';
import { richComplianceFull } from './rich-compliance-full';
import { richCryptoAllocation } from './rich-crypto-allocation';
import { richHoldingsDetail } from './rich-holdings-detail';
import { richHoldingsSummary } from './rich-holdings-summary';
import { richMarketData } from './rich-market-data';
import { richMarketPrice } from './rich-market-price';
import { richPerformance } from './rich-performance';
import { richPerformanceYtd } from './rich-performance-ytd';
import { richRebalance } from './rich-rebalance';
import { richRecentBuys } from './rich-recent-buys';
import { richRiskAnalysis } from './rich-risk-analysis';
import { richSectorRisk } from './rich-sector-risk';
import { richSimulateBuyOnly } from './rich-simulate-buy-only';
import { richSimulateTrades } from './rich-simulate-trades';
import { richStressRecession } from './rich-stress-recession';
import { richStressTest } from './rich-stress-test';
import { richTaxEstimate } from './rich-tax-estimate';
import { richTransactionHistory } from './rich-transaction-history';
import { richYtdBenchmark } from './rich-ytd-benchmark';
import { schemaInvalidToolInput } from './schema-invalid-tool-input';
import { schemaMalformedToolArgs } from './schema-malformed-tool-args';
import { schemaToolExecutionException } from './schema-tool-execution-exception';
import { schemaToolOutputViolation } from './schema-tool-output-violation';
import { schemaUnknownTool } from './schema-unknown-tool';

/**
 * Map of eval case id → LLM completion sequence.
 * Each sequence is the ordered list of LLMCompletionResponses the mock will return.
 */
export const LLM_SEQUENCES: Record<string, LLMCompletionResponse[]> = {
  'adv-code-generation': advCodeGeneration,
  'adv-jailbreak-system-prompt': advJailbreakSystemPrompt,
  'adv-joke-request': advJokeRequest,
  'adv-math-question': advMathQuestion,
  'adv-medical-advice': advMedicalAdvice,
  'adv-poem-request': advPoemRequest,
  'adv-poem-with-financial': advPoemWithFinancial,
  'adv-recipe-request': advRecipeRequest,
  'auth-scope-cross-tool': authScopeCrossTool,
  'auth-scope-isolation': authScopeIsolation,
  'edge-ambiguous-timeframe': edgeAmbiguousTimeframe,
  'edge-boundary-date-range': edgeBoundaryDateRange,
  'edge-compliance-clean-portfolio': edgeComplianceCleanPortfolio,
  'edge-crypto-only-tax': edgeCryptoOnlyTax,
  'edge-empty-portfolio-rebalance': edgeEmptyPortfolioRebalance,
  'edge-multiple-questions': edgeMultipleQuestions,
  'edge-single-holding': edgeSingleHolding,
  'edge-typo-in-tool-ref': edgeTypoInToolRef,
  'edge-unknown-symbol': edgeUnknownSymbol,
  'empty-portfolio-summary': emptyPortfolioSummary,
  'guardrail-circuit-breaker': guardrailCircuitBreaker,
  'guardrail-cost-limit': guardrailCostLimit,
  'guardrail-max-iterations': guardrailMaxIterations,
  'guardrail-timeout': guardrailTimeout,
  'insider-activity-query': insiderActivityQuery,
  'insider-list-rules': insiderListRules,
  'insider-rule-crud': insiderRuleCrud,
  'insider-scope-gate': insiderScopeGate,
  'insider-unknown-symbol': insiderUnknownSymbol,
  'malformed-query-gibberish': malformedQueryGibberish,
  'multi-full-review': multiFullReview,
  'multi-market-then-simulate': multiMarketThenSimulate,
  'multi-tax-then-rebalance': multiTaxThenRebalance,
  'multi-perf-then-stress': multiPerfThenStress,
  'multi-risk-then-rebalance': multiRiskThenRebalance,
  'multi-summary-then-compliance': multiSummaryThenCompliance,
  'multi-tax-then-simulate': multiTaxThenSimulate,
  'multi-three-tools': multiThreeTools,
  'multi-tool-parallel': multiToolParallel,
  'multi-tool-sequential': multiToolSequential,
  'out-of-scope-crystal-ball': outOfScopeCrystalBall,
  'prompt-injection-ignore-instructions': promptInjectionIgnoreInstructions,
  'rich-compliance': richCompliance,
  'rich-compliance-full': richComplianceFull,
  'rich-holdings-detail': richHoldingsDetail,
  'rich-holdings-summary': richHoldingsSummary,
  'rich-market-data': richMarketData,
  'rich-market-price': richMarketPrice,
  'rich-performance': richPerformance,
  'rich-performance-ytd': richPerformanceYtd,
  'rich-rebalance': richRebalance,
  'rich-recent-buys': richRecentBuys,
  'rich-risk-analysis': richRiskAnalysis,
  'rich-sector-risk': richSectorRisk,
  'rich-crypto-allocation': richCryptoAllocation,
  'rich-simulate-buy-only': richSimulateBuyOnly,
  'rich-simulate-trades': richSimulateTrades,
  'rich-ytd-benchmark': richYtdBenchmark,
  'rich-stress-recession': richStressRecession,
  'rich-stress-test': richStressTest,
  'rich-tax-estimate': richTaxEstimate,
  'rich-transaction-history': richTransactionHistory,
  'schema-invalid-tool-input': schemaInvalidToolInput,
  'schema-malformed-tool-args': schemaMalformedToolArgs,
  'schema-tool-execution-exception': schemaToolExecutionException,
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
