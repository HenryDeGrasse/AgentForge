# AI Agent Eval System

Evaluation suite for the AgentForge `ReactAgentService` — a ReAct-loop AI agent built on top of Ghostfolio's portfolio data. Follows the **Gauntlet AI three-tier eval strategy**: cheap mocked tests on every commit, live LLM tests pre-merge, and nightly coverage runs.

---

## Architecture

```
test/ai/
├── eval-case.schema.ts        # Shared types + runtime validator (EvalCaseDefinition)
├── eval-assert.ts             # Shared assertion helpers (used by all tiers)
├── golden-sets.json           # Stage 1 case definitions (21 cases)
├── golden-sets-fast.spec.ts   # Stage 1 runner — mocked LLM, runs every commit
├── golden-sets.spec.ts        # Stage 1 runner — live LLM, runs pre-merge
├── labeled-scenarios.json     # Stage 2 case definitions (29 cases)
├── labeled-scenarios.spec.ts  # Stage 2 runner — live LLM, nightly only
├── coverage-matrix.ts         # CLI reporter — regenerates this README table
└── fixtures/
    ├── tool-profiles.ts        # Deterministic tool stubs (rich / empty)
    └── llm-sequences/          # Scripted LLM turn-by-turn responses (21 files)
```

---

## Three-Tier Strategy

| Tier                    | Trigger                | LLM                        | Budget           | Cases            |
| ----------------------- | ---------------------- | -------------------------- | ---------------- | ---------------- |
| **Stage 1 — Fast**      | Every commit           | Mocked (scripted fixtures) | ~0.4 s, $0       | 21               |
| **Stage 1 — Pre-merge** | `merge_group` / PRs    | Live (OpenAI)              | < 5 min, ~$0.25  | 21 live-eligible |
| **Stage 2 — Nightly**   | `schedule` (02:00 UTC) | Live (OpenAI)              | < 15 min, ~$1.00 | 29               |

### Running locally

```bash
# Stage 1 fast (mocked, zero cost, always safe to run)
npx jest --config apps/api/jest.config.ts --testPathPatterns='golden-sets-fast' --no-coverage

# Stage 1 live (needs OPENAI_API_KEY + running API on :3333)
RUN_GOLDEN_EVALS=1 npx jest --config apps/api/jest.config.ts --testPathPatterns='golden-sets.spec' --no-coverage --runInBand

# Stage 2 nightly (needs OPENAI_API_KEY + running API on :3333)
RUN_LABELED_EVALS=1 npx jest --config apps/api/jest.config.ts --testPathPatterns='labeled-scenarios' --no-coverage --runInBand

# Regenerate this README's coverage table
npx ts-node -P apps/api/tsconfig.spec.json apps/api/test/ai/coverage-matrix.ts --output=markdown > apps/api/test/ai/README.md
```

---

## What Each Tier Tests

### Stage 1 — Golden Sets (`golden-sets.json`)

The 21 mandatory cases that run on every commit. Split into a **fast tier** (deterministic mocked LLM) and a **pre-merge tier** (live LLM, same cases):

| Group                       | Cases | What it verifies                                                        |
| --------------------------- | ----: | ----------------------------------------------------------------------- |
| Single-tool (rich profile)  |     8 | Each of the 8 tools fires exactly once, returns valid schema            |
| Edge-case (empty portfolio) |     1 | Agent handles zero-data gracefully, no hallucination                    |
| Multi-tool orchestration    |     2 | Agent chains tools correctly, deduplicates calls                        |
| Auth scoping                |     2 | `context.userId` isolation — tools never see a foreign user's data      |
| Guardrails                  |     4 | Max-iterations cap, cost limit, timeout, circuit breaker                |
| Schema safety               |     4 | Invalid inputs, unknown tools, malformed args, output schema violations |

### Stage 2 — Labeled Scenarios (`labeled-scenarios.json`)

29 richer nightly cases across all subcategories, including multi-turn, degraded-data, and edge conditions not practical to mock cheaply.

---

## Key Design Decisions

**Schema extraction** — All 8 tool input/output schemas live in `src/app/endpoints/ai/tools/schemas/` as exported constants. Both production tool classes and eval fixtures import from the same source — zero schema drift between test and prod.

**`additionalProperties: false`** — Tool input schemas reject unknown fields. This is intentional: it's what stops a jailbroken LLM from injecting `requestedUserId` into tool args to access another user's data. The auth-scope eval cases verify this boundary by checking `invocationLog[].userId` rather than injecting via args.

**Mocked LLM sequences** — Each fast-tier case has a scripted `LLMCompletionResponse[]` in `fixtures/llm-sequences/`. The mock LLM returns responses in order. This gives deterministic, $0, sub-second coverage of all 21 cases.

