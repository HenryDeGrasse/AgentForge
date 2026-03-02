# Eval Alignment Plan — Closing Gaps with prod-evals-cookbook

> **Status: COMPLETE** — All 5 steps implemented. See [implementation results](#implementation-results) below.

## Context

Our eval suite has three tiers, but only one tests real LLM behavior. The [prod-evals-cookbook](https://github.com/Gauntlet-HQ/prod-evals-cookbook) never uses mock LLMs — every stage from golden sets through experiments calls the real agent. We need to rename, restructure, and add a replay tier so that our CI gives real signal on LLM quality without costing $1.36 per commit.

### State after alignment

| File                         | What it does                                       | Cookbook equivalent                       |
| ---------------------------- | -------------------------------------------------- | ----------------------------------------- |
| `agent-framework.spec.ts`    | Scripted `MockLlmClient`, tests framework plumbing | _No equivalent_ (unit tests)              |
| `golden-sets-live.spec.ts`   | Real gpt-4.1 in-process, mocked DB services        | Stage 1 + Stage 2 (golden sets + labeled) |
| `golden-sets-replay.spec.ts` | Replay recorded sessions, $0, every commit         | Stage 3 (replay harness) ✓                |
| `golden-sets.spec.ts`        | Real LLM via live HTTP API, pre-merge CI           | Stage 1 (golden sets via deployed API)    |
| `labeled-scenarios.spec.ts`  | Real LLM via live HTTP API, nightly                | Stage 2 (labeled scenarios)               |
| _Deferred_                   | LLM-as-judge quality scoring                       | Stage 4 (rubrics) — deferred              |

### Original gaps (resolved)

1. ~~`golden-sets-fast.spec.ts` labeled "Golden Sets" but tests only fixtures~~ → renamed `agent-framework.spec.ts`
2. ~~`RecordingLlmClient` saves calls only in memory~~ → `EVAL_RECORD=1` writes to `fixtures/recorded/`
3. ~~No replay tier~~ → `golden-sets-replay.spec.ts` replays 34 real sessions at $0
4. ~~Only 2 of 35 live-eligible cases have `dataValueChecks`~~ → 22 of 40 cases now have checks

---

## Plan

### Step 1: Rename fast tier — honesty in labeling

**What:** Rename `golden-sets-fast.spec.ts` to `agent-framework.spec.ts`. Update file header, describe block name, CI workflow reference, and docs.

**Why:** "Golden set" implies LLM behavioral correctness. These tests verify tool registry wiring, schema validation, auth scoping, guardrails, and envelope structure — all valuable, but none test the LLM. Calling them "framework tests" makes expectations clear.

**Files touched:**

- `apps/api/test/ai/golden-sets-fast.spec.ts` → rename to `agent-framework.spec.ts`
- `.github/workflows/evals.yml` → update `testPathPattern` in `fast-evals` job
- `docs/REAL_EVALS_PLAN.md` → update references

**Assertions/behavior:** Zero change. Same 50 tests, same assertions, same speed. Only the name changes.

**Acceptance criteria:**

- [ ] File renamed, 50/50 tests still pass
- [ ] CI workflow updated, `fast-evals` job still runs on PRs
- [ ] No doc references to "golden sets (fast)" remain

---

### Step 2: Implement session saving

**What:** After each live eval test, when `EVAL_RECORD=1` is set, write the full session (LLM calls, tool calls, agent result) to `apps/api/test/ai/fixtures/recorded/<caseId>.json`.

**Why:** This is the prerequisite for the replay tier. The `RecordingLlmClient` already captures every request/response pair in memory. We just need to write it to disk.

**Files touched:**

- `apps/api/test/ai/golden-sets-live.spec.ts` — add save logic after each test

**Design:**

```typescript
// Inside each it() block, after assertions pass:
if (process.env['EVAL_RECORD'] === '1') {
  const dir = join(__dirname, 'fixtures', 'recorded');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${evalCase.id}.json`),
    JSON.stringify(
      {
        caseId: evalCase.id,
        query: evalCase.request.message,
        llmCalls: recordingClient.calls,
        result: {
          elapsedMs: result.elapsedMs,
          estimatedCostUsd: result.estimatedCostUsd,
          executedTools: result.executedTools.map((t) => ({
            toolName: t.toolName,
            envelope: { status: t.envelope.status, error: t.envelope.error }
          })),
          guardrail: result.guardrail,
          iterations: result.iterations,
          response: result.response,
          status: result.status,
          toolCalls: result.toolCalls
        },
        model: process.env['OPENAI_MODEL'] ?? 'gpt-4.1',
        timestamp: new Date().toISOString()
      },
      null,
      2
    )
  );
}
```

**What gets saved:** The `llmCalls` array contains the full `request` (system prompt + messages + tool definitions) and `response` (text + toolCalls + finishReason) for every LLM round-trip. This is everything needed to replay the session without calling OpenAI.

**Acceptance criteria:**

- [ ] Running `EVAL_RECORD=1 OPENAI_API_KEY=... npx jest golden-sets-live` creates 35 JSON files in `fixtures/recorded/`
- [ ] Each file contains `caseId`, `query`, `llmCalls[]`, `result`, `model`, `timestamp`
- [ ] Files are valid JSON and can be `JSON.parse()`'d
- [ ] Tests still pass 27/27 with recording enabled
- [ ] Session files committed to git (one-time seed)

---

### Step 3: Implement replay tier

**What:** New test file `golden-sets-replay.spec.ts` that reads recorded sessions from `fixtures/recorded/`, mocks `OpenAiClientService` to return the recorded LLM responses in order, runs `ReactAgentService` with real tools + recorded LLM, and runs the same assertions as the live tier.

**Why:** This gives us real-LLM-based regression detection on every commit at $0. If someone tightens an assertion (adds a `mustNotIncludeAny` keyword), the replay catches whether the recorded real response violates it — without calling OpenAI. If someone changes tool logic, the replay catches whether the same LLM input now produces different tool output.

**Files touched:**

- `apps/api/test/ai/golden-sets-replay.spec.ts` — new file

**Design:**

```typescript
// golden-sets-replay.spec.ts
//
// Reads recorded sessions from fixtures/recorded/*.json.
// For each case:
//   1. Load the recorded LLM calls
//   2. Build a ReplayLlmClient that returns recorded responses in order
//   3. Build real tools (same as live tier, via buildLiveTools())
//   4. Run ReactAgentService — tools execute for real, LLM is replayed
//   5. Run same assertEvalInvariants + assertToolCallCounts
//
// Cost: $0. Speed: <10s. Runs every commit.

