/**
 * agentforge-finance-eval-dataset — schema.ts
 *
 * Self-contained TypeScript types for the AgentForge finance AI eval dataset.
 * No external dependencies — copy this file into any project.
 */
/**
 * Which guardrail fired when the agent stopped before producing a full answer.
 * CIRCUIT_BREAKER — repeated tool failures tripped the breaker.
 * COST_LIMIT      — estimated LLM spend exceeded the configured ceiling.
 * MAX_ITERATIONS  — ReAct loop hit the iteration cap without converging.
 * TIMEOUT         — per-turn deadline elapsed.
 */
export type AgentGuardrailType =
  | 'CIRCUIT_BREAKER'
  | 'COST_LIMIT'
  | 'MAX_ITERATIONS'
  | 'TIMEOUT';
/** Confidence level assigned by the response verifier after each agent run. */
export type ConfidenceLevel = 'high' | 'low' | 'medium';
/** Which fixture profile the test uses: a realistic 10-stock portfolio or an empty one. */
export type EvalProfile = 'empty' | 'rich';
/** Which evaluation tier this case belongs to. */
export type EvalStage = 'golden' | 'labeled';
/**
 * High-level category grouping eval cases by what they exercise:
 *
 * - single-tool       A single specific tool must fire.
 * - multi-tool        The agent must chain two or more tools.
 * - edge-case         Degenerate inputs: empty portfolio, missing data, boundary dates.
 * - adversarial       Inputs designed to break or bypass the agent.
 * - guardrail         Tests that a specific safety guardrail fires correctly.
 * - auth              Verifies userId isolation — one user cannot see another's data.
 * - scope-gate        Out-of-scope requests the agent must politely decline.
 */
export type EvalCategory =
  | 'adversarial'
  | 'auth'
  | 'edge-case'
  | 'guardrail'
  | 'multi-tool'
  | 'scope-gate'
  | 'single-tool';
/** Rough implementation complexity. */
export type EvalDifficulty = 'advanced' | 'basic' | 'intermediate';
/**
 * Subcategory — maps 1-to-1 with the tool or failure mode under test.
 * See README for descriptions of each subcategory.
 */
export type EvalSubcategory =
  | 'compliance'
  | 'empty-data'
  | 'guardrail-circuit-breaker'
  | 'guardrail-cost'
  | 'guardrail-iterations'
  | 'guardrail-timeout'
  | 'jailbreak'
  | 'malformed-query'
  | 'market-data'
  | 'multi-tool-orchestration'
  | 'out-of-scope'
  | 'performance'
  | 'portfolio-summary'
  | 'prompt-injection'
  | 'rebalance'
  | 'risk-analysis'
  | 'schema-safety'
  | 'scope-refusal'
  | 'simulate-trades'
  | 'stress-test'
  | 'tax'
  | 'transaction-history'
  | 'unowned-symbol'
  | 'user-scoping';
