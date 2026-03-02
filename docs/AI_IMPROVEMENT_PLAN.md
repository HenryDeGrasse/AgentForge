# AI Layer Improvement Plan

> **Scope:** 10 workstreams targeting the weakest parts of the AgentForge AI layer.
> Each section specifies: problem, design, files touched, acceptance criteria, rollout plan, test strategy, and dependencies.

---

## Shared Conventions

### Telemetry Contract

Every workstream that emits logs MUST use this shared event shape so dashboards and alerts work across the system:

```typescript
interface AiTelemetryEvent {
  eventName: string; // e.g. 'agent_run', 'scope_classify', 'cache_hit', 'verification_complete'
  requestId: string; // correlates all events for one request
  elapsedMs: number;
  metadata: Record<string, unknown>; // workstream-specific fields
}

// Emitted via:
Logger.log(JSON.stringify(event), 'AiTelemetry');
```

All workstreams use `requestId` (already generated in `ai.service.ts`) for correlation.

### Unified Routing Record

WS-5 (scope classifier), WS-6 (tool router), and WS-9 (model router) produce independent routing decisions. To prevent them from disagreeing silently, all three contribute to a single per-request routing record that is logged once and passed through the pipeline:

```typescript
interface RoutingDecision {
  requestId: string;
  scope: {
    label: 'ALLOW' | 'REJECT' | 'AMBIGUOUS';
    source: 'hard_pattern' | 'llm_classifier';
    cached: boolean;
  };
  tools: {
    selected: string[];
    source: 'caller_override' | 'router' | 'fallback_all';
  };
  model: {
    tier: QueryComplexity;
    model: string;
    source: 'classifier' | 'env_override';
  };
}
```

This record is built in `ai.service.ts` where all three routers are called, logged once to `AiTelemetry`, and passed to the agent as context (not to the LLM — for internal use only).

### Feature Flags

Every workstream ships behind a feature flag (env var). The flag defaults to OFF in production until the workstream passes its acceptance criteria in staging.

```
AI_VERIFICATION_V2=1          # WS-1
AI_USER_MEMORY=1              # WS-2
AI_PERIOD_RETURN_COMPARE=1    # WS-3
AI_STATISTICAL_RISK=1         # WS-4
AI_SCOPE_CLASSIFIER_V2=1     # WS-5
AI_TOOL_ROUTER=1              # WS-6
AI_RESPONSE_CACHE=1           # WS-7
AI_CONTEXT_ACTIONS=1          # WS-8
AI_MODEL_ROUTER=1             # WS-9
AI_TOOL_SUMMARIZERS=1         # WS-10
```

When a flag is OFF, the existing code path runs unchanged. Each workstream implements a simple `if (process.env.AI_XYZ === '1')` gate at its integration point in `ai.service.ts`.

---

## Table of Contents