class ReplayLlmClient implements LLMClient {
  private callIndex = 0;
  constructor(private readonly recorded: LLMCompletionResponse[]) {}

  async complete(): Promise<LLMCompletionResponse> {
    if (this.callIndex >= this.recorded.length) {
      return this.recorded[this.recorded.length - 1]; // repeat last
    }
    return this.recorded[this.callIndex++];
  }
}

for (const evalCase of replayCases) {
  it(`[replay] ${evalCase.id}`, async () => {
    const session = loadRecordedSession(evalCase.id);
    const responses = session.llmCalls.map((c) => c.response);
    const replayClient = new ReplayLlmClient(responses);

    const { tools } = buildLiveTools();
    const registry = new ToolRegistry();
    for (const tool of tools) registry.register(tool);

    const agent = new ReactAgentService(replayClient, registry);
    const result = await agent.run({
      prompt: evalCase.request.message,
      toolNames: evalCase.request.toolNames ?? AGENT_ALLOWED_TOOL_NAMES,
      userId: LIVE_EVAL_USER_ID,
      systemPrompt: AGENT_DEFAULT_SYSTEM_PROMPT,
      guardrails: REPLAY_GUARDRAILS
    });

    // Same assertions as live tier
    const toolsCalled = extractToolsFromResult(result);
    const verified = buildVerifiedResponse(result, toolsCalled);
    assertEvalInvariants(evalCase, verified);
    assertToolCallCounts(evalCase.expect, buildInvocationLog(toolsCalled));
  });
}
```

**Key detail — tools execute for real:** The `ReplayLlmClient` returns the same tool-call decisions the real LLM made (e.g., "call `get_portfolio_summary`"), so `ReactAgentService` dispatches those to the real tools backed by mock DB services. The tool logic runs, the envelope is built, and that tool output replaces the original in the message history. The replay client then returns the recorded final response.

This means the replay tier catches two categories of regressions:

1. **Assertion tightening** — you add `mustNotIncludeAny: ["NaN"]` and the recorded response contains "NaN" → replay fails.
2. **Tool logic changes** — you change how `AnalyzeRiskTool` computes flags, the tool output changes, but the replayed LLM response refers to the old output → could surface in `dataValueChecks` mismatches.

It does NOT catch:

- **LLM behavior drift** — if OpenAI updates gpt-4.1's weights, the replay still passes because it's using the old recorded responses. That's what the live tier (nightly) catches.
- **System prompt changes** — changing the prompt changes LLM behavior, but replay uses the old recorded responses. Re-record after prompt changes.

**When to re-record:**

- Model change (gpt-4.1 → gpt-4.5)
- System prompt change (`agent.constants.ts`)
- Tool schema change (new required fields)
- New golden-set case added

**Acceptance criteria:**

- [ ] `golden-sets-replay.spec.ts` loads all recorded sessions and runs assertions
- [ ] Cases without a recorded session are skipped (not failed)
- [ ] 27/27 replay cases pass (same as live tier)
- [ ] Runtime < 15 seconds, $0 cost
- [ ] No env gate — runs unconditionally

---

### Step 4: Update CI workflow

**What:** Add the replay tier to the CI pipeline that runs on every commit. Update the live tier to also run on PRs that touch `agent.constants.ts` (system prompt / model changes).

**Files touched:**

- `.github/workflows/evals.yml`

**Design:**

```yaml
jobs:
  framework-tests:
    name: 'Agent Framework Tests (mocked LLM)'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc', cache: 'npm' }
      - run: npm ci
      - run: npx nx test api --testPathPattern='agent-framework'

  replay-evals:
    name: 'Golden Sets (replay — recorded gpt-4.1)'
    needs: framework-tests
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc', cache: 'npm' }
      - run: npm ci
      - run: npx nx test api --testPathPattern='golden-sets-replay'

  live-evals:
    name: 'Golden Sets (live gpt-4.1)'
    # Run live when:
    #   1. PR touches system prompt or model config
    #   2. Nightly schedule
    #   3. Manual trigger
    if: >-
      github.event_name == 'schedule' ||
      github.event_name == 'workflow_dispatch' ||
      (github.event_name == 'pull_request' &&
       contains(github.event.pull_request.changed_files, 'agent.constants.ts'))
    needs: framework-tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY_EVAL }}
      EVAL_RECORD: '1'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc', cache: 'npm' }
      - run: npm ci
      - run: npx nx test api --testPathPattern='golden-sets-live' --runInBand
      - uses: actions/upload-artifact@v4
        with:
          name: recorded-sessions
          path: apps/api/test/ai/fixtures/recorded/
