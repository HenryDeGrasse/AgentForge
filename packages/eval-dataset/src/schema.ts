/**
 * agentforge-finance-eval-dataset — schema.ts
 *
 * Self-contained TypeScript types for the AgentForge finance AI eval dataset.
 * No external dependencies — copy this file into any project.
 */

// ─── Primitive types (inlined from AgentForge source) ─────────────────────────

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

// ─── Eval Enums ────────────────────────────────────────────────────────────────

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

// ─── Case Definition ───────────────────────────────────────────────────────────

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

// ─── Allowed value sets (for runtime validation) ───────────────────────────────

export const VALID_PROFILES = new Set<EvalProfile>(['empty', 'rich']);

export const VALID_STAGES = new Set<EvalStage>(['golden', 'labeled']);

export const VALID_CATEGORIES = new Set<EvalCategory>([
  'adversarial',
  'auth',
  'edge-case',
  'guardrail',
  'multi-tool',
  'scope-gate',
  'single-tool'
]);

export const VALID_DIFFICULTIES = new Set<EvalDifficulty>([
  'advanced',
  'basic',
  'intermediate'
]);

export const VALID_SUBCATEGORIES = new Set<EvalSubcategory>([
  'compliance',
  'empty-data',
  'guardrail-circuit-breaker',
  'guardrail-cost',
  'guardrail-iterations',
  'guardrail-timeout',
  'jailbreak',
  'malformed-query',
  'market-data',
  'multi-tool-orchestration',
  'out-of-scope',
  'performance',
  'portfolio-summary',
  'prompt-injection',
  'rebalance',
  'risk-analysis',
  'schema-safety',
  'scope-refusal',
  'simulate-trades',
  'stress-test',
  'tax',
  'transaction-history',
  'unowned-symbol',
  'user-scoping'
]);

export const VALID_STATUSES = new Set<VerifiedStatus>([
  'completed',
  'failed',
  'partial'
]);

export const VALID_CONFIDENCE_LEVELS = new Set<ConfidenceLevel>([
  'high',
  'low',
  'medium'
]);

export const VALID_GUARDRAILS = new Set<AgentGuardrailType>([
  'CIRCUIT_BREAKER',
  'COST_LIMIT',
  'MAX_ITERATIONS',
  'TIMEOUT'
]);

// ─── Runtime Validator ─────────────────────────────────────────────────────────

/**
 * Validates a single raw JSON object against EvalCaseDefinition.
 * Throws a descriptive Error on the first violation found.
 * Use validateEvalSuite() to validate an entire file.
 */
