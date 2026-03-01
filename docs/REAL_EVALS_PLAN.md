# Real Evals Plan

## The Problem

Our eval suite (50 golden-set cases in `golden-sets-fast.spec.ts`) tests the **agent framework**, not the **LLM**. Every test uses a `MockLlmClient` that returns pre-scripted `LLMCompletionResponse[]` sequences. The assertions verify our own fixtures.

**What we know works:** Tool registry, schema validation, guardrails, invocation logging, auth scoping, response verification pipeline.

**What we have zero signal on:**

- Does gpt-4.1 pick the right tool for "Am I too concentrated in tech?"
- Does gpt-4.1 refuse "Write me a poem" without calling tools?
- Does gpt-4.1 correctly synthesize multi-tool output?
- Does gpt-4.1 produce responses containing the specific values from tool output?
- Does gpt-4.1 stay on-topic, avoid hallucination, format cleanly?

The [prod-evals-cookbook](https://github.com/Gauntlet-HQ/prod-evals-cookbook) makes this explicit. In every stage, the evaluator calls the **real agent** which calls the **real LLM**. Stage 3 "replay" means recording a real session to disk, then replaying the _cached real responses_ for speed — NOT scripting fake responses.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Eval Tiers                             │
│                                                             │
│  Tier 1: Fast (current)     Tier 2: Live (new)  ← NOW     │
│  ───────────────────────    ──────────────────              │
│  MockLlmClient              Real OpenAiClientService        │
│  Tool stubs                 Real tools (demo user data)     │
│  ~2s, runs every commit     ~60s, runs on-demand / CI gate │
│  Tests agent plumbing       Tests LLM behavior              │
│                                                             │
│  Tier 3: Recorded          Tier 4: Rubric       ← DEFERRED │
│  ──────────────────────     ─────────────────────           │
│  Replay cached real output  LLM-as-judge scoring            │
│  Same assertions as live    Relevance/accuracy/clarity 0-5  │
│  Deterministic, no API $    Requires live LLM calls         │
│  Tests regression           Tests quality drift             │
└─────────────────────────────────────────────────────────────┘
```

> **Scope:** Only Tier 2 is being implemented now. Tiers 3 and 4 are deferred.

---

## Tier 2: Live Evals (the core deliverable)

### How it works

```
golden-sets-live.spec.ts
  → reads golden-sets.json (same 50 cases, filter: liveEligible=true)
  → for each case:
      1. Build REAL tools (using demo user data from seeded DB)
      2. Build real OpenAiClientService (using OPENAI_API_KEY)
      3. Build ReactAgentService with real LLM + real tools
      4. Call agent.run({ prompt, toolNames, userId })
      5. Record full session (tools called, LLM responses, timing)
      6. Run SAME assertions from eval-assert.ts
      7. Save session to fixtures/recorded/<caseId>.json
```

### What changes vs fast tier

| Aspect      | Fast tier                      | Live tier                                 |
| ----------- | ------------------------------ | ----------------------------------------- |
| LLM client  | `MockLlmClient` (scripted)     | `OpenAiClientService` (real API)          |
| Tools       | `buildToolsForProfile()` stubs | Real tool classes with mocked DB services |
| Tool data   | Hardcoded in tool-profiles.ts  | Demo seed data (same as dev.sh)           |
| Assertions  | Same eval-assert.ts functions  | Same eval-assert.ts functions             |
| Speed       | ~2s                            | ~60-120s (API latency)                    |
| Cost        | $0                             | ~$0.05-0.20 per run (gpt-4.1)             |
| When to run | Every commit (Jest)            | On-demand + CI nightly gate               |
| Env gate    | None                           | `OPENAI_API_KEY` required                 |

### Why real tools with mocked DB, not the tool stubs?

The tool stubs in `tool-profiles.ts` return hardcoded data regardless of input. Real tools compute results from DB data — which means the LLM's tool _arguments_ matter. If gpt-4.1 sends `{ dateRange: "1y" }` vs `{ dateRange: "ytd" }` to `performance_compare`, it gets different results. That's the whole point: we're testing whether the LLM generates correct arguments, not just correct tool names.

We mock the DB layer (PrismaService, PortfolioService) to return demo-seed-consistent data, so we don't need a running Postgres/Redis. The tool _logic_ is real.

### Files

```
apps/api/test/ai/
├── golden-sets.json                  # Existing — shared between fast+live
├── golden-sets-fast.spec.ts          # Existing — Tier 1 (mock LLM)
├── golden-sets-live.spec.ts          # NEW — Tier 2 (real LLM)
├── eval-assert.ts                    # Existing — shared assertions
├── eval-case.schema.ts               # Existing — shared schema
├── live-eval-runner.ts               # NEW — orchestrator for live runs
├── live-tool-builder.ts              # NEW — builds real tools with mocked services
├── session-recorder.ts               # NEW — saves/loads recorded sessions
└── fixtures/
    ├── llm-sequences/                # Existing — fast tier only
    ├── tool-profiles.ts              # Existing — fast tier only
    └── recorded/                     # NEW — Tier 3 recorded sessions
        ├── rich-holdings-summary.json
        ├── adv-poem-request.json
        └── ...
```

---

## Tier 2 Implementation: Detailed Design

### 2.1 `live-tool-builder.ts` — Real tools with mocked services

```typescript
/**
 * Builds real tool instances (GetPortfolioSummaryTool, AnalyzeRiskTool, etc.)
 * with mocked underlying services that return demo-seed-consistent data.
 *
 * Why not just use tool stubs? Because real tools:
 * - Validate LLM-provided arguments against actual schemas
 * - Compute derived values (risk flags, compliance rules, FIFO lots)
 * - Return realistically-shaped envelopes
 * - Exercise the same code paths as production
 */

export function buildLiveToolsForProfile(profile: 'empty' | 'rich'): {
  tools: ToolDefinition[];
  invocationLog: ToolInvocationEntry[];
} {
  // Mock services with demo-seed data
  const portfolioService = buildMockPortfolioService(profile);
  const prismaService = buildMockPrismaService(profile);
  const userService = buildMockUserService();
  const symbolProfileService = buildMockSymbolProfileService();
  const marketDataService = buildMockMarketDataService();

  // Build real tool instances
  const tools: ToolDefinition[] = [
    new GetPortfolioSummaryTool(portfolioService, prismaService, userService),
    new AnalyzeRiskTool(portfolioService),
    new GetTransactionHistoryTool(prismaService),
    new ComplianceCheckTool(portfolioService),
    new MarketDataLookupTool(symbolProfileService, marketDataService),
    new PerformanceCompareTool(portfolioService, marketDataService),
    new RebalanceSuggestTool(portfolioService),
    new SimulateTradesTool(portfolioService),
    new StressTestTool(portfolioService),
    new TaxEstimateTool(prismaService, portfolioService)
  ];

  // Wrap each tool's execute() to log invocations
  const invocationLog: ToolInvocationEntry[] = [];
  const wrappedTools = tools.map((tool) =>
    wrapWithLogging(tool, invocationLog)
  );

  return { tools: wrappedTools, invocationLog };
}
```

The mock services return the same data that `seed-demo.ts` writes to the database. This means:

- `portfolioService.getDetails()` returns the 4-holding rich portfolio
- `prismaService.order.findMany()` returns the 5 demo transactions
- `marketDataService.get()` returns seeded prices for SYM-A/B/C/D

### 2.2 `session-recorder.ts` — Record/replay sessions

Following the cookbook's Stage 3 pattern:

```typescript
export interface RecordedSession {
  caseId: string;
  query: string;
  // What the LLM actually returned
  llmCalls: Array<{
    request: LLMCompletionRequest; // messages, tools, temperature
    response: LLMCompletionResponse; // text, toolCalls, finishReason
    latencyMs: number;
  }>;
  // What tools were actually called
  toolCalls: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    result: ToolResultEnvelope;
    latencyMs: number;
  }>;
  // Final agent result
  result: ReactAgentRunResult;
  // Metadata
  model: string;
  timestamp: string;
  totalLatencyMs: number;
  estimatedCostUsd: number;
}