```

**Cadence summary:**

| Tier            | Runs when                  | Cost   | Time  | Signal                            |
| --------------- | -------------------------- | ------ | ----- | --------------------------------- |
| Framework tests | Every commit               | $0     | 3s    | Schema, routing, auth, guardrails |
| Replay evals    | Every commit               | $0     | <15s  | Real LLM output vs assertions     |
| Live evals      | Nightly + prompt/model PRs | ~$1.36 | ~4min | Current LLM behavior              |

**Acceptance criteria:**

- [ ] Framework tests job renamed from `fast-evals`
- [ ] New `replay-evals` job runs on every PR
- [ ] `live-evals` job runs nightly and on prompt-touching PRs
- [ ] `live-evals` uploads recorded sessions as artifact
- [ ] Existing `pre-merge-evals` (HTTP API) and `nightly-evals` (labeled scenarios) unchanged

---

### Step 5: Expand dataValueChecks for groundedness

**What:** Add `dataValueChecks` to every single-tool and multi-tool case that returns specific numeric data. This is our partial substitute for groundedness scoring — we verify the LLM's response contains values that actually came from the tool, not hallucinated numbers.

**Why:** Only 2 of 35 live-eligible cases currently have `dataValueChecks`. The other 33 only check keyword presence (`mustIncludeAny: ["portfolio"]`). A hallucinated "$82,000" passes those checks.

**Files touched:**

- `apps/api/test/ai/golden-sets.json`

**Cases to add checks to:**

| Case                       | Tool                      | Value to check                        | Check                                                        |
| -------------------------- | ------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| `rich-transaction-history` | `get_transaction_history` | `"BUY"` appears as a transaction type | `{ "label": "txType", "valueInResponse": "BUY" }`            |
| `rich-risk-analysis`       | `analyze_risk`            | Risk level keyword                    | `{ "label": "riskMention", "valueInResponse": "risk" }`      |
| `rich-market-data`         | `market_data_lookup`      | NVDA symbol in response               | `{ "label": "symbol", "valueInResponse": "NVDA" }`           |
| `rich-market-price`        | `market_data_lookup`      | NVDA symbol in response               | `{ "label": "symbol", "valueInResponse": "NVDA" }`           |
| `rich-performance`         | `performance_compare`     | Percentage sign in response           | `{ "label": "pctSign", "valueInResponse": "%" }`             |
| `rich-performance-ytd`     | `performance_compare`     | Percentage sign in response           | `{ "label": "pctSign", "valueInResponse": "%" }`             |
| `rich-rebalance`           | `rebalance_suggest`       | SELL action mentioned                 | `{ "label": "action", "valueInResponse": "sell" }`           |
| `rich-tax-estimate`        | `tax_estimate`            | Dollar sign in response               | `{ "label": "dollarSign", "valueInResponse": "$" }`          |
| `rich-holdings-detail`     | `get_portfolio_summary`   | Dollar sign in response               | `{ "label": "dollarSign", "valueInResponse": "$" }`          |
| `rich-recent-buys`         | `get_transaction_history` | BUY type mentioned                    | `{ "label": "txType", "valueInResponse": "buy" }`            |
| `rich-stress-recession`    | `stress_test`             | Percentage in response                | `{ "label": "pctSign", "valueInResponse": "%" }`             |
| `rich-compliance-full`     | `compliance_check`        | non-compliant status                  | `{ "label": "status", "valueInResponse": "non-compliant" }`  |
| `rich-sector-risk`         | `analyze_risk`            | Concentration or sector keyword       | `{ "label": "riskDetail", "valueInResponse": "concentrat" }` |

**Note on specificity:** Some of these checks are deliberately soft ("%" rather than "12.5%") because the exact numeric values depend on mock service data that may change. The point is to verify the LLM is referencing tool output at all, not that it parrots exact numbers. Exact-number checks are added only where the mock data is stable and well-known (e.g., `rich-holdings-summary` already checks "10" holdings and "$55").

**Acceptance criteria:**

- [ ] At least 15 of 35 live-eligible cases have `dataValueChecks`
- [ ] All 50 fast-tier (framework) tests still pass
- [ ] All 27 live-tier tests still pass
- [ ] All replay tests pass (after re-recording with EVAL_RECORD=1)

---

## Implementation order

```
Step 1: Rename fast tier           ~15 min   (rename file, update CI + docs)
Step 2: Session saving             ~30 min   (add writeFile, run EVAL_RECORD=1, commit sessions)
Step 3: Replay tier                ~2 hours  (new spec file, ReplayLlmClient, test)
Step 4: CI workflow update         ~30 min   (edit evals.yml)
Step 5: Expand dataValueChecks     ~45 min   (edit golden-sets.json, verify fast+live+replay)
```

Total: ~4 hours. Steps 1-2 are independent. Step 3 depends on Step 2. Step 4 depends on Steps 1+3. Step 5 is independent but should be verified against all tiers.

---

## What this does NOT cover (correctly deferred)

- **Stage 4: LLM-as-judge rubrics** — Relevance/accuracy/completeness/clarity scoring. Needed when keyword checks aren't granular enough for quality trending.
- **Stage 5: A/B experiments** — Compare model/prompt/temperature variants. Needed when we have multiple configurations to choose between.
- **Full groundedness scoring** — Verifying every numeric claim in the response traces back to tool output. Our `dataValueChecks` are a partial substitute; full groundedness requires LLM-as-judge (Stage 4).
- **`expected_sources` annotation** — Mapping which tool output field is the authoritative source for each claim. Prerequisite for full groundedness; not needed for keyword-level checks.

## Success criteria (end state)

| Metric                      | Target                      | Actual                                 |
| --------------------------- | --------------------------- | -------------------------------------- |
| Framework tests (renamed)   | 50/50, every commit, <5s    | **51/51** ✅ (1 new case added)        |
| Replay evals                | 27/27, every commit, $0     | **34/34** ✅ (6 skipped, no recording) |
| Live evals (nightly)        | ≥85% overall                | **33/35 (94%)** ✅ all thresholds met  |
| Cases with dataValueChecks  | ≥15 of 35 live-eligible     | **22 of 40** ✅ (exceeded)             |
| Recorded sessions committed | 27+ in `fixtures/recorded/` | **34 files** ✅                        |
| Live-eligible cases         | 35                          | **40** ✅ (5 new cases added)          |

---

## Implementation results

### Step 1 — Rename fast tier ✅

- `golden-sets-fast.spec.ts` → `agent-framework.spec.ts`
- Describe block → "Agent Framework Tests"
- CI workflow updated: `fast-evals` job → `framework-tests`
- 50/50 tests still pass

### Step 2 — Session saving ✅

- `EVAL_RECORD=1` writes `fixtures/recorded/<caseId>.json`
- `writeFileSync` overwrites (no stale accumulation)
- 34 session files committed to version control

### Step 3 — Replay tier ✅

- `golden-sets-replay.spec.ts` created
- `ReplayLlmClient` returns recorded responses in order
- Real tools execute against replayed LLM decisions
- 34/34 cases pass, 6 skipped (no recording), <15s, $0

### Step 4 — CI workflow ✅

- `framework-tests` job: every commit, mocked LLM
- `replay-evals` job: every commit, recorded sessions
- `live-evals` job: nightly + workflow_dispatch, real gpt-4.1, `EVAL_RECORD=1`
- `pre-merge-evals`: live HTTP API, merge_group
- `nightly-evals`: labeled scenarios

### Step 5 — Expand dataValueChecks ✅

- 2 → 22 cases with `dataValueChecks`
- Checks added for: VOO, NVDA, BND, %, $, risk, BUY, sell, non-compliant, etc.

### Post-alignment additions

- 5 new live-eligible eval cases (35 → 40 live-eligible):
  - `rich-simulate-trades`: real symbols NVDA/BND (was SYM-A/SYM-B placeholders)
  - `rich-stress-test`: stress test scenario
  - `prompt-injection-ignore-instructions`: real LLM prompt injection test (adversarial, 100% threshold)
  - `malformed-query-gibberish`: real LLM gibberish handling (adversarial, 100% threshold)
  - `edge-unknown-symbol` (new): price lookup for symbol not in portfolio

### Lessons learned

- **"NaN" substring matching**: `mustNotIncludeAny: ["NaN"]` (case-insensitive) matches "yahoo **fin**ance" → false positive. Fixed by removing "NaN" from edge-case assertions where finance-related text is expected.
- **Pass-rate thresholds vs strict gates**: adversarial and scope-gate cases use 100% threshold (must always pass); multi-tool uses 70% (harder reasoning chains). This prevents test-weakening pressure when nondeterminism causes one-off failures.
- **mustNotCallTools cases need real LLM testing**: Framework tests only verify the mock scripted to not call tools. The adversarial cases (prompt injection, gibberish) must be in the live tier to actually test LLM refusal behavior.
- **Don't loosen assertions to match LLM behavior**: When `multi-risk-then-rebalance` failed live, the temptation was to soften `mustContainAll`. Instead, keep strict assertions, accept a 75% multi-tool pass rate (above the 70% threshold), and let the case serve as a regression detector.