export function validateEvalCase(
  raw: unknown,
  index: number
): asserts raw is EvalCaseDefinition {
  const prefix = `EvalCase[${index}]`;
  const c = raw as Record<string, unknown>;

  assertString(c.id, `${prefix}.id`);
  assertMatches(
    c.id as string,
    /^[a-z0-9-]+$/,
    `${prefix}.id (must be kebab-case)`
  );

  assertString(c.profile, `${prefix}.profile`);
  assertInSet(c.profile as string, VALID_PROFILES, `${prefix}.profile`);

  assertBoolean(c.liveEligible, `${prefix}.liveEligible`);

  assertDefined(c.request, `${prefix}.request`);
  const req = c.request as Record<string, unknown>;
  assertString(req.message, `${prefix}.request.message`);
  if (req.toolNames !== undefined) {
    assertStringArray(req.toolNames, `${prefix}.request.toolNames`);
    if ((req.toolNames as string[]).length === 0) {
      throw new Error(`${prefix}.request.toolNames must not be empty`);
    }
  }

  assertDefined(c.meta, `${prefix}.meta`);
  const meta = c.meta as Record<string, unknown>;
  assertString(meta.description, `${prefix}.meta.description`);
  assertInSet(meta.stage as string, VALID_STAGES, `${prefix}.meta.stage`);
  assertInSet(
    meta.category as string,
    VALID_CATEGORIES,
    `${prefix}.meta.category`
  );
  assertInSet(
    meta.subcategory as string,
    VALID_SUBCATEGORIES,
    `${prefix}.meta.subcategory`
  );
  assertInSet(
    meta.difficulty as string,
    VALID_DIFFICULTIES,
    `${prefix}.meta.difficulty`
  );

  assertDefined(c.expect, `${prefix}.expect`);
  const exp = c.expect as Record<string, unknown>;
  assertInSet(exp.status as string, VALID_STATUSES, `${prefix}.expect.status`);
  assertInSet(
    exp.minConfidence as string,
    VALID_CONFIDENCE_LEVELS,
    `${prefix}.expect.minConfidence`
  );
  if (exp.minToolCalls !== undefined)
    assertNumber(exp.minToolCalls, `${prefix}.expect.minToolCalls`);
  if (exp.maxToolCalls !== undefined)
    assertNumber(exp.maxToolCalls, `${prefix}.expect.maxToolCalls`);
  if (exp.maxElapsedMs !== undefined)
    assertNumber(exp.maxElapsedMs, `${prefix}.expect.maxElapsedMs`);
  assertStringArray(exp.requiredTools, `${prefix}.expect.requiredTools`);
  assertStringArray(exp.mustIncludeAny, `${prefix}.expect.mustIncludeAny`);
  assertStringArray(
    exp.mustNotIncludeAny,
    `${prefix}.expect.mustNotIncludeAny`
  );
  if (exp.expectedGuardrail !== undefined) {
    assertInSet(
      exp.expectedGuardrail as string,
      VALID_GUARDRAILS,
      `${prefix}.expect.expectedGuardrail`
    );
  }
  if (
    exp.status === 'completed' &&
    (exp.mustIncludeAny as string[]).length === 0
  ) {
    throw new Error(
      `${prefix}: completed cases must have at least one mustIncludeAny phrase`
    );
  }
  if (c.runner !== undefined) {
    assertInSet(
      c.runner as string,
      new Set(['custom', 'generic']),
      `${prefix}.runner`
    );
  }
}

/**
 * Validates an entire eval suite (array of cases).
 * Throws on the first invalid case or on a duplicate id.
 * Returns the typed array on success.
 */
export function validateEvalSuite(cases: unknown[]): EvalCaseDefinition[] {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error('Eval suite must be a non-empty array');
  }
  const seenIds = new Set<string>();
  for (let i = 0; i < cases.length; i++) {
    validateEvalCase(cases[i], i);
    const id = (cases[i] as EvalCaseDefinition).id;
    if (seenIds.has(id))
      throw new Error(`Duplicate eval case id: "${id}" at index ${i}`);
    seenIds.add(id);
  }
  return cases as EvalCaseDefinition[];
}

// ─── Assertion helpers (private) ───────────────────────────────────────────────

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== 'boolean')
    throw new Error(`${path} must be a boolean, got ${typeof value}`);
}
function assertDefined(value: unknown, path: string): void {
  if (value === undefined || value === null)
    throw new Error(`${path} is required`);
}
function assertInSet(value: string, set: ReadonlySet<string>, path: string) {
  if (!set.has(value))
    throw new Error(
      `${path} must be one of [${[...set].join(', ')}], got "${value}"`
    );
}
function assertMatches(value: string, pattern: RegExp, path: string) {
  if (!pattern.test(value))
    throw new Error(`${path} must match ${pattern}, got "${value}"`);
}
function assertNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${path} must be a finite number, got ${value}`);
}
function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${path} must be a non-empty string, got ${typeof value}`);
}
function assertStringArray(
  value: unknown,
  path: string
): asserts value is string[] {
  if (!Array.isArray(value))
    throw new Error(`${path} must be an array, got ${typeof value}`);
  for (let i = 0; i < (value as unknown[]).length; i++) {
    if (typeof (value as unknown[])[i] !== 'string')
      throw new Error(`${path}[${i}] must be a string`);
  }
}