**Custom runner cases** — `guardrail-timeout` and `guardrail-circuit-breaker` are marked `"runner": "custom"` in the JSON so the generic `for` loop skips them. They need special setup (`jest.spyOn(Date, 'now')`) handled in dedicated `it()` blocks.

**Live-eligible flag** — Guardrail and schema-safety cases are `liveEligible: false` because they test deterministic agent logic (iteration counting, error shaping) — re-running against a live LLM adds cost without signal. Single-tool, multi-tool, and edge-case tests are `liveEligible: true`.

---

## Coverage Matrix

> Regenerated: 2026-02-24 — run `coverage-matrix.ts` to refresh after adding cases.

### Summary

| Tier                                       | Cases | Live-eligible |
| ------------------------------------------ | ----: | ------------: |
| Stage 1 — Golden Sets (fast, every commit) |    21 |            11 |
| Stage 2 — Labeled Scenarios (nightly)      |    29 |            29 |
| Total                                      |    50 |            40 |

### Coverage by Subcategory

| Subcategory               | Category       | Golden | Labeled | Live | Total | Difficulty      |
| ------------------------- | -------------- | -----: | ------: | ---: | ----: | --------------- |
| compliance                | 🔧 single-tool |      1 |       2 |    3 |     3 | 🟡 intermediate |
| empty-data                | ⚠️ edge-case   |      1 |       5 |    6 |     6 | 🟢 basic        |
| guardrail-circuit-breaker | 🚧 guardrail   |      1 |       0 |    0 |     1 | 🔴 advanced     |
| guardrail-cost            | 🚧 guardrail   |      1 |       0 |    0 |     1 | 🟡 intermediate |
| guardrail-iterations      | 🚧 guardrail   |      1 |       0 |    0 |     1 | 🟡 intermediate |
| guardrail-timeout         | 🚧 guardrail   |      1 |       0 |    0 |     1 | 🟡 intermediate |
| market-data               | 🔧 single-tool |      1 |       2 |    3 |     3 | 🟡 intermediate |
| multi-tool-orchestration  | 🔗 multi-tool  |      2 |       4 |    6 |     6 | 🔴 advanced     |
| performance               | 🔧 single-tool |      1 |       2 |    3 |     3 | 🟢 basic        |
| portfolio-summary         | 🔧 single-tool |      1 |       5 |    6 |     6 | 🟢 basic        |
| rebalance                 | 🔧 single-tool |      1 |       2 |    3 |     3 | 🟡 intermediate |
| risk-analysis             | 🔧 single-tool |      1 |       2 |    3 |     3 | 🟡 intermediate |
| schema-safety             | 🛡️ adversarial |      4 |       0 |    0 |     4 | 🔴 advanced     |
| tax                       | 🔧 single-tool |      1 |       3 |    4 |     4 | 🟡 intermediate |
| transaction-history       | 🔧 single-tool |      1 |       2 |    3 |     3 | 🟢 basic        |
| user-scoping              | 🔐 auth        |      2 |       0 |    0 |     2 | 🟡 intermediate |

### By Category

| Category       | Total | Live |
| -------------- | ----: | ---: |
| 🛡️ adversarial |     4 |    0 |
| 🔐 auth        |     2 |    0 |
| ⚠️ edge-case   |     6 |    6 |
| 🚧 guardrail   |     4 |    0 |
| 🔗 multi-tool  |     6 |    6 |
| 🔧 single-tool |    28 |   28 |

### Coverage Gaps

- ❌ **malformed-query** — no eval cases yet (requires live LLM; deferred to Stage 3)
- ❌ **prompt-injection** — no eval cases yet (requires live LLM; deferred to Stage 3)

---

## CI Workflow

Defined in `.github/workflows/evals.yml`:

```
push / PR opened
  └── fast-evals job          (mocked, <30s, always runs)

merge_group / non-fork PR
  └── pre-merge-evals job     (live LLM, <5min, needs OPENAI_API_KEY secret)

schedule (02:00 UTC nightly)
  └── nightly-evals job       (live LLM, <15min, uploads coverage-matrix artifact)
```

---

## Adding New Cases

1. **Pick the right file**: `golden-sets.json` for mandatory-every-commit cases, `labeled-scenarios.json` for richer nightly cases.
2. **Add an LLM sequence** (fast tier only): create `fixtures/llm-sequences/<case-id>.ts` with the scripted `LLMCompletionResponse[]`.
3. **Export it** from `fixtures/llm-sequences/index.ts`.
4. **Set `liveEligible`** honestly: `false` for guardrail/schema cases, `true` for tool-behavior cases.
5. **Set `runner: "custom"`** if the case needs `Date.now` mocking or other special setup — then add a dedicated `it()` block in `golden-sets-fast.spec.ts`.
6. **Regenerate the README table**: `npx ts-node -P apps/api/tsconfig.spec.json apps/api/test/ai/coverage-matrix.ts --output=markdown > apps/api/test/ai/README.md`