1. [WS-1: Response Verification Pipeline](#ws-1-response-verification-pipeline)
2. [WS-2: User Memory & Personalization](#ws-2-user-memory--personalization)
3. [WS-3: Performance Comparison Fix](#ws-3-performance-comparison-fix)
4. [WS-4: Statistical Risk Analysis](#ws-4-statistical-risk-analysis)
5. [WS-5: Intelligent Scope Classifier](#ws-5-intelligent-scope-classifier)
6. [WS-6: Tool Selection Router](#ws-6-tool-selection-router)
7. [WS-7: Semantic Response Cache](#ws-7-semantic-response-cache)
8. [WS-8: Context-Aware Action Engine](#ws-8-context-aware-action-engine)
9. [WS-9: Model Complexity Router](#ws-9-model-complexity-router)
10. [WS-10: Tool Output Summarization](#ws-10-tool-output-summarization)

---

## WS-1: Response Verification Pipeline

### Problem

`ResponseVerifierService.verify()` claims to grade responses with LLM-backed confidence but is actually a ~50-line deterministic function that assigns confidence purely by status code. A hallucinated response full of invented numbers gets `high` confidence as long as the tool returned `status: 'success'`. The README's description ("a second LLM call grades the response") is completely false relative to the implementation.

### Current Code (what changes)

| File                                        | Current Role                             | What Happens to It                                                   |
| ------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `verification/response-verifier.service.ts` | Deterministic status→confidence mapper   | Becomes the orchestrator that calls sub-verifiers and merges results |
| `contracts/final-response.schema.ts`        | Defines `VerifiedResponse`               | Extended with `citationScore`, `verificationDetails` fields          |
| `ai.service.ts` (lines ~153-160)            | Calls `verify(result, invokedToolNames)` | Call signature unchanged; richer return value                        |

### Design

The verification pipeline runs three stages sequentially. Each stage can independently lower confidence but never raise it. Stages are designed so that the first two are zero-LLM-cost and the third is optional.

#### Stage 1: Citation Checker (deterministic, zero cost)

**Purpose:** Verify that specific numbers, percentages, and monetary values in the response text actually appear in the raw tool output data.

**Algorithm:**

1. **Extract numeric tokens from `result.response`** using regex:

   ```
   /\$[\d,]+(?:\.\d{1,2})?/g           → monetary values ($12,345.67)
   /[\d,]+(?:\.\d{1,4})?%/g            → percentages (35.2%)
   /(?<!\w)[\d,]{2,}(?:\.\d{1,4})?(?!\w)/g  → bare numbers (10,000)
   ```

2. **Filter out non-citable numbers.** Not every number in a response should require a citation. Filter out:
   - **Years:** 4-digit numbers in range 1900–2100 (e.g., "in 2024", "tax year 2025")
   - **Small ordinals/counts:** integers ≤ 10 not adjacent to a currency/percent marker (e.g., "top 3 holdings", "5 steps")
   - **Numbers inside date-like patterns:** "Feb 27", "Q3 2025"

   After filtering, the remaining tokens are the **"must-cite" set** — these are the financial figures the response is making claims about.

3. **Build the evidence set from tool output JSON.** Recursively walk `executedTools[*].envelope.data` and extract numbers from:
   - **Numeric-typed leaf values** (the obvious case)
   - **String-typed leaf values** (tool outputs contain numbers inside warning messages like `"Only 3/10 holdings..."` and formatted descriptions — scan these with the same numeric regex)

   For each extracted tool number, store it in two forms: the raw value AND `value * 100` (to handle the 0-to-1 → percentage conversion that all `*Pct` fields in this codebase use).

4. **Match with tolerance.** For each must-cite number from the response, check if any evidence-set value matches within tolerance:
   - **Exact match:** `abs(a - b) < 0.001`
   - **Rounded match:** response has ≤ 2 decimal places and tool has more precision → round tool value to same decimals and compare
   - **Percent conversion:** response says `35.2%`, tool has `0.352` → `0.352 * 100 = 35.2` → match
   - Each matched token records: `{ responseValue, toolValue, toolName, matchType }` for provenance

5. **Score on unique values, not occurrences.** If the response mentions "$12,345" three times, that's one unique citation to verify, not three. Compute:
   - `uniqueCitationScore = uniqueMatchedValues / uniqueMustCiteValues`

6. **Apply confidence mapping:**
   - If no must-cite numbers exist in the response → `citationScore = null`, skip this stage entirely (don't penalize purely narrative responses)
   - `uniqueCitationScore >= 0.8` → no penalty
   - `0.5–0.8` → confidence cannot exceed `medium`, warning: "Some figures in the response could not be verified against tool data"
   - `< 0.5` → confidence capped at `low`, warning: "Most numeric claims could not be verified against tool data"

**New file:** `verification/citation-checker.ts`

```typescript
export interface CitationMatch {
  matchType: 'exact' | 'rounded' | 'percent_conversion';
  responseValue: number;
  toolName: string;
  toolValue: number;
}

export interface CitationCheckResult {
  matches: CitationMatch[];
  skipped: boolean; // true if no must-cite numbers found
  totalMustCite: number;
  uniqueCitationScore: number | null; // null when skipped
  unmatchedValues: number[];
}

export function checkCitations(
  responseText: string,
  executedTools: ExecutedToolEntry[]
): CitationCheckResult;
```

#### Stage 2: Entity & Structural Consistency (deterministic, zero cost)

**Purpose:** Catch failures that numeric citation alone cannot: invented entity names, incorrect categorical claims, and structural inconsistencies.

Checks:

1. **Categorical claim verification:** Extract key categorical values from tool outputs — status strings (`'COMPLIANT'`, `'NON_COMPLIANT'`, `'HIGH'`, `'MEDIUM'`, `'LOW'`), symbol names, asset class names. If the response contains a categorical claim (e.g., "your portfolio is compliant", "risk level is HIGH") check that it matches the tool data. Mismatches cap confidence at `medium`.

2. **Empty-response guard:** If `result.response` is under 20 characters and `toolCalls > 0`, confidence → `low` (tool was called but response is suspiciously terse).

3. **Tool-mention check:** If the response mentions a tool name literally (e.g., "get_portfolio_summary returned..."), add a warning (leaky implementation detail) but don't change confidence.

4. **Contradiction detector:** If `result.status === 'completed'` but the response text contains phrases like "I couldn't", "no data available", "error occurred", and at least one tool returned `status: 'success'` with non-empty data, add warning "Response claims failure but tools returned data" and cap confidence at `medium`.

5. **Stale-data indicator:** If any tool result's `generatedAt` or `snapshotCreatedAt` timestamp is more than 24 hours old, add warning "Data may be stale (snapshot from {time} ago)".

**New file:** `verification/structural-checker.ts`

```typescript
export interface StructuralCheckResult {
  confidenceCap: ConfidenceLevel | null; // null = no cap
  warnings: string[];
}

export function checkStructuralConsistency(
  responseText: string,
  executedTools: ExecutedToolEntry[],
  result: ReactAgentRunResult
): StructuralCheckResult;
```

#### Stage 3: LLM Grounding Check (optional, ~200 tokens cost)

**Purpose:** For high-stakes tool combinations (tax estimates, rebalancing recommendations, compliance determinations), use a cheap LLM call to verify the response is grounded.

**When to run:** Only when ALL of these conditions are met:

- Citation `uniqueCitationScore` < 1.0 (or was null/skipped)
- At least one of these tools was invoked: `tax_estimate`, `rebalance_suggest`, `compliance_check`, `simulate_trades`
- Structural checker did not already cap confidence at `low`

**Implementation:** Use the existing `LLMClient` with structured output:

```typescript
const request: LLMCompletionRequest = {
  messages: [
    {
      role: 'system',
      content:
        'You are a verification assistant. Given a financial response and the raw tool data it was based on, determine if the response accurately represents the data. Respond with JSON.'
    },
    {
      role: 'user',
      content: `Response: "${truncatedResponse}"\n\nTool Data: ${truncatedToolData}`
    }
  ],
  response: {
    name: 'grounding_check',
    schema: {
      type: 'object',
      properties: {
        grounded: {
          type: 'boolean',
          description: 'true if response accurately reflects tool data'
        },
        issues: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of specific inaccuracies found'
        }
      },
      required: ['grounded', 'issues'],
      additionalProperties: false
    }
  },
  temperature: 0
};
```

**Cost control:** Input is truncated to 2000 chars for response + 3000 chars for tool data. Uses cheapest available model. Estimated cost: ~$0.0003 per verification.

**New file:** `verification/grounding-checker.ts`

```typescript
export interface GroundingCheckResult {
  grounded: boolean;
  issues: string[];
  skipped: boolean;
  costUsd: number;
}

export async function checkGrounding(
  responseText: string,
  toolOutputs: ExecutedToolEntry[],
  invokedToolNames: string[],
  citationScore: number | null,
  llmClient: LLMClient
): Promise<GroundingCheckResult>;
```

#### Orchestration in `ResponseVerifierService`

The sync `verify()` runs Stages 1+2. The async `verifyAsync()` adds Stage 3.

```typescript
public verify(result: ReactAgentRunResult, invokedToolNames: string[]): VerifiedResponse {
  // Stage 0: existing deterministic logic (status mapping) — unchanged
  let confidence = this.computeConfidence(result);
  const warnings = this.collectWarnings(result);

  // Stage 1: Citation check
  const citationResult = checkCitations(result.response, result.executedTools);
  if (!citationResult.skipped) {
    confidence = this.applyConfidenceCap(confidence, citationResult);
  }

  // Stage 2: Entity & structural consistency
  const structuralResult = checkStructuralConsistency(
    result.response, result.executedTools, result
  );
  if (structuralResult.confidenceCap) {
    confidence = this.lowerConfidence(confidence, structuralResult.confidenceCap);
  }
  warnings.push(...structuralResult.warnings);

  return {
    confidence, warnings,
    citationScore: citationResult.uniqueCitationScore,
    verificationDetails: {
      citations: citationResult,
      structural: structuralResult
    },
    ...
  };
}

public async verifyAsync(
  result: ReactAgentRunResult,
  invokedToolNames: string[],
  llmClient: LLMClient
): Promise<VerifiedResponse> {
  const base = this.verify(result, invokedToolNames);

  const groundingResult = await checkGrounding(
    result.response, result.executedTools, invokedToolNames,
    base.citationScore, llmClient
  );

  if (!groundingResult.skipped && !groundingResult.grounded) {
    base.confidence = this.lowerConfidence(base.confidence, 'medium');
    base.warnings.push(`Grounding check found issues: ${groundingResult.issues.join('; ')}`);
  }
  base.estimatedCostUsd += groundingResult.costUsd;
  return base;
}
```

### Migration Path

- `verify()` remains synchronous and backward-compatible. Existing callers don't break.
- `ai.service.ts` chat path upgrades to `verifyAsync()` to get full pipeline.
- `ai.service.ts` chatStream path uses sync `verify()` to avoid blocking the stream, then optionally emits a `verification_update` SSE event if the async grounding check downgrades confidence post-stream.
- Behind `AI_VERIFICATION_V2=1`. When off, existing `verify()` runs unchanged.

### New Files

```
verification/
  citation-checker.ts           (~150 lines)
  citation-checker.spec.ts      (~250 lines)
  structural-checker.ts         (~100 lines)
  structural-checker.spec.ts    (~180 lines)
  grounding-checker.ts          (~100 lines)
  grounding-checker.spec.ts     (~120 lines)
```

### Modified Files

| File                                             | Change                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `verification/response-verifier.service.ts`      | Add `verifyAsync()`, import sub-checkers, integrate pipeline                               |
| `verification/response-verifier.service.spec.ts` | Add tests for citation/structural integration                                              |
| `contracts/final-response.schema.ts`             | Add `citationScore?: number \| null`, `verificationDetails?: object` to `VerifiedResponse` |
| `ai.service.ts`                                  | Switch `chat()` to use `verifyAsync()`, pass `llmClient`                                   |

### Test Strategy

**Citation checker unit tests (must-have fixtures):**

- **Exact match:** tool has `12345`, response says "$12,345" → match
- **Rounding:** tool has `1234.567`, response says "$1,234.57" → rounded match
- **Percent conversion:** tool has `0.352` (`allocationInPortfolio`), response says "35.2%" → percent_conversion match
- **No must-cite numbers:** response is "Your portfolio looks well diversified" → `skipped: true`, no penalty
- **Year filtering:** response says "In 2025, your gains were $5,000" → "2025" is filtered out, only "$5,000" is must-cite
- **Hallucinated number:** response says "$99,999" but no tool output contains 99999 → unmatched, score drops
- **Repeated citation:** response mentions "$12,345" three times → counted once for scoring
- **Numbers in tool string values:** tool warning message contains "Only 3/10 holdings had data" → "3" and "10" are in evidence set

**Structural checker unit tests:**

- Categorical mismatch: tool says `overallRiskLevel: 'LOW'`, response says "risk is high" → confidence capped
- Contradiction detection: tool success + response says "I couldn't retrieve" → warning
- Stale data: `generatedAt` 48 hours ago → stale warning

**Integration eval cases:**

- `verification-citation-match`: scripted response cites correct numbers → `high` confidence maintained
- `verification-hallucinated-numbers`: scripted response invents numbers → confidence downgraded
- `verification-grounding-fail`: scripted response contradicts tool data → grounding check fires

### Acceptance Criteria

1. ✅ Citation checker produces correct `uniqueCitationScore` for all fixture pairs
2. ✅ Responses with hallucinated numbers get confidence downgraded to `medium` or `low`
3. ✅ Responses with no numeric claims do NOT get penalized (skipped)
4. ✅ Percent conversion (0.352 ↔ 35.2%) resolves correctly in both directions
5. ✅ All 27 existing golden-set fast tests still pass
6. ✅ `verificationDetails` is populated with match provenance in the response envelope
7. ✅ LLM grounding check costs < $0.001 per invocation

### Rollout

1. Deploy behind `AI_VERIFICATION_V2=0` (off).
2. Enable on staging. Run full eval suite. Compare confidence distributions old vs new.
3. Enable in production at 10% sampling (log both old and new confidence, serve old).
4. Once new confidence agrees with old on ≥95% of `high` cases, flip to 100%.

### Dependencies

- None. Fully independent.

### Estimated Effort

- 3–4 days

---

## WS-2: User Memory & Personalization

### Problem

Every conversation starts from scratch. The system stores conversation history but never extracts or persists user preferences, risk tolerance, financial goals, or other contextual facts. The agent has no concept of who the user is beyond their `userId`.

### Design

#### New Prisma Model: `UserMemory`

```prisma
model UserMemory {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], onDelete: Cascade, references: [id])
  category  UserMemoryCategory
  key       String
  value     String
  source    String                  // conversationId where this was extracted
  confidence Float   @default(1.0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  expiresAt DateTime?

  @@unique([userId, category, key])
  @@index([userId])
}

enum UserMemoryCategory {
  PREFERENCE
  FINANCIAL_FACT
  RISK_PROFILE
  GOAL
  CONSTRAINT
}
```

#### New Service: `UserMemoryService`

**Location:** `apps/api/src/app/endpoints/ai/memory/user-memory.service.ts`

- `getMemories(userId)` — retrieve active memories, respecting `expiresAt`
- `upsertMemory(entry)` — upsert by `(userId, category, key)`. On conflict with different value, new value wins but confidence is reduced to `max(new * 0.8, 0.5)`
- `deleteMemory(userId, memoryId)` — user-initiated deletion
- `deleteAllMemories(userId)` — full reset
- `buildContextBlock(userId)` — format memories as a markdown section for system prompt injection
- `evictExpired()` — lazy cleanup

`buildContextBlock()` output:

```markdown
## What I Know About You

- **Risk tolerance:** Conservative (mentioned 2026-02-15)
- **Goal:** Retire in 2029 (mentioned 2026-01-20)
- **Preference:** Prefers equal-weight allocation strategy
- **Constraint:** Maximum 5% in any single position
```

Capped at `AGENT_MEMORY_MAX_ENTRIES = 20` memories injected.

#### Memory Extraction: `MemoryExtractorService`

Runs fire-and-forget after every successful `chat()`/`chatStream()`. Uses structured-output LLM call (cheapest model, ~$0.0001/turn):

```typescript
// System prompt for extraction:
`You are a memory extraction assistant. Given a user message and assistant response from a financial portfolio conversation, extract any personal facts, preferences, goals, risk tolerance indicators, or constraints the user revealed.

Rules:
- Only extract information the user explicitly stated or strongly implied.
- Do NOT extract information the assistant assumed or suggested.
- Use snake_case keys that are stable across conversations.
- Set confidence 0.9+ for explicit statements, 0.6-0.8 for implicit ones.
- Return an empty array if no extractable memories are found.`;
```

Skip extraction entirely when user message is under 10 characters.

#### Integration

```typescript
// In ai.service.ts — before agent call:
const userContextBlock = await this.userMemoryService.buildContextBlock(userId);
const augmentedPrompt = userContextBlock
  ? `${effectiveSystemPrompt}\n\n${userContextBlock}`
  : effectiveSystemPrompt;

// After successful response — fire-and-forget:
this.memoryExtractorService
  .extractAndStore({
    conversationId,
    userMessage: message,
    assistantResponse: verified.response,
    userId
  })
  .catch((err) =>
    Logger.warn(`Memory extraction failed: ${err.message}`, 'AiService')
  );
```

#### User-Facing Endpoints

```typescript
@Get('memory')              // List all memories
@Delete('memory/:id')       // Delete one memory
@Delete('memory')           // Clear all memories
```

#### Privacy & Safety Boundaries

- `UserMemory` cascade-deletes with `User`.
- `buildContextBlock()` queries `WHERE userId = :userId` — no cross-user leakage possible at the query level.
- Memory context is injected into the system prompt, NOT into tool inputs — tools only see `context.userId`.
- WS-7 (response cache) keys include `userId` and never serves cross-user cached responses.

### New Files

```
memory/
  user-memory.service.ts          (~150 lines)
  user-memory.service.spec.ts     (~200 lines)
  memory-extractor.service.ts     (~120 lines)
  memory-extractor.service.spec.ts (~180 lines)
  memory.types.ts                  (~40 lines)
```

### Modified Files

| File                   | Change                                         |
| ---------------------- | ---------------------------------------------- |
| `prisma/schema.prisma` | Add `UserMemory` model + enum + relation       |
| `ai.service.ts`        | Inject services, load context, fire extraction |
| `ai.module.ts`         | Register services                              |
| `ai.controller.ts`     | Add memory endpoints                           |
| `agent.constants.ts`   | Add `AGENT_MEMORY_MAX_ENTRIES`                 |

### Test Strategy

- **Unit:** CRUD, upsert conflicts, confidence decay, expiry, `buildContextBlock()` formatting
- **Unit:** Mock LLM extraction with various outputs, skip conditions, confidence reduction
- **Privacy:** Assert cascade delete, assert cross-user isolation
- **Integration:** Multi-turn: extract memory → verify it appears in next conversation's system prompt

### Acceptance Criteria

1. ✅ Memory extracted from "I'm retiring in 2029" produces `{key: 'retirement_year', value: '2029', category: 'FINANCIAL_FACT'}`
2. ✅ Extracted memories appear in subsequent conversations' system prompts
3. ✅ `DELETE /memory` clears all memories; `DELETE /memory/:id` clears one
4. ✅ Cascade delete works when user is deleted
5. ✅ Cross-user memory leakage is impossible (test: user A's memories never in user B's context)
6. ✅ Extraction cost per turn ≤ $0.0002

### Rollout

1. Deploy migration with `AI_USER_MEMORY=0`. Model exists but is unused.
2. Enable on staging, verify extraction + recall loop.
3. Enable in production. Monitor extraction costs and memory table growth.

### Dependencies

- Requires Prisma migration.
- Benefits from WS-9 for model selection in extraction calls.

### Estimated Effort

- 4–5 days

---

## WS-3: Performance Comparison Fix

### Problem

`performance_compare` compares the portfolio's **period return** against each benchmark's **all-time-high drawdown** — fundamentally different metrics. The data to fix this already exists in the `MarketData` table.

### Design

#### Add `getBenchmarkPeriodReturn()` to `BenchmarkService`

```typescript
public async getBenchmarkPeriodReturn({
  dataSource, symbol, startDate, endDate
}: { dataSource: DataSource; symbol: string; startDate: Date; endDate: Date }):
  Promise<{ periodReturnPct: number; dataPoints: number } | undefined> {

  const marketData = await this.marketDataService.getRange({
    dateQuery: { gte: startDate, lte: endDate },
    uniqueAssets: [{ dataSource, symbol }]
  });
  if (marketData.length < 2) return undefined;

  const sorted = marketData.sort((a, b) => a.date.getTime() - b.date.getTime());
  const firstPrice = sorted[0].marketPrice;
  const lastPrice = sorted[sorted.length - 1].marketPrice;
  if (firstPrice <= 0) return undefined;

  return {
    periodReturnPct: ((lastPrice - firstPrice) / firstPrice) * 100,
    dataPoints: sorted.length
  };
}
```

#### Update `PerformanceCompareTool`

- Call `getBenchmarkPeriodReturn()` for each benchmark with the same date range as the portfolio evaluation.
- Add `periodReturn?: { periodReturnPct, dataPoints, startDate, endDate }` to each benchmark's `performances` object.
- Comparison logic: prefer `periodReturn` for outperformance classification. Fall back to ATH with explicit warning when period data is unavailable.
- Update `assumptions` to document the new approach.

#### Update `ChartDataExtractorService`

Use `periodReturn` when available for the horizontal bar chart data.

### Modified Files

| File                                          | Change                                                  |
| --------------------------------------------- | ------------------------------------------------------- |
| `services/benchmark/benchmark.service.ts`     | Add `getBenchmarkPeriodReturn()`                        |
| `tools/performance-compare.tool.ts`           | Call new method, update comparison logic + output shape |
| `tools/schemas/performance-compare.schema.ts` | Add `periodReturn` field                                |
| `chart-data-extractor.service.ts`             | Prefer period return in chart                           |

### Test Strategy

- **Unit:** `getBenchmarkPeriodReturn()` — normal, 1 data point (→ undefined), 0 first price, flat prices
- **Unit:** Tool with period return → correct classification; without → ATH fallback + warning
- **Eval:** Update `rich-performance` golden set to validate `periodReturn` presence

### Acceptance Criteria

1. ✅ When MarketData exists for benchmark+range, `periodReturn` is populated and used for comparison
2. ✅ When MarketData is insufficient, ATH fallback triggers with `benchmark_period_return_unavailable` warning
3. ✅ Chart extractor uses period return values
4. ✅ All existing `performance_compare` tests pass

### Rollout

1. Behind `AI_PERIOD_RETURN_COMPARE=1`. When off, existing ATH-only logic runs.
2. Enable on staging. Verify period returns match manual calculations for known benchmarks.
3. Enable in production.

### Dependencies

- None. `MarketDataService.getRange()` already exists.

### Estimated Effort

- 1.5–2 days

---

## WS-4: Statistical Risk Analysis

### Problem

The `analyze_risk` tool assigns hardcoded risk weights per asset class (EQUITY: 0.75, ETF: 0.55) and computes a "volatility proxy score" with no statistical basis. A 3× leveraged ETF and a Treasury bond ETF both get 0.55.

### Design

#### New Utility: `portfolio-statistics.ts`

Pure computation module (no DI). Takes arrays of price data, returns statistical metrics.

```typescript
export function computeVolatility(
  prices: { date: string; marketPrice: number }[]
): VolatilityResult | null;
// Requires ≥20 trading days. Returns annualized vol, max drawdown, Sharpe proxy.

export function computeCorrelations(
  holdingReturns: Map<string, DailyReturn[]>,
  maxPairs?: number
): CorrelationEntry[];
// Pairwise Pearson r. Returns top N pairs by |correlation|.

export function computeDiversification(
  allocations: { symbol: string; weight: number }[],
  correlations: CorrelationEntry[]
): DiversificationMetrics;
// Score = (1 - normalizedHHI) * (1 - meanAbsCorrelation). 0–1 scale.
```

#### Integration into `AnalyzeRiskTool`

- Fetch 90 days of daily prices for top 20 holdings via `MarketDataService.getRange()`.
- Compute per-holding volatility, pairwise correlations, portfolio-weighted volatility, diversification score.
- Add optional `statistics` block to output (omitted when < 5 holdings have sufficient data).
- Add new flags: `high_correlation` (pairs > 0.85), `high_realized_volatility` (weighted vol > 30%).
- Existing `volatilityProxyScore` stays for backward compatibility.

### New Files

```
tools/utils/
  portfolio-statistics.ts           (~200 lines)
  portfolio-statistics.spec.ts      (~300 lines)
```

### Modified Files

| File                                   | Change                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `tools/analyze-risk.tool.ts`           | Inject `MarketDataService`, compute stats, add `statistics` to output, add new flags |
| `tools/schemas/analyze-risk.schema.ts` | Add optional `statistics` object                                                     |
| `chart-data-extractor.service.ts`      | Render per-holding volatility bar chart from `statistics`                            |

### Test Strategy

- **Pure unit tests:** Known price series → hand-calculated volatility, correlation, diversification
- **Edge cases:** Flat prices → vol=0, < 20 points → null, single holding → diversification near 0
- **Integration:** Updated `rich-risk-analysis` golden set asserts `statistics` present

### Acceptance Criteria

1. ✅ `computeVolatility` matches hand-calculated annualized volatility within ±0.1% for a known 60-day price series
2. ✅ `computeCorrelations` returns r=1.0 for identical series, r≈-1.0 for inverse series
3. ✅ `statistics` block omitted with warning when < 5 holdings have data (graceful degradation)
4. ✅ New `high_correlation` flag fires when pair r > 0.85
5. ✅ Existing `volatilityProxyScore` still computed (backward compat)

### Rollout

1. Behind `AI_STATISTICAL_RISK=1`. Existing proxy-only output when off.
2. Enable on staging with seed portfolio. Verify statistics look reasonable.
3. Enable in production.

### Dependencies

- `MarketDataService` already imported in `AiModule`. Needs historical data populated by Ghostfolio data-gathering jobs.

### Estimated Effort

- 3–4 days

---

## WS-5: Intelligent Scope Classifier

### Problem

The scope gate in `ai.service.ts` uses ~70 hardcoded regex patterns. Fragile ordering causes "predict the future price of my ETF" to be rejected ("predict the future" matches before "ETF"). False positives on ambiguous words like "return".

### Design

#### Tier 1: Deterministic Fast Path (zero cost)

Minimal high-confidence patterns:

```typescript
HARD_REJECT: ['write code', 'generate code', 'write a poem', 'tell me a joke',
              'medical advice', 'legal advice', 'diagnose', 'prescription']
HARD_ALLOW:  [/\bportfoli/i, /\bhold(?:ing|s)\b/i, /\brebalanc/i,
              /\bcomplian/i, /\bstress.?test/i, /\btax\b/i]
SAFE_SMALLTALK: existing pattern (unchanged)
```

Covers ~60% of queries.

#### Tier 2: LLM Micro-Classifier (for the rest)

Structured-output call, ~$0.00003/classification:

```typescript
intent: 'portfolio_query' | 'financial_question' | 'off_topic' | 'ambiguous';
```

Results cached in-memory (LRU, 500 entries, 5-min TTL).

#### Integration with Routing Record

The scope result is written to the `RoutingDecision.scope` field (see Shared Conventions). Source indicates whether classification came from `hard_pattern` or `llm_classifier`.

### New Files

```
scope/
  scope-classifier.service.ts       (~120 lines)
  scope-classifier.service.spec.ts  (~200 lines)
  scope-classifier.types.ts         (~20 lines)
```

### Modified Files

| File            | Change                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------- |
| `ai.service.ts` | Replace `checkScopeGate()` with `ScopeClassifierService.classify()`, guarded by feature flag |
| `ai.module.ts`  | Register `ScopeClassifierService`                                                            |

### Test Strategy

- **Unit:** Hard-reject bypasses LLM, hard-allow bypasses LLM, ambiguous triggers LLM, cache hit
- **Regression:** All 3 keyword-stuffing tests + existing scope-gate eval cases pass
- **New evals:** "How should I position my 60/40 for the next decade?" → ALLOW; "I want to return this product" → REJECT

### Acceptance Criteria

1. ✅ All existing scope-gate eval cases pass identically
2. ✅ "predict the future price of my ETF" → ALLOW (no longer false-rejected)
3. ✅ "I want to return this product" → REJECT (no longer false-allowed)
4. ✅ LLM classifier invoked only when no hard pattern matches
5. ✅ Cache prevents duplicate LLM calls for repeated messages

### Rollout

1. Behind `AI_SCOPE_CLASSIFIER_V2=0`. Legacy regex runs when off.
2. Shadow mode: run both classifiers, log disagreements, serve legacy result.
3. Once disagreement rate < 2% on production traffic, switch to V2.

### Dependencies

- Benefits from WS-9 for model selection. Hardcode GPT-4.1-nano until WS-9 lands.

### Estimated Effort

- 2–3 days

---

## WS-6: Tool Selection Router

### Problem

Every request sends all 10 tool definitions (~3000 tokens) to the LLM regardless of query relevance.

### Design

Keyword-signal scoring per tool → select 3–5 most relevant tools. `get_portfolio_summary` always included as foundation. Fallback to all 10 tools when nothing scores (vague query). Caller-specified `toolNames` bypass the router entirely.

Tool router writes to `RoutingDecision.tools` with source: `router`, `caller_override`, or `fallback_all`.

Telemetry: log routed vs actually invoked tools for ongoing signal tuning.

### New Files

```
routing/
  tool-router.service.ts          (~100 lines)
  tool-router.service.spec.ts     (~200 lines)
```

### Modified Files

| File            | Change                                                  |
| --------------- | ------------------------------------------------------- |
| `ai.service.ts` | Call `ToolRouterService.selectTools()` before agent run |
| `ai.module.ts`  | Register `ToolRouterService`                            |

### Test Strategy

- Unit: known messages → expected tool selections
- Edge: no keywords → all tools; caller specifies `toolNames` → bypass
- Regression: all golden-set evals pass

### Acceptance Criteria

1. ✅ "What's my portfolio worth?" routes only `get_portfolio_summary` + 2 related tools (not all 10)
2. ✅ Caller-specified `toolNames` override router completely
3. ✅ Vague queries ("help") fall back to all tools
4. ✅ No existing golden-set eval case breaks
5. ✅ Average tool schema tokens per request reduced by ≥40%

### Rollout

1. Behind `AI_TOOL_ROUTER=0`. All tools sent when off.
2. Enable on staging. Run full eval suite. Verify no regressions.
3. Enable in production. Monitor "tool not routed but invoked" rate in telemetry.

### Dependencies

- None.

### Estimated Effort

- 1.5–2 days

---

## WS-7: Semantic Response Cache

### Problem

Identical queries re-run the full agent loop. No cache layer exists.

### Design

In-memory LRU cache (200 entries, 2-min TTL). Key: `SHA256(userId + normalizedMessage + sortedToolNames)`.

**Freshness check:** Cache is stale if any new `Order` exists for the user since the cache entry's `storedAt`.

**Cache bypasses:**

- Continuing a conversation (has `conversationId` with history)
- `Cache-Control: no-cache` header
- Cache entries store `ChatResponse` only — never raw `UserMemory` or verification results. The cached response was already verified at store time.

**Streaming path:** Cache hit emits a single `done` event (instant response).

**Cross-user isolation:** Cache key includes `userId`. A SHA256 collision between two different users is astronomically unlikely (2^-128), but the freshness check also validates `userId` on the `Order` lookup as a belt-and-suspenders measure.

### New Files

```
cache/
  response-cache.service.ts       (~100 lines)
  response-cache.service.spec.ts  (~150 lines)
```

### Modified Files

| File            | Change                                               |
| --------------- | ---------------------------------------------------- |
| `ai.service.ts` | Cache check before agent, cache store after response |
| `ai.module.ts`  | Register service                                     |

### Test Strategy

- Unit: hit, miss, TTL expiry, LRU eviction, invalidation on new order
- Integration: same message twice → second faster + same data

### Acceptance Criteria

1. ✅ Identical query within 2 minutes returns cached result without LLM call
2. ✅ New order invalidates cache for that user
3. ✅ Continuing a conversation always bypasses cache
4. ✅ User A's cached response never served to User B

### Rollout

1. Behind `AI_RESPONSE_CACHE=0`.
2. Enable on staging. Measure cache hit rate and verify correctness.
3. Enable in production.

### Dependencies

- None.

### Estimated Effort

- 2 days

---

## WS-8: Context-Aware Action Engine

### Problem

`ActionExtractorService` returns hardcoded follow-up suggestions regardless of what the tool actually found. Risk analysis with no flags still suggests "How can I reduce risk?"

### Design

Replace static lookup with **result-inspecting functions** per tool. Each inspector examines the tool's `envelope.data` and returns contextually relevant actions:

- `analyze_risk` with flags → "Address {top flag}" / with no flags → "Run a stress test"
- `compliance_check` with failures → "Fix {N} violations" / fully compliant → "Great! Analyze risk?"
- `tax_estimate` with harvesting candidates → "Harvest loss on {symbol}" / with net gains → "Find ways to offset gains"
- Similar for all 10 tools.

Update `extract()` signature to accept `executedTools: ExecutedToolEntry[]` in addition to `invokedToolNames`.

### Modified Files

| File                               | Change                                                  |
| ---------------------------------- | ------------------------------------------------------- |
| `action-extractor.service.ts`      | Replace static lookup with inspectors, update signature |
| `action-extractor.service.spec.ts` | Rewrite with mock tool data                             |
| `ai.service.ts`                    | Pass `executedTools` to `extract()`                     |

### Test Strategy

- Unit per inspector: risk with flags → specific action; risk without flags → different action
- Regression: adapted from existing tests

### Acceptance Criteria

1. ✅ Risk analysis with 0 flags produces "Run a stress test" (not "How can I reduce risk?")
2. ✅ Compliance with 3 failures produces "Fix 3 violations"
3. ✅ Tax with harvesting candidates produces "Harvest loss on {SYMBOL}"
4. ✅ All 10 tools have inspectors

### Rollout

1. Behind `AI_CONTEXT_ACTIONS=1`. Old static lookup when off.
2. Enable on staging. Spot-check actions across tool combinations.
3. Enable in production.

### Dependencies

- Benefits from WS-4 (richer data for risk inspector).

### Estimated Effort

- 1.5–2 days

---

## WS-9: Model Complexity Router

### Problem

Every query uses the same model regardless of complexity. Simple single-tool queries overpay. No fallback if primary model is down.

### Design

#### Deterministic Complexity Classifier

```typescript
type QueryComplexity = 'simple' | 'moderate' | 'complex';

function classifyComplexity(
  message: string,
  routedToolCount: number,
  hasConversationHistory: boolean
): QueryComplexity;
// Scores: multi-analysis patterns, hypothetical language, tool count, history, message length
```

#### Model Map (env-configurable)

```
simple:   OPENAI_MODEL_SIMPLE   ?? 'gpt-4.1-nano'
moderate: OPENAI_MODEL_MODERATE ?? 'gpt-4.1-mini'
complex:  OPENAI_MODEL_COMPLEX  ?? 'gpt-4.1'
```

#### LLM Client Enhancement

Add optional `model` field to `LLMCompletionRequest`. `OpenAiClientService` uses `request.model ?? this.model`.

#### Fallback Chain

On 429/5xx: `simple → moderate → complex`, `moderate → complex`, `complex → moderate`.

Model router writes to `RoutingDecision.model`.

### New Files

```
routing/
  model-router.service.ts          (~80 lines)
  model-router.service.spec.ts     (~120 lines)
  complexity-classifier.ts         (~60 lines)
  complexity-classifier.spec.ts    (~100 lines)
```

### Modified Files

| File                           | Change                                           |
| ------------------------------ | ------------------------------------------------ |
| `llm/llm-client.interface.ts`  | Add optional `model` to `LLMCompletionRequest`   |
| `llm/openai-client.service.ts` | Use `request.model ?? this.model`                |
| `agent/react-agent.service.ts` | Pass `model` to LLM calls                        |
| `ai.service.ts`                | Classify complexity, select model, pass to agent |

### Test Strategy

- Unit: known messages → expected complexity
- Unit: model selection per tier
- Integration: simple query telemetry shows cheaper model
- Fallback: mock 429 → verify escalation

### Acceptance Criteria

1. ✅ "What's my portfolio?" → `simple` tier → nano model
2. ✅ "Analyze risk, simulate trades, and estimate taxes" → `complex` tier → full model
3. ✅ Fallback works: mocked 429 on nano → retries on mini
4. ✅ All evals pass regardless of model tier

### Rollout

1. Behind `AI_MODEL_ROUTER=0`. Single model when off.
2. Enable on staging. Compare cost per request old vs new.
3. Enable in production at 10%, then 100%.

### Dependencies

- Benefits from WS-6 (tool count as input signal).

### Estimated Effort

- 2–3 days

---

## WS-10: Tool Output Summarization

### Problem

Tools return verbose JSON blobs injected directly into LLM context. The LLM wades through thousands of tokens of boilerplate to find the 5–10 salient facts.

### Design

Each tool gets a deterministic summarizer function. The LLM receives `[SUMMARY]` + key facts + truncated raw JSON (for specific-value lookups). Full JSON stays in the envelope for WS-1 citation checking.

Token savings estimate: ~70% reduction per tool call.

### New Files

```
tools/utils/
  tool-summarizers.ts              (~250 lines)
  tool-summarizers.spec.ts         (~300 lines)
```

### Modified Files

| File                           | Change                                  |
| ------------------------------ | --------------------------------------- |
| `agent/react-agent.service.ts` | Apply summarizer in `executeToolCall()` |
| `agent/agent.constants.ts`     | Add `AGENT_SUMMARY_RAW_CHARS = 16_000`  |

### Test Strategy

- Unit per summarizer: known output → expected summary; empty data → graceful; malformed → no crash
- Integration: tool message content starts with `[SUMMARY]`
- Verify WS-1 citation checker works with summarized+truncated content

### Acceptance Criteria

1. ✅ All 10 tools have summarizers that produce human-readable summaries
2. ✅ Summary + raw combined is ≤ `AGENT_TOOL_OUTPUT_MAX_CHARS`
3. ✅ Summarizer failure falls back to raw content (no crash)
4. ✅ Token usage per tool call reduced by ≥50% on average

### Rollout

1. Behind `AI_TOOL_SUMMARIZERS=0`. Raw content when off.
2. Enable on staging. Run eval suite. Verify response quality doesn't degrade.
3. Enable in production.

### Dependencies

- Independent. Benefits from WS-4 (richer `statistics` to summarize).

### Estimated Effort

- 2 days

---

## Dependency Graph

```
Independent (can start immediately):
  WS-1  (Response Verification)
  WS-3  (Performance Comparison Fix)
  WS-6  (Tool Selection Router)
  WS-7  (Semantic Response Cache)
  WS-10 (Tool Output Summarization)

Has Prisma migration:
  WS-2  (User Memory) — independent, but deploy migration first

Benefits from another WS but can start independently:
  WS-5  (Scope Classifier) — benefits from WS-9 for model selection
  WS-8  (Context-Aware Actions) — benefits from WS-4 for richer data
  WS-9  (Model Router) — benefits from WS-6 for tool count input

References another WS's output:
  WS-4  (Statistical Risk) — WS-8 and WS-10 use its output
```

## Recommended Implementation Order

```
Phase A (Days 1–5):    WS-3, WS-6, WS-10 — quick wins, low risk, no overlap
Phase B (Days 4–10):   WS-1, WS-8 — core quality improvements
Phase C (Days 8–14):   WS-4, WS-5 — statistical + classifier upgrades
Phase D (Days 12–18):  WS-2, WS-7, WS-9 — infrastructure enhancements
```

Phases overlap because they touch different files.

## Total Estimated Effort

| WS        | Days      | Risk                                                 |
| --------- | --------- | ---------------------------------------------------- |
| WS-1      | 3–4       | Medium (citation edge cases need careful testing)    |
| WS-2      | 4–5       | Medium (Prisma migration, extraction prompt quality) |
| WS-3      | 1.5–2     | Low (data exists, straightforward math)              |
| WS-4      | 3–4       | Medium (statistics correctness)                      |
| WS-5      | 2–3       | Low–Medium (LLM classification is well-understood)   |
| WS-6      | 1.5–2     | Low (deterministic, easy to test)                    |
| WS-7      | 2         | Low (in-memory cache)                                |
| WS-8      | 1.5–2     | Low (refactoring existing code)                      |
| WS-9      | 2–3       | Medium (fallback chain error handling)               |
| WS-10     | 2         | Low (pure functions)                                 |
| **Total** | **23–30** |                                                      |

With 2 developers in parallel: **~15 working days (3 weeks)**.
