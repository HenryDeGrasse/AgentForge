/**
 * agentforge-finance-eval-dataset — loader.ts
 *
 * Convenience helpers for reading and combining the three data files.
 * Works in Node.js 18+. No runtime dependencies beyond built-in `fs`.
 */
import type { EvalCaseDefinition } from './schema.js';

/** 62 golden-set cases — the mandatory CI suite. */
export declare function loadGoldenSets(): EvalCaseDefinition[];
/** 31 labeled-scenario cases — the nightly extended suite. */
export declare function loadLabeledScenarios(): EvalCaseDefinition[];
/** 5 MVP baseline cases — minimal smoke-test set. */
export declare function loadMvpEvals(): EvalCaseDefinition[];
/**
 * Returns all cases across all three files, deduplicated by id.
 * Golden-sets takes precedence over MVP evals for overlapping ids.
 */
export declare function loadAll(): EvalCaseDefinition[];
/**
 * Filter helpers — compose with loadAll() or any individual loader.
 *
 * @example
 * const advCases = loadAll().filter(byCategory('adversarial'));
 */
export declare function byCategory(
  category: EvalCaseDefinition['meta']['category']
): (c: EvalCaseDefinition) => boolean;
export declare function bySubcategory(
  subcategory: EvalCaseDefinition['meta']['subcategory']
): (c: EvalCaseDefinition) => boolean;
export declare function byDifficulty(
  difficulty: EvalCaseDefinition['meta']['difficulty']
): (c: EvalCaseDefinition) => boolean;
export declare function byProfile(
  profile: EvalCaseDefinition['profile']
): (c: EvalCaseDefinition) => boolean;
/** Only cases safe to run against a live (non-deterministic) LLM. */
export declare function liveEligible(c: EvalCaseDefinition): boolean;
//# sourceMappingURL=loader.d.ts.map