/** Status the agent response must have for the case to pass. */
export type VerifiedStatus = 'completed' | 'failed' | 'partial';
/** Metadata about when and why the case was written. */
export interface EvalCaseMeta {
  /** Which PR / epic introduced this case — for traceability. */
  addedFrom?: string;
  category: EvalCategory;
  description: string;
  difficulty: EvalDifficulty;
  stage: EvalStage;
  subcategory: EvalSubcategory;
}
/** Per-tool envelope validation — inspects the raw tool result envelope. */
export interface ToolEnvelopeCheck {
  /**
   * Keys that must exist on envelope.data (success / partial envelopes only).
   */
  dataFieldsPresent?: string[];
  /** For error envelopes: the expected error.code string. */
  errorCode?:
    | 'tool_execution_failed'
    | 'tool_not_found'
    | 'tool_output_validation_error'
    | 'tool_validation_error';
  /** When true, asserts that error.issues is a non-empty array. */
  errorIssuesNonEmpty?: boolean;
  /** Status the envelope must report. */
  expectStatus: 'error' | 'partial' | 'success';
  /** Tool name to match (must equal the tool's registered name exactly). */
  toolName: string;
  /** warning.code values that must appear in envelope.data.warnings[]. */
  warningsInclude?: string[];
}
/** Asserts that a specific data value from tool output appears in the response text. */
export interface DataValueCheck {
  /** Human-readable label used in failure messages. */
  label: string;
  /** Substring that must appear in the final response (case-insensitive). */
  valueInResponse: string;
}
/** Full set of pass/fail criteria for a single eval case. */
export interface EvalCaseExpect {
  /**
   * Specific data values (from tool output) that must appear verbatim
   * in the agent's final response.
   */
  dataValueChecks?: DataValueCheck[];
  /** When set, the named guardrail must have fired. */
  expectedGuardrail?: AgentGuardrailType;
  /**
   * Tools that must NOT have been called.
   * Fails the case if any appear in the invocation log.
   */
  forbiddenTools?: string[];
  /** Response must take no longer than this (milliseconds). */
  maxElapsedMs?: number;
  /** Agent must not call more tools than this. */
  maxToolCalls?: number;
  /** Minimum confidence level the verifier must assign. */
  minConfidence: ConfidenceLevel;
  /** Agent must call at least this many tools. */
  minToolCalls?: number;
  /**
   * Every phrase in this list must appear in the response (AND logic,
   * case-insensitive).
   */
  mustContainAll?: string[];
  /**
   * At least one phrase in this list must appear in the response (OR logic,
   * case-insensitive). Required for all completed cases.
   */
  mustIncludeAny: string[];
  /** None of these phrases may appear in the response. */
  mustNotIncludeAny: string[];
  /**
   * When true, the case asserts that zero tools were called.
   * Primary invariant for adversarial / out-of-scope cases.
   */
  mustNotCallTools?: boolean;
  /**
   * These tools must appear in the agent's invocation log.
   * For live-tier runs, matched against invokedToolNames in the response.
   */
  requiredTools: string[];
  /** Expected status of the verified response. */
  status: VerifiedStatus;
  /** Per-tool envelope structure checks (fast-tier only). */
  toolEnvelopeChecks?: ToolEnvelopeCheck[];
}
/**
 * A single eval case definition.
 *
 * The three data files in this dataset (golden-sets.json, labeled-scenarios.json,
 * mvp-evals.json) each contain an array of these objects.
 */
export interface EvalCaseDefinition {
  /** Pass/fail criteria. */
  expect: EvalCaseExpect;
  /**
   * Override default agent guardrails for this case only.
   * E.g. { maxIterations: 2 } for a guardrail-iterations test.
   */
  guardrailOverrides?: Record<string, unknown>;
  /** Unique kebab-case identifier. Must be unique across all files. */
  id: string;
  /**
   * When true, safe to run against a live LLM (non-deterministic outcome
   * acceptable). When false, the expected behaviour is deterministic
   * (guardrail count, schema rejection) and a live LLM adds cost without signal.
   */
  liveEligible: boolean;
  /** Descriptive metadata for filtering and reporting. */
  meta: EvalCaseMeta;
  /** Fixture profile — which portfolio dataset to use. */
  profile: EvalProfile;
  /** The user message sent to the agent and optional tool restrictions. */
  request: {
    message: string;
    /** When set, limits the agent to only these tools for this case. */
    toolNames?: string[];
  };
  /**
   * 'generic' — handled by the standard for-loop runner (default).
   * 'custom'  — needs special setup (e.g. Date.now mocking); handled
   *             by a dedicated it() block in the test file.
   */
  runner?: 'custom' | 'generic';
}
export declare const VALID_PROFILES: Set<EvalProfile>;
export declare const VALID_STAGES: Set<EvalStage>;
export declare const VALID_CATEGORIES: Set<EvalCategory>;
export declare const VALID_DIFFICULTIES: Set<EvalDifficulty>;
export declare const VALID_SUBCATEGORIES: Set<EvalSubcategory>;
export declare const VALID_STATUSES: Set<VerifiedStatus>;
export declare const VALID_CONFIDENCE_LEVELS: Set<ConfidenceLevel>;
export declare const VALID_GUARDRAILS: Set<AgentGuardrailType>;
/**
 * Validates a single raw JSON object against EvalCaseDefinition.
 * Throws a descriptive Error on the first violation found.
 * Use validateEvalSuite() to validate an entire file.
 */
export declare function validateEvalCase(
  raw: unknown,
  index: number
): asserts raw is EvalCaseDefinition;
/**
 * Validates an entire eval suite (array of cases).
 * Throws on the first invalid case or on a duplicate id.
 * Returns the typed array on success.
 */
export declare function validateEvalSuite(
  cases: unknown[]
): EvalCaseDefinition[];
//# sourceMappingURL=schema.d.ts.map
