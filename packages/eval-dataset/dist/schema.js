/**
 * agentforge-finance-eval-dataset — schema.ts
 *
 * Self-contained TypeScript types for the AgentForge finance AI eval dataset.
 * No external dependencies — copy this file into any project.
 */
// ─── Allowed value sets (for runtime validation) ───────────────────────────────
export const VALID_PROFILES = new Set(['empty', 'rich']);
export const VALID_STAGES = new Set(['golden', 'labeled']);
export const VALID_CATEGORIES = new Set([
  'adversarial',
  'auth',
  'edge-case',
  'guardrail',
  'multi-tool',
  'scope-gate',
  'single-tool'
]);
export const VALID_DIFFICULTIES = new Set([
  'advanced',
  'basic',
  'intermediate'
]);
export const VALID_SUBCATEGORIES = new Set([
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
export const VALID_STATUSES = new Set(['completed', 'failed', 'partial']);
export const VALID_CONFIDENCE_LEVELS = new Set(['high', 'low', 'medium']);
export const VALID_GUARDRAILS = new Set([
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
export function validateEvalCase(raw, index) {
  const prefix = `EvalCase[${index}]`;
  const c = raw;
  assertString(c.id, `${prefix}.id`);
  assertMatches(c.id, /^[a-z0-9-]+$/, `${prefix}.id (must be kebab-case)`);
  assertString(c.profile, `${prefix}.profile`);
  assertInSet(c.profile, VALID_PROFILES, `${prefix}.profile`);
  assertBoolean(c.liveEligible, `${prefix}.liveEligible`);
  assertDefined(c.request, `${prefix}.request`);
  const req = c.request;
  assertString(req.message, `${prefix}.request.message`);
  if (req.toolNames !== undefined) {
    assertStringArray(req.toolNames, `${prefix}.request.toolNames`);
    if (req.toolNames.length === 0) {
      throw new Error(`${prefix}.request.toolNames must not be empty`);
    }
  }
  assertDefined(c.meta, `${prefix}.meta`);
  const meta = c.meta;
  assertString(meta.description, `${prefix}.meta.description`);
  assertInSet(meta.stage, VALID_STAGES, `${prefix}.meta.stage`);
  assertInSet(meta.category, VALID_CATEGORIES, `${prefix}.meta.category`);
  assertInSet(
    meta.subcategory,
    VALID_SUBCATEGORIES,
    `${prefix}.meta.subcategory`
  );
  assertInSet(meta.difficulty, VALID_DIFFICULTIES, `${prefix}.meta.difficulty`);
  assertDefined(c.expect, `${prefix}.expect`);
  const exp = c.expect;
  assertInSet(exp.status, VALID_STATUSES, `${prefix}.expect.status`);
  assertInSet(
    exp.minConfidence,
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
      exp.expectedGuardrail,
      VALID_GUARDRAILS,
      `${prefix}.expect.expectedGuardrail`
    );
  }
  if (exp.status === 'completed' && exp.mustIncludeAny.length === 0) {
    throw new Error(
      `${prefix}: completed cases must have at least one mustIncludeAny phrase`
    );
  }
  if (c.runner !== undefined) {
    assertInSet(c.runner, new Set(['custom', 'generic']), `${prefix}.runner`);
  }
}
/**
 * Validates an entire eval suite (array of cases).
 * Throws on the first invalid case or on a duplicate id.
 * Returns the typed array on success.
 */
export function validateEvalSuite(cases) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error('Eval suite must be a non-empty array');
  }
  const seenIds = new Set();
  for (let i = 0; i < cases.length; i++) {
    validateEvalCase(cases[i], i);
    const id = cases[i].id;
    if (seenIds.has(id))
      throw new Error(`Duplicate eval case id: "${id}" at index ${i}`);
    seenIds.add(id);
  }
  return cases;
}
// ─── Assertion helpers (private) ───────────────────────────────────────────────
function assertBoolean(value, path) {
  if (typeof value !== 'boolean')
    throw new Error(`${path} must be a boolean, got ${typeof value}`);
}
function assertDefined(value, path) {
  if (value === undefined || value === null)
    throw new Error(`${path} is required`);
}
function assertInSet(value, set, path) {
  if (!set.has(value))
    throw new Error(
      `${path} must be one of [${[...set].join(', ')}], got "${value}"`
    );
}
function assertMatches(value, pattern, path) {
  if (!pattern.test(value))
    throw new Error(`${path} must match ${pattern}, got "${value}"`);
}
function assertNumber(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${path} must be a finite number, got ${value}`);
}
function assertString(value, path) {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${path} must be a non-empty string, got ${typeof value}`);
}
function assertStringArray(value, path) {
  if (!Array.isArray(value))
    throw new Error(`${path} must be an array, got ${typeof value}`);
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string')
      throw new Error(`${path}[${i}] must be a string`);
  }
}
//# sourceMappingURL=schema.js.map