export function saveSession(session: RecordedSession): void {
  const dir = join(__dirname, 'fixtures/recorded');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${session.caseId}.json`),
    JSON.stringify(session, null, 2)
  );
}

export function loadSession(caseId: string): RecordedSession {
  return JSON.parse(
    readFileSync(join(__dirname, `fixtures/recorded/${caseId}.json`), 'utf8')
  );
}
```

### 2.3 `live-eval-runner.ts` — Orchestrator

```typescript
export async function runLiveEval(
  evalCase: EvalCaseDefinition,
  options: { record?: boolean } = {}
): Promise<{
  session: RecordedSession;
  verified: VerifiedResponseLike;
}> {
  // 1. Build real tools
  const { tools, invocationLog } = buildLiveToolsForProfile(evalCase.profile);
  const toolRegistry = new ToolRegistry();
  for (const tool of tools) toolRegistry.register(tool);

  // 2. Build recording LLM client (wraps real OpenAI, logs requests/responses)
  const realClient = new OpenAiClientService();
  const recordingClient = new RecordingLlmClient(realClient);

  // 3. Run agent
  const agent = new ReactAgentService(recordingClient, toolRegistry);
  const result = await agent.run({
    prompt: evalCase.request.message,
    toolNames: evalCase.request.toolNames,
    userId: DEMO_USER_ID,
    guardrails: defaultGuardrails
  });

  // 4. Build session record
  const session: RecordedSession = {
    caseId: evalCase.id,
    query: evalCase.request.message,
    llmCalls: recordingClient.getRecordedCalls(),
    toolCalls: buildToolCallRecords(invocationLog),
    result,
    model: process.env.OPENAI_MODEL ?? 'gpt-4.1',
    timestamp: new Date().toISOString(),
    totalLatencyMs: result.elapsedMs,
    estimatedCostUsd: result.estimatedCostUsd
  };

  // 5. Save if recording
  if (options.record) saveSession(session);

  // 6. Verify
  const invokedToolNames = extractActualToolsCalled(invocationLog);
  const verified = new ResponseVerifierService().verify(
    result,
    invokedToolNames
  );

  return { session, verified };
}
```

### 2.4 `RecordingLlmClient` — Transparent wrapper

```typescript
/**
 * Wraps a real LLMClient, passes through all calls, records every
 * request/response pair for session recording.
 */
export class RecordingLlmClient implements LLMClient {
  private calls: Array<{
    request: LLMCompletionRequest;
    response: LLMCompletionResponse;
    latencyMs: number;
  }> = [];

  constructor(private readonly inner: LLMClient) {}

  async complete(
    request: LLMCompletionRequest
  ): Promise<LLMCompletionResponse> {
    const start = Date.now();
    const response = await this.inner.complete(request);
    this.calls.push({
      request,
      response,
      latencyMs: Date.now() - start
    });
    return response;
  }

  getRecordedCalls() {
    return [...this.calls];
  }
}
```

### 2.5 `golden-sets-live.spec.ts` — The live test file

```typescript
/**
 * Golden Sets — Live Tier (real LLM)
 *
 * Requires OPENAI_API_KEY. Runs on-demand or in CI nightly.
 * Uses same golden-sets.json cases with liveEligible=true.
 * Same assertions as fast tier, but the LLM output is real.
 */

const SKIP_REASON = !process.env.OPENAI_API_KEY
  ? 'OPENAI_API_KEY not set — skipping live evals'
  : undefined;

const describeOrSkip = SKIP_REASON ? describe.skip : describe;

const allCases = validateEvalSuite(
  JSON.parse(readFileSync(join(__dirname, 'golden-sets.json'), 'utf8'))
);
const liveCases = allCases.filter((c) => c.liveEligible);

describeOrSkip('Golden Sets (live)', () => {
  jest.setTimeout(120_000); // 2 min for full suite

  const shouldRecord = process.env.EVAL_RECORD === '1';

  for (const evalCase of liveCases) {
    it(`[${evalCase.meta.category}] ${evalCase.id}`, async () => {
      const { session, verified } = await runLiveEval(evalCase, {
        record: shouldRecord
      });

      // Same assertions as fast tier
      assertEvalInvariants(evalCase, verified);
      assertToolCallCounts(evalCase.expect, session.toolCalls);

      if (evalCase.expect.mustNotCallTools) {
        expect(session.toolCalls.length).toBe(0);
      }
    });
  }

  afterAll(() => {
    // Print cost summary
    // Print pass rate by category
    // Print metrics table
  });
});
```

### 2.6 Env gating and CI integration

```yaml
# .github/workflows/eval-live.yml
name: Live Evals (nightly)
on:
  schedule:
    - cron: '0 6 * * *' # 6am UTC daily
  workflow_dispatch: {} # manual trigger

jobs:
  live-evals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx nx test api --testFile=apps/api/test/ai/golden-sets-live.spec.ts
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENAI_MODEL: gpt-4.1
          EVAL_RECORD: 1
      - uses: actions/upload-artifact@v4
        with:
          name: eval-sessions
          path: apps/api/test/ai/fixtures/recorded/
```

---

## Tier 3: Replay Evals (recorded sessions)

Once Tier 2 has run and saved sessions to `fixtures/recorded/`, Tier 3 replays those sessions without calling OpenAI:

```typescript
// golden-sets-replay.spec.ts
describe('Golden Sets (replay)', () => {
  for (const evalCase of liveCases) {
    it(`[replay] ${evalCase.id}`, () => {
      const session = loadSession(evalCase.id);

      // Reconstruct verified response from recorded result
      const verified = new ResponseVerifierService().verify(
        session.result,
        session.toolCalls.map((tc) => tc.toolName)
      );

      // Same assertions — catches if we tighten assertions after recording
      assertEvalInvariants(evalCase, verified);
    });
  }
});
```

**When to re-record:**

- Model change (gpt-4.1 → gpt-4.1-mini, or new version)
- System prompt change
- Tool schema change
- Assertion tightening (new mustContainAll keywords)

---

## Assertion Adjustments for Live Tier

The fast tier assertions were written for scripted responses that perfectly match expectations. Real LLM output is nondeterministic. Adjustments:

### 1. `mustContainAll` needs to be realistic

The fast tier `mustContainAll: ["SYM-A", "$"]` works because we wrote the fixture to say "SYM-A" and "$". A real LLM might say "Asset A" instead of "SYM-A", or omit the dollar sign.

**Fix:** Review each case's `mustContainAll` for live viability. Some checks move to `mustIncludeAny` (softer). Add a `liveOverrides` field:

```json
{
  "id": "rich-holdings-summary",
  "expect": {
    "mustContainAll": ["SYM-A", "$"],
    "liveOverrides": {
      "mustContainAll": ["$"],
      "mustIncludeAny": ["SYM-A", "Asset A", "holding"]
    }
  }
}
```

### 2. `dataValueChecks` may need tolerance

Real tools return real numbers. The LLM might round `$10,500.37` to `$10,500` or `$10.5K`. For live tier, data value checks should allow approximate matches.

### 3. Adversarial cases need the most scrutiny

These are the highest-value live tests. "Write me a poem" is the exact case that caused the original portfolio dump bug. The live tier proves gpt-4.1 + our system prompt actually refuses without tools.

**For adversarial, keep assertions strict:**

- `mustNotCallTools: true` — non-negotiable
- `mustNotIncludeAny: ["SYM-A", "topHoldings"]` — must not leak data
- `mustIncludeAny: ["financial", "portfolio", "only help"]` — can be softened to just one of these

---

## Which Cases Run Live

Current `liveEligible` flags in golden-sets.json:

| Category          | Live   | Skip   | Why skip                 |
| ----------------- | ------ | ------ | ------------------------ |
| Single-tool (10)  | 10     | 0      | All viable               |
| Multi-tool (7)    | 7      | 0      | All viable               |
| Adversarial (8)   | 8      | 0      | Highest value!           |
| Edge-case (2)     | 2      | 0      | All viable               |
| Scope-gate (1)    | 1      | 0      | Viable                   |
| Auth (2)          | 0      | 2      | Tests framework, not LLM |
| Guardrail (4)     | 0      | 4      | Tests framework, not LLM |
| Schema-safety (5) | 0      | 5      | Tests framework, not LLM |
| **Total**         | **28** | **11** |                          |

The 11 skipped cases test framework guardrails (timeout, circuit breaker, cost limit) and schema validation (invalid args, unknown tool) — these are pure plumbing tests where the LLM's behavior is irrelevant.

For the initial implementation, the 8 adversarial + 10 single-tool + 7 multi-tool = **25 core cases** are the priority. These are where a real LLM can fail in ways our mock can't predict.

---

## Cost Estimate

| Cases                 | Avg tokens/case | Cost/case (gpt-4.1) | Total      |
| --------------------- | --------------- | ------------------- | ---------- |
| 25 live cases         | ~3,000          | ~$0.006             | ~$0.15     |
| 3 retries (flaky)     | ~3,000          | ~$0.006             | ~$0.02     |
| **Per run**           |                 |                     | **~$0.17** |
| **Nightly (30 days)** |                 |                     | **~$5.10** |

This is negligible. Even running 5x daily during active development = ~$25/month.

---

## Implementation Order

### Phase 1: Infrastructure (~2 hours)

1. `session-recorder.ts` — RecordedSession type, save/load functions
2. `RecordingLlmClient` — transparent LLM wrapper
3. `live-tool-builder.ts` — real tools with mocked services (hardest part)
4. `live-eval-runner.ts` — orchestrator

### Phase 2: Live test file (~1 hour)

5. `golden-sets-live.spec.ts` — env-gated, uses `runLiveEval()`
6. Add `liveOverrides` to eval-case schema (optional, for assertion softening)
7. First run: execute with `OPENAI_API_KEY=... EVAL_RECORD=1 npx nx test api --testFile=golden-sets-live.spec.ts`
8. Review failures, adjust `liveOverrides` where LLM reasonably deviates

### Phase 3: CI integration (~30 min)

9. GitHub Actions workflow for nightly live eval run
10. Slack/email notification on regression (pass rate drops)

### Phase 4 (deferred): Replay tier

- `golden-sets-replay.spec.ts` — reads from `fixtures/recorded/`, no API calls
- Implement after a stable Tier 2 run has been committed

### Phase 5 (deferred): Rubric scoring

- LLM-as-judge for relevance, accuracy, completeness, clarity (0-5)
- Only needed when basic pass/fail isn't granular enough

---

## Handling Nondeterminism

LLMs are nondeterministic. The same prompt can produce different tool calls or phrasings across runs. Strategies:

### 1. Low temperature

Set `temperature: 0` for eval runs. Not 0.1 — zero. This maximizes reproducibility.

### 2. Retry with tolerance

If a case fails, retry up to 2 times. If it passes 2/3, it's a flaky boundary — tighten the prompt or loosen the assertion.

### 3. Assertion tiers

- **Hard assertions** (must always pass): `mustNotCallTools`, `requiredTools`, `mustNotIncludeAny`
- **Soft assertions** (pass rate > 80%): `mustContainAll`, `dataValueChecks`
- **Informational** (logged, not gating): content precision score, rubric scores

### 4. Record the golden run

After a clean live run, commit the recorded sessions. Tier 3 replay runs those deterministically forever. Re-record only on intentional changes.

---

## Success Criteria

| Metric                       | Target                                       |
| ---------------------------- | -------------------------------------------- |
| Live pass rate (adversarial) | 100% — must never call tools on out-of-scope |
| Live pass rate (single-tool) | ≥90% — correct tool selection                |
| Live pass rate (multi-tool)  | ≥80% — correct tool orchestration            |
| Live pass rate (overall)     | ≥90% across all 25+ live cases               |
| Cost per run                 | < $0.25                                      |
| Latency per run              | < 120 seconds                                |
| Nightly regression detection | Alert within 24h of quality drop             |

---

## What This Gives Us That We Don't Have Today

1. **Proof that "Write me a poem" doesn't dump the portfolio** — tested against real gpt-4.1, not a fixture we wrote
2. **Proof that gpt-4.1 picks `analyze_risk` for "Am I too concentrated?"** — not because we scripted it, but because the model actually routes there
3. **Regression detection when we change the system prompt** — if we add a new instruction and it breaks scope refusals, the nightly eval catches it
4. **Regression detection on model upgrades** — swap gpt-4.1 for gpt-4.1-mini and see exactly which cases break
5. **Foundation for Tier 3/4** — recorded sessions (saved on `EVAL_RECORD=1`) become the input to the deferred replay and rubric tiers
