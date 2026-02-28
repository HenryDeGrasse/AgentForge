import type { AgentGuardrailType } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import type { ConfidenceLevel } from '@ghostfolio/api/app/endpoints/ai/contracts/final-response.schema';

// ─── Eval Enums ────────────────────────────────────────────────────────────────

export type EvalProfile = 'empty' | 'rich';
export type EvalStage = 'golden' | 'labeled';

export type EvalCategory =
  | 'adversarial'
  | 'auth'
  | 'edge-case'
  | 'guardrail'
  | 'multi-tool'
  | 'scope-gate'
  | 'single-tool';

export type EvalDifficulty = 'advanced' | 'basic' | 'intermediate';

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
  | 'user-scoping';

export type VerifiedStatus = 'completed' | 'failed' | 'partial';

// ─── Case Definition ───────────────────────────────────────────────────────────

export interface EvalCaseMeta {
  addedFrom?: string;
  category: EvalCategory;
  description: string;
  difficulty: EvalDifficulty;
  stage: EvalStage;
  subcategory: EvalSubcategory;
}

export interface ToolEnvelopeCheck {
  /** For error envelopes: expected error code */
  errorCode?:
    | 'tool_execution_failed'
    | 'tool_not_found'
    | 'tool_output_validation_error'
    | 'tool_validation_error';
  /** Only meaningful for tool_validation_error / tool_output_validation_error */
  errorIssuesNonEmpty?: boolean;
  /** Status expected on this tool's envelope */
  expectStatus: 'error' | 'partial' | 'success';
  /** For success/partial: keys that must exist on envelope.data */
  dataFieldsPresent?: string[];
  /** Tool name to match */
  toolName: string;
  /** For success/partial: warning codes expected in envelope.data.warnings[].code */
  warningsInclude?: string[];
}

export interface DataValueCheck {
  /** Label used in failure messages */
  label: string;
  /** Substring that must appear in the response text (case-insensitive) */
  valueInResponse: string;
}

export interface EvalCaseExpect {
  /** Numeric/data values (from tool output) that must appear in the response */
  dataValueChecks?: DataValueCheck[];
  expectedGuardrail?: AgentGuardrailType;
  /** Tools that must NOT have been called — fail if any of these appear in invocationLog */
  forbiddenTools?: string[];
  maxElapsedMs?: number;
  maxToolCalls?: number;
  minConfidence: ConfidenceLevel;
  minToolCalls: number;
  /** ALL of these must appear in the response (AND logic, case-insensitive) */
  mustContainAll?: string[];
  /** At least one of these must appear in the response (OR logic, case-insensitive) */
  mustIncludeAny: string[];
  mustNotIncludeAny: string[];
  /** When true, asserts that zero tools were called — primary invariant for adversarial cases */
  mustNotCallTools?: boolean;
  requiredTools: string[];
  status: VerifiedStatus;
  toolEnvelopeChecks?: ToolEnvelopeCheck[];
}

export interface EvalCaseDefinition {
  expect: EvalCaseExpect;
  guardrailOverrides?: Record<string, unknown>;
  id: string;
  liveEligible: boolean;
  meta: EvalCaseMeta;
  profile: EvalProfile;
  request: {
    message: string;
    toolNames?: string[];
  };
  runner?: 'custom' | 'generic';
}

// ─── Allowed Values ────────────────────────────────────────────────────────────

const VALID_PROFILES: ReadonlySet<string> = new Set<EvalProfile>([
  'empty',
  'rich'
]);

const VALID_STAGES: ReadonlySet<string> = new Set<EvalStage>([
  'golden',
  'labeled'
]);

const VALID_CATEGORIES: ReadonlySet<string> = new Set<EvalCategory>([
  'adversarial',
  'auth',
  'edge-case',
  'guardrail',
  'multi-tool',
  'scope-gate',
  'single-tool'
]);

const VALID_DIFFICULTIES: ReadonlySet<string> = new Set<EvalDifficulty>([
  'advanced',
  'basic',
  'intermediate'
]);

const VALID_SUBCATEGORIES: ReadonlySet<string> = new Set<EvalSubcategory>([
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
  'user-scoping'
]);

const VALID_STATUSES: ReadonlySet<string> = new Set<VerifiedStatus>([
  'completed',
  'failed',
  'partial'
]);

