# AgentForge Finance AI Eval Dataset

**98 structured test cases for evaluating AI agents that operate on personal portfolio and investment data.**

Covers portfolio summary, risk analysis, tax estimates, compliance/diversification checks, rebalancing, trade simulation, stress testing, market data, adversarial inputs, multi-tool orchestration, auth isolation, and guardrail behavior.

Every case has a user query, the tools that must fire, required response content, forbidden content, and tool envelope checks — enabling fully automated, deterministic pass/fail evaluation with no human grading.

---

## Quick start

```bash
npm install @agentforge/finance-eval-dataset
```

```ts
import {
  loadAll,
  loadGoldenSets,
  byCategory,
  liveEligible
} from '@agentforge/finance-eval-dataset';

// All 98 unique cases
const all = loadAll();

// Only the 62 golden-set (CI-tier) cases
const golden = loadGoldenSets();

// Live-eligible single-tool cases
const liveSingleTool = loadAll()
  .filter(liveEligible)
  .filter(byCategory('single-tool'));

console.log(`Running ${liveSingleTool.length} cases`);

for (const evalCase of liveSingleTool) {
  console.log(evalCase.id, evalCase.request.message);
}
```

Or use the raw JSON directly — no npm required:

```js
import goldenSets from '@agentforge/finance-eval-dataset/data/golden-sets.json' assert { type: 'json' };
```

---

## Dataset contents

| File                          | Cases  | Live-eligible | Purpose                              |
| ----------------------------- | ------ | ------------- | ------------------------------------ |
| `data/golden-sets.json`       | 62     | 45            | Core CI suite — runs on every commit |
| `data/labeled-scenarios.json` | 31     | 31            | Extended nightly suite               |
| `data/mvp-evals.json`         | 5      | 5             | Minimal smoke-test baseline          |
| **Total unique**              | **98** | **76**        | After dedup by id                    |

### Categories

| Category      | Cases | What it exercises                                                  |
| ------------- | ----- | ------------------------------------------------------------------ |
| `single-tool` | 47    | Tool selection accuracy — one specific tool must fire              |
| `multi-tool`  | 16    | Chaining — agent must call two or more tools correctly             |
| `edge-case`   | 15    | Empty portfolio, missing data, boundary dates                      |
| `adversarial` | 8     | Jailbreaks, prompt injection, out-of-scope requests                |
| `guardrail`   | 6     | Safety guardrails (max iterations, cost, timeout, circuit breaker) |
| `auth`        | 4     | userId isolation — one user cannot see another's data              |
| `scope-gate`  | 2     | Clean refusals for non-financial requests                          |

### Subcategories (tool-level)

`portfolio-summary` · `risk-analysis` · `tax` · `transaction-history` ·
`market-data` · `performance` · `compliance` · `rebalance` · `simulate-trades` ·
`stress-test` · `multi-tool-orchestration` · `empty-data` · `schema-safety` ·
`user-scoping` · `out-of-scope` · `prompt-injection` · `jailbreak` ·
`guardrail-iterations` · `guardrail-cost` · `guardrail-timeout` · `guardrail-circuit-breaker`

---

## Case schema

```ts
interface EvalCaseDefinition {
  id: string; // Unique kebab-case identifier
  profile: 'rich' | 'empty'; // Which fixture portfolio to use
  liveEligible: boolean; // Safe to run against a live LLM

  request: {
    message: string; // User query sent to the agent
    toolNames?: string[]; // Optional: restrict to these tools only
  };

  expect: {
    status: 'completed' | 'partial' | 'failed';
    minConfidence: 'high' | 'medium' | 'low';
    requiredTools: string[]; // Must appear in invocation log
    mustIncludeAny: string[]; // OR — at least one must be in the response
    mustNotIncludeAny: string[]; // None of these may appear
    mustContainAll?: string[]; // AND — all must appear
    minToolCalls?: number;
    maxToolCalls?: number;
    mustNotCallTools?: boolean; // true = assert zero tool calls
    forbiddenTools?: string[]; // Tools that must NOT be called
    expectedGuardrail?:
      | 'CIRCUIT_BREAKER'
      | 'COST_LIMIT'
      | 'MAX_ITERATIONS'
      | 'TIMEOUT';
    toolEnvelopeChecks?: ToolEnvelopeCheck[]; // Per-tool envelope validation
    dataValueChecks?: DataValueCheck[]; // Specific values in response text
  };

  meta: {
    category: EvalCategory;
    subcategory: EvalSubcategory;
    difficulty: 'basic' | 'intermediate' | 'advanced';
    stage: 'golden' | 'labeled';
    description: string;
    addedFrom?: string;
  };
}
```

Full TypeScript types with JSDoc are in `src/schema.ts`.

---

## Example: run with Jest

```ts
import {
  loadAll,
  liveEligible,
  byCategory,
  EvalCaseDefinition
} from '@agentforge/finance-eval-dataset';

const cases = loadAll().filter(liveEligible).filter(byCategory('single-tool'));

describe('Finance agent — single-tool', () => {
  for (const evalCase of cases) {
    it(
      evalCase.id,
      async () => {
        const response = await callYourAgent(
          evalCase.request.message,
          evalCase.request.toolNames
        );

        // status
        expect(response.status).toBe(evalCase.expect.status);

        // at least one required phrase
        const lower = response.response.toLowerCase();
        const found = evalCase.expect.mustIncludeAny.some((p) =>
          lower.includes(p.toLowerCase())
        );
        expect(found).toBe(true);

        // no forbidden phrases
        for (const phrase of evalCase.expect.mustNotIncludeAny) {
          expect(lower).not.toContain(phrase.toLowerCase());
        }

        // required tools fired
        for (const tool of evalCase.expect.requiredTools) {
          expect(response.invokedToolNames).toContain(tool);
        }
      },
      30_000
    );
  }
});
```

A complete runnable example is in `examples/jest-runner.ts`.

---

## Example: upload to LangSmith

```bash
LANGCHAIN_API_KEY=<key> npx tsx examples/langsmith-upload.ts
```

See `examples/langsmith-upload.ts` for the full script.

---

## Filter helpers

```ts
import {
  loadAll,
  byCategory,
  bySubcategory,
  byDifficulty,
  byProfile,
  liveEligible
} from '@agentforge/finance-eval-dataset';

// Advanced adversarial cases
loadAll().filter(byCategory('adversarial')).filter(byDifficulty('advanced'));

// All tax cases (live-eligible)
loadAll().filter(bySubcategory('tax')).filter(liveEligible);

// Empty-portfolio edge cases
loadAll().filter(byProfile('empty'));
```

---

## Adapting to your agent

The dataset uses 10 tool names from the AgentForge project. If your agent
uses different names, either:

1. Map them in your test runner: `const mapped = requiredTools.map(nameMap)`
2. Use the `meta.subcategory` field to select cases by capability instead of tool name

---

## Source

Built from [AgentForge](https://github.com/henrydegrasse/AgentForge) — an
AI-powered portfolio advisor built on [Ghostfolio](https://ghostfol.io).

The eval framework follows a three-tier strategy:

- **Fast (CI):** mocked LLM sequences, runs in <30s on every commit
- **Pre-merge:** live LLM, gates PRs, ~$0.05 per run
- **Nightly:** live LLM, full suite, ~$0.50 per run

---

## License

MIT
