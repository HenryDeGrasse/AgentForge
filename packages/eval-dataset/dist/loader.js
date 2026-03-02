/**
 * agentforge-finance-eval-dataset — loader.ts
 *
 * Convenience helpers for reading and combining the three data files.
 * Works in Node.js 18+. No runtime dependencies beyond built-in `fs`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { validateEvalSuite } from './schema.js';

const DATA_DIR = join(new URL('.', import.meta.url).pathname, '..', 'data');
function readAndValidate(filename) {
  const raw = JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf8'));
  return validateEvalSuite(raw);
}
/** 62 golden-set cases — the mandatory CI suite. */
export function loadGoldenSets() {
  return readAndValidate('golden-sets.json');
}
/** 31 labeled-scenario cases — the nightly extended suite. */
export function loadLabeledScenarios() {
  return readAndValidate('labeled-scenarios.json');
}
/** 5 MVP baseline cases — minimal smoke-test set. */
export function loadMvpEvals() {
  return readAndValidate('mvp-evals.json');
}
/**
 * Returns all cases across all three files, deduplicated by id.
 * Golden-sets takes precedence over MVP evals for overlapping ids.
 */
export function loadAll() {
  const seen = new Set();
  const result = [];
  for (const c of [
    ...loadGoldenSets(),
    ...loadLabeledScenarios(),
    ...loadMvpEvals()
  ]) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      result.push(c);
    }
  }
  return result;
}
/**
 * Filter helpers — compose with loadAll() or any individual loader.
 *
 * @example
 * const advCases = loadAll().filter(byCategory('adversarial'));
 */
export function byCategory(category) {
  return (c) => c.meta.category === category;
}
export function bySubcategory(subcategory) {
  return (c) => c.meta.subcategory === subcategory;
}
export function byDifficulty(difficulty) {
  return (c) => c.meta.difficulty === difficulty;
}
export function byProfile(profile) {
  return (c) => c.profile === profile;
}
/** Only cases safe to run against a live (non-deterministic) LLM. */
export function liveEligible(c) {
  return c.liveEligible;
}
//# sourceMappingURL=loader.js.map