const VALID_CONFIDENCE_LEVELS: ReadonlySet<string> = new Set([
  'high',
  'low',
  'medium'
]);

const VALID_GUARDRAILS: ReadonlySet<string> = new Set<AgentGuardrailType>([
  'CIRCUIT_BREAKER',
  'COST_LIMIT',
  'MAX_ITERATIONS',
  'TIMEOUT'
]);

// ─── Runtime Validator ─────────────────────────────────────────────────────────

export function validateEvalCase(
  raw: unknown,
  index: number
): asserts raw is EvalCaseDefinition {
  const prefix = `EvalCase[${index}]`;
  const c = raw as Record<string, unknown>;

  // id
  assertString(c.id, `${prefix}.id`);
  assertMatches(
    c.id as string,
    /^[a-z0-9-]+$/,
    `${prefix}.id (must be kebab-case)`
  );

  // profile
  assertString(c.profile, `${prefix}.profile`);
  assertInSet(c.profile as string, VALID_PROFILES, `${prefix}.profile`);

  // liveEligible
  assertBoolean(c.liveEligible, `${prefix}.liveEligible`);

  // request
  assertDefined(c.request, `${prefix}.request`);
  const req = c.request as Record<string, unknown>;
  assertString(req.message, `${prefix}.request.message`);
  if (req.toolNames !== undefined) {
    assertStringArray(req.toolNames, `${prefix}.request.toolNames`);

    if ((req.toolNames as string[]).length === 0) {
      throw new Error(`${prefix}.request.toolNames must not be empty`);
    }
  }

  // meta
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

  // expect
  assertDefined(c.expect, `${prefix}.expect`);
  const exp = c.expect as Record<string, unknown>;
  assertInSet(exp.status as string, VALID_STATUSES, `${prefix}.expect.status`);
  assertInSet(
    exp.minConfidence as string,
    VALID_CONFIDENCE_LEVELS,
    `${prefix}.expect.minConfidence`
  );
  assertNumber(exp.minToolCalls, `${prefix}.expect.minToolCalls`);
  assertStringArray(exp.requiredTools, `${prefix}.expect.requiredTools`);
  assertStringArray(exp.mustIncludeAny, `${prefix}.expect.mustIncludeAny`);
  assertStringArray(
    exp.mustNotIncludeAny,
    `${prefix}.expect.mustNotIncludeAny`
  );
  if (exp.maxToolCalls !== undefined) {
    assertNumber(exp.maxToolCalls, `${prefix}.expect.maxToolCalls`);
  }
  if (exp.maxElapsedMs !== undefined) {
    assertNumber(exp.maxElapsedMs, `${prefix}.expect.maxElapsedMs`);
  }
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

  // runner (optional)
  if (c.runner !== undefined) {
    assertInSet(
      c.runner as string,
      new Set(['custom', 'generic']),
      `${prefix}.runner`
    );
  }
}

export function validateEvalSuite(cases: unknown[]): EvalCaseDefinition[] {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error('Eval suite must be a non-empty array');
  }

  const seenIds = new Set<string>();

  for (let i = 0; i < cases.length; i++) {
    validateEvalCase(cases[i], i);

    const id = (cases[i] as EvalCaseDefinition).id;

    if (seenIds.has(id)) {
      throw new Error(`Duplicate eval case id: "${id}" at index ${i}`);
    }

    seenIds.add(id);
  }

  return cases as EvalCaseDefinition[];
}

// ─── Assertion Helpers ─────────────────────────────────────────────────────────

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean, got ${typeof value}`);
  }
}

function assertDefined(value: unknown, path: string): void {
  if (value === undefined || value === null) {
    throw new Error(`${path} is required`);
  }
}

function assertInSet(value: string, set: ReadonlySet<string>, path: string) {
  if (!set.has(value)) {
    throw new Error(
      `${path} must be one of [${[...set].join(', ')}], got "${value}"`
    );
  }
}

function assertMatches(value: string, pattern: RegExp, path: string) {
  if (!pattern.test(value)) {
    throw new Error(`${path} must match ${pattern}, got "${value}"`);
  }
}

function assertNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number, got ${value}`);
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path} must be a non-empty string, got ${typeof value}`);
  }
}

function assertStringArray(
  value: unknown,
  path: string
): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array, got ${typeof value}`);
  }

  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      throw new Error(`${path}[${i}] must be a string`);
    }
  }
}
