# AI Layer Improvement Plan

> **Scope:** 10 workstreams targeting the weakest parts of the AgentForge AI layer.
> Each section specifies the problem, the design, the files touched, the test strategy, and the dependencies on other workstreams.

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

1. Extract all numeric tokens from `result.response` using regex:
   ```
   /\$[\d,]+(?:\.\d{1,2})?/g           → monetary values ($12,345.67)
   /[\d,]+(?:\.\d{1,4})?%/g            → percentages (35.2%)
   /(?<!\w)[\d,]{2,}(?:\.\d{1,4})?(?!\w)/g  → bare numbers (10,000)
   ```
2. For each extracted value, normalize it (strip `$`, `,`, `%`) to a canonical number.
3. Build a set of all numeric values present in the tool result JSON (recursively walk `executedTools[*].envelope.data`, extract every leaf value that's a number, convert percentages where schema annotates `*Pct` fields).
4. Compute `citationScore = matchedValues / totalExtractedValues`.
   - Score `>= 0.8` → no penalty
   - Score `0.5–0.8` → confidence cannot exceed `medium`, add warning "Some figures in the response could not be verified against tool data"
   - Score `< 0.5` → confidence capped at `low`, add warning "Most numeric claims could not be verified against tool data"
5. If `totalExtractedValues === 0` (no numeric claims at all), skip this stage.

**Key detail:** The citation checker must handle the fact that tools return decimals (e.g., `0.352`) while the LLM renders them as percentages (`35.2%`). The normalizer maintains both the raw value and the `value * 100` form for comparison. Similarly, tool outputs use field names like `allocationInPortfolio: 0.23` while the response says "23%". The normalizer must handle this bidirectionally.

**New file:** `verification/citation-checker.ts`

```typescript
export interface CitationCheckResult {
  citationScore: number; // 0–1
  matchedValues: number[];
  totalExtracted: number;
  unmatchedValues: number[];
}

export function checkCitations(
  responseText: string,
  toolOutputs: Record<string, unknown>[]
): CitationCheckResult;
```

#### Stage 2: Structural Consistency (deterministic, zero cost)

**Purpose:** Catch obvious structural failures the current verifier misses.

Checks:

1. **Empty-response guard:** If `result.response` is under 20 characters and `toolCalls > 0`, confidence → `low` (tool was called but response is suspiciously terse).
2. **Tool-mention check:** If the response mentions a tool name literally (e.g., "get_portfolio_summary returned...") that's a leaky implementation detail. Add a warning but don't change confidence.
3. **Contradiction detector:** If `result.status === 'completed'` but the response text contains phrases like "I couldn't", "no data available", "error occurred", and at least one tool returned `status: 'success'` with non-empty data, add warning "Response claims failure but tools returned data" and cap confidence at `medium`.
4. **Stale-data indicator:** If any tool result's `generatedAt` or `snapshotCreatedAt` timestamp is more than 24 hours old, add warning "Data may be stale (snapshot from {time} ago)".

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

**Purpose:** For `high`-stakes tool combinations (tax estimates, rebalancing recommendations, compliance determinations), use a cheap LLM call to verify the response is grounded.

**When to run:** Only when:

- Citation score < 1.0 AND
- At least one of these tools was invoked: `tax_estimate`, `rebalance_suggest`, `compliance_check`, `simulate_trades`

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

**Cost control:** Input is truncated to 2000 chars for response + 3000 chars for tool data. Uses cheapest available model (see WS-9). Estimated cost: ~$0.0003 per verification.

**New file:** `verification/grounding-checker.ts`

```typescript
export interface GroundingCheckResult {
  grounded: boolean;
  issues: string[];
  skipped: boolean; // true if conditions weren't met
  costUsd: number;
}

export async function checkGrounding(
  responseText: string,
  toolOutputs: ExecutedToolEntry[],
  invokedToolNames: string[],
  llmClient: LLMClient
): Promise<GroundingCheckResult>;
```

#### Orchestration in `ResponseVerifierService`

```typescript
public verify(result: ReactAgentRunResult, invokedToolNames: string[]): VerifiedResponse {
  // Stage 0: existing deterministic logic (status mapping) — unchanged
  let confidence = this.computeConfidence(result);
  const warnings = this.collectWarnings(result);

  // Stage 1: Citation check
  const toolOutputs = result.executedTools
    .filter(e => e.envelope.status === 'success')
    .map(e => e.envelope.data);
  const citationResult = checkCitations(result.response, toolOutputs);
  confidence = this.applyConfidenceCap(confidence, citationResult);
  warnings.push(...citationResult.warnings);

  // Stage 2: Structural consistency
  const structuralResult = checkStructuralConsistency(
    result.response, result.executedTools, result
  );
  if (structuralResult.confidenceCap) {
    confidence = this.lowerConfidence(confidence, structuralResult.confidenceCap);
  }
  warnings.push(...structuralResult.warnings);

  // Stage 3 is async — handled by new verifyAsync() method for callers that want it
  // The sync verify() remains backward-compatible

  return { confidence, warnings, ... };
}

public async verifyAsync(
  result: ReactAgentRunResult,
  invokedToolNames: string[],
  llmClient: LLMClient
): Promise<VerifiedResponse> {
  const base = this.verify(result, invokedToolNames);

  // Only run LLM grounding for high-stakes tools with imperfect citation scores
  const groundingResult = await checkGrounding(
    result.response,
    result.executedTools,
    invokedToolNames,
    llmClient
  );

  if (!groundingResult.skipped && !groundingResult.grounded) {
    base.confidence = this.lowerConfidence(base.confidence, 'medium');
    base.warnings.push(
      `Grounding check found issues: ${groundingResult.issues.join('; ')}`
    );
  }

  base.estimatedCostUsd += groundingResult.costUsd;
  return base;
}
```

### Migration Path

- `verify()` remains synchronous and backward-compatible. Existing callers don't break.
- `ai.service.ts` chat path upgrades to `verifyAsync()` to get full pipeline.
- `ai.service.ts` chatStream path uses sync `verify()` to avoid blocking the stream, then optionally emits a `verification_update` SSE event if the async grounding check downgrades confidence post-stream.

### New Files

```
verification/
  citation-checker.ts           (~120 lines)
  citation-checker.spec.ts      (~200 lines)
  structural-checker.ts         (~80 lines)
  structural-checker.spec.ts    (~150 lines)
  grounding-checker.ts          (~100 lines)
  grounding-checker.spec.ts     (~120 lines)
```

### Modified Files

| File                                             | Change                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `verification/response-verifier.service.ts`      | Add `verifyAsync()`, import sub-checkers, integrate pipeline                       |
| `verification/response-verifier.service.spec.ts` | Add tests for citation/structural integration                                      |
| `contracts/final-response.schema.ts`             | Add `citationScore?: number`, `verificationDetails?: object` to `VerifiedResponse` |
| `ai.service.ts`                                  | Switch `chat()` to use `verifyAsync()`, pass `llmClient`                           |
| `ai.module.ts`                                   | No change needed (verifier already injected)                                       |

### Test Strategy

**Unit tests for each checker:**

- Citation checker: test with known response text + known tool JSON → assert exact match counts
- Edge cases: response says "$12,345" but tool has `12345.00`, response says "35.2%" but tool has `0.352`, response has no numbers, response has numbers not from any tool
- Structural checker: test contradiction detection, empty response detection, stale data detection
- Grounding checker: mock LLM response, test skip conditions, test confidence downgrade

**Integration test:**

- Add 3 golden-set eval cases in `golden-sets.json`:
  - `verification-citation-match`: tool returns specific numbers, response cites them correctly → `high` confidence
  - `verification-hallucinated-numbers`: scripted LLM response invents numbers not in tool data → confidence downgraded
  - `verification-grounding-fail`: response contradicts tool data → grounding check fires, confidence downgraded

### Dependencies

- None. This workstream is fully independent.

### Estimated Effort

- 3–4 days implementation + testing

---

## WS-2: User Memory & Personalization

### Problem

Every conversation starts from scratch. The system stores conversation history but never extracts or persists user preferences, risk tolerance, financial goals, or other contextual facts. The agent has no concept of who the user is beyond their `userId`. A user who mentions "I'm retiring in 3 years" in one conversation gets no benefit from that in the next.

### Current State

- `ChatConversation` and `ChatMessage` Prisma models exist and store conversation history.
- `AGENT_MAX_HISTORY_PAIRS = 10` means only the last 20 messages of a single conversation are visible to the agent.
- Cross-conversation memory is zero.
- `User.settings` is a JSON blob with only `baseCurrency` and `language`.

### Design

#### New Prisma Model: `UserMemory`

```prisma
model UserMemory {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], onDelete: Cascade, references: [id])
  category  UserMemoryCategory
  key       String                  // e.g., "risk_tolerance", "retirement_year"
  value     String                  // e.g., "conservative", "2029"
  source    String                  // conversationId where this was extracted
  confidence Float   @default(1.0) // 0–1, decays over time or with contradictions
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  expiresAt DateTime?               // null = permanent

  @@unique([userId, category, key])
  @@index([userId])
}

enum UserMemoryCategory {
  PREFERENCE        // "prefers equal-weight", "dislikes crypto"
  FINANCIAL_FACT    // "retirement in 2029", "has 401k at Fidelity"
  RISK_PROFILE      // "conservative", "moderate"
  GOAL              // "save for house down payment", "beat S&P 500"
  CONSTRAINT        // "no ESG violations", "max 5% single position"
}
```

#### New Service: `UserMemoryService`

**Location:** `apps/api/src/app/endpoints/ai/memory/user-memory.service.ts`

```typescript
@Injectable()
export class UserMemoryService {
  constructor(private readonly prismaService: PrismaService) {}

  /** Retrieve all active memories for a user, ordered by category then recency. */
  async getMemories(userId: string): Promise<UserMemoryEntry[]>;

  /** Upsert a memory entry. If the same (userId, category, key) exists, update it. */
  async upsertMemory(entry: UpsertMemoryInput): Promise<void>;

  /** Delete a specific memory (user-initiated "forget this"). */
  async deleteMemory(userId: string, memoryId: string): Promise<void>;

  /** Build a formatted context block for injection into the system prompt. */
  async buildContextBlock(userId: string): Promise<string>;

  /** Expire memories past their expiresAt. Called lazily or via cron. */
  async evictExpired(): Promise<number>;
}
```

**`buildContextBlock()` output format:**

```
## What I Know About You
- **Risk tolerance:** Conservative (mentioned 2026-02-15)
- **Goal:** Retire in 2029 (mentioned 2026-01-20)
- **Preference:** Prefers equal-weight allocation strategy
- **Constraint:** Maximum 5% in any single position
```

This block is prepended to the system prompt in `ai.service.ts` before passing to the agent.

#### Memory Extraction: `MemoryExtractorService`

**Location:** `apps/api/src/app/endpoints/ai/memory/memory-extractor.service.ts`

**When it runs:** After every successful `chat()` / `chatStream()` completion, as a fire-and-forget async operation (does not block the response).

**How it works:**

1. Takes the user message + assistant response from the just-completed turn.
2. Uses a single structured-output LLM call with a tight schema:

```typescript
const extractionSchema = {
  name: 'memory_extraction',
  schema: {
    type: 'object',
    properties: {
      memories: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: [
                'PREFERENCE',
                'FINANCIAL_FACT',
                'RISK_PROFILE',
                'GOAL',
                'CONSTRAINT'
              ]
            },
            key: {
              type: 'string',
              description:
                'A snake_case identifier like "risk_tolerance" or "retirement_year"'
            },
            value: { type: 'string', description: 'The extracted value' },
            confidence: { type: 'number', minimum: 0, maximum: 1 }
          },
          required: ['category', 'key', 'value', 'confidence'],
          additionalProperties: false
        }
      }
    },
    required: ['memories'],
    additionalProperties: false
  }
};
```

3. System prompt for extraction:

```
You are a memory extraction assistant. Given a user message and assistant response from a financial portfolio conversation, extract any personal facts, preferences, goals, risk tolerance indicators, or constraints the user revealed.

Rules:
- Only extract information the user explicitly stated or strongly implied.
- Do NOT extract information the assistant assumed or suggested.
- Use snake_case keys that are stable across conversations (e.g., "risk_tolerance", not "user_said_they_are_conservative").
- Set confidence to 0.9+ for explicit statements ("I want to retire in 2029"), 0.6-0.8 for implicit ones ("I'm pretty cautious with my money").
- Return an empty array if no extractable memories are found.
```

4. Each extracted memory is upserted via `UserMemoryService.upsertMemory()`. If the same `key` exists with a different `value`, the newer extraction wins but confidence is reduced to `max(new_confidence * 0.8, 0.5)` to indicate uncertainty.

**Cost control:** This extraction call uses the cheapest model (GPT-4o-mini). Input is capped at 1000 chars of user message + 1000 chars of response. Estimated cost: ~$0.0001 per conversation turn. The call is skipped entirely if the user message is under 10 characters (greetings, "yes", etc.).

#### Integration into Agent Loop

**In `ai.service.ts`:**

```typescript
// Before building the agent input, load user context:
const userContextBlock = await this.userMemoryService.buildContextBlock(userId);
const effectiveSystemPrompt = userContextBlock
  ? `${effectiveSystemPrompt}\n\n${userContextBlock}`
  : effectiveSystemPrompt;

// After successful response, fire-and-forget memory extraction:
this.memoryExtractorService
  .extractAndStore({
    conversationId: resolvedConversationId,
    assistantResponse: verified.response,
    userMessage: message,
    userId
  })
  .catch((err) =>
    Logger.warn(`Memory extraction failed: ${err.message}`, 'AiService')
  );
```

#### User-Facing Memory Management

**New controller endpoints in `AiController`:**

```typescript
@Get('memory')              // List all memories for the authenticated user
@Delete('memory/:id')       // Delete a specific memory ("forget this")
@Delete('memory')           // Clear all memories ("reset what you know about me")
```

This gives users full control over what the AI "remembers" about them.

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

| File                   | Change                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma` | Add `UserMemory` model, `UserMemoryCategory` enum, relation on `User`                                                 |
| `ai.service.ts`        | Inject `UserMemoryService` + `MemoryExtractorService`, load context before agent call, fire extraction after response |
| `ai.module.ts`         | Register new services                                                                                                 |
| `ai.controller.ts`     | Add memory management endpoints                                                                                       |
| `agent.constants.ts`   | Add `AGENT_MEMORY_MAX_ENTRIES = 20` (max memories injected into context)                                              |

### Test Strategy

**Unit tests:**

- `UserMemoryService`: CRUD operations, upsert conflict resolution, expiry eviction, `buildContextBlock()` formatting
- `MemoryExtractorService`: Mock LLM returning various extraction results, test that upserts are called correctly, test skip conditions (short messages), test confidence reduction on conflicts

**Integration tests:**

- New golden-set case `memory-extraction-and-recall`:
  1. Send message: "I'm planning to retire in 2029 and I'm quite risk-averse"
  2. Assert memory extraction produces `{key: 'retirement_year', value: '2029'}` and `{key: 'risk_tolerance', value: 'conservative'}`
  3. In a new conversation, send: "Suggest a rebalancing strategy"
  4. Assert the response references the user's conservative risk tolerance or retirement timeline

**Privacy tests:**

- Assert that `UserMemory` entries are cascade-deleted when the `User` is deleted
- Assert that one user's memories are never visible to another user's agent context
- Assert the `DELETE /memory` endpoint works

### Dependencies

- Requires a Prisma migration (new model).
- Independent of other workstreams, but benefits from WS-9 (uses cheap model for extraction).

### Estimated Effort

- 4–5 days (includes migration, service, extraction, controller, tests)

---

## WS-3: Performance Comparison Fix

### Problem

`performance_compare` compares the portfolio's **period return** (e.g., YTD net performance percentage) against each benchmark's **all-time-high drawdown percentage**. These are fundamentally different metrics. A portfolio up 2% YTD vs a benchmark 15% below its ATH from 3 years ago is not a meaningful comparison. The code has a 4-line disclaimer acknowledging the problem but doesn't fix it.

### Root Cause

The `BenchmarkService.getBenchmarks()` only exposes `performances.allTimeHigh.performancePercent` (drawdown from ATH). It does not expose period returns for the same date range the portfolio is being evaluated on. However, the underlying data exists: the `MarketData` table stores daily prices for benchmark symbols, and `MarketDataService.getRange()` can query any date range.

### Design

#### Add `getBenchmarkPeriodReturn()` to `BenchmarkService`

```typescript
/**
 * Compute the total return of a benchmark symbol over a specific date range
 * using the MarketData table (no external API call).
 *
 * Returns undefined if insufficient data points exist for the range.
 */
public async getBenchmarkPeriodReturn({
  dataSource,
  symbol,
  startDate,
  endDate
}: {
  dataSource: DataSource;
  symbol: string;
  startDate: Date;
  endDate: Date;
}): Promise<{ periodReturnPct: number; dataPoints: number } | undefined> {
  const marketData = await this.marketDataService.getRange({
    dateQuery: { gte: startDate, lte: endDate },
    uniqueAssets: [{ dataSource, symbol }]
  });

  if (marketData.length < 2) return undefined;

  // Sort by date ascending
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

#### Update `PerformanceCompareTool.execute()`

The benchmark output shape changes from:

```typescript
performances: {
  allTimeHigh: {
    (date, performancePercent);
  }
}
```

To:

```typescript
performances: {
  allTimeHigh: { date, performancePercent },
  periodReturn?: { periodReturnPct, dataPoints, startDate, endDate }
}
```

The comparison logic changes from:

```typescript
// OLD: compare portfolio netPerformancePercentage against ATH drawdown
if (
  portfolio.netPerformancePercentage > 0 &&
  portfolio.netPerformancePercentage >= benchmarkMetric
) {
  outperformingBenchmarks.push(benchmark.symbol);
}
```

To:

```typescript
// NEW: prefer period return; fall back to ATH drawdown with warning
const periodReturn = benchmark.performances.periodReturn;
if (periodReturn) {
  const benchmarkReturnPct = periodReturn.periodReturnPct;
  if (portfolio.netPerformancePercentage > benchmarkReturnPct) {
    outperformingBenchmarks.push(benchmark.symbol);
  } else {
    underperformingBenchmarks.push(benchmark.symbol);
  }
} else {
  // Fall back to ATH comparison with explicit caveat
  warnings.push({
    code: 'benchmark_period_return_unavailable',
    message: `Period return data unavailable for ${benchmark.symbol}; comparison uses ATH drawdown as a proxy (less reliable).`
  });
  // existing ATH logic
}
```

The `assumptions` array is updated to reflect the fix:

```typescript
assumptions: [
  'Benchmark comparison uses period return when historical price data is available for the selected date range.',
  'When period return data is insufficient (< 2 data points), comparison falls back to ATH drawdown as a proxy metric, with a warning.',
  'Period return is a simple (end/start - 1) calculation and does not account for dividends or splits beyond what the data provider captures.'
];
```

#### Update the Output Schema

In `schemas/performance-compare.schema.ts`, extend the `performances` object to include the new `periodReturn` field with descriptions.

#### Update `ChartDataExtractorService.extractPerformanceCompare()`

The chart extractor currently builds a horizontal bar comparing portfolio return vs benchmark ATH. Update to use `periodReturn` when available:

```typescript
// NEW: prefer periodReturn for chart data
const benchReturnPct =
  perfs?.periodReturn?.periodReturnPct ?? ath?.performancePercent ?? 0;

items.push({
  name: String(bench['name'] ?? bench['symbol'] ?? 'Benchmark'),
  value: benchReturnPct
});
```

### Modified Files

| File                                          | Change                                                                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `services/benchmark/benchmark.service.ts`     | Add `getBenchmarkPeriodReturn()` method                                                                                |
| `tools/performance-compare.tool.ts`           | Call `getBenchmarkPeriodReturn()` for each benchmark, update comparison logic, update output shape, update assumptions |
| `tools/schemas/performance-compare.schema.ts` | Add `periodReturn` to output schema                                                                                    |
| `chart-data-extractor.service.ts`             | Update `extractPerformanceCompare()` to prefer period return                                                           |

### Test Strategy

**Unit tests for `getBenchmarkPeriodReturn()`:**

- Normal case: 30 data points → correct period return
- Edge case: only 1 data point → returns `undefined`
- Edge case: first price is 0 → returns `undefined`
- Edge case: flat prices → 0% return

**Unit tests for updated `PerformanceCompareTool`:**

- Mock `getBenchmarkPeriodReturn()` returning a valid period return → comparison uses it
- Mock returning `undefined` → falls back to ATH with warning
- Test outperformance/underperformance classification with period returns
- Regression: existing ATH-only path still works when period data unavailable

**Integration eval:**

- Update `rich-performance` golden set to validate that `periodReturn` is present in the output
- Add `performance-compare-period-return` eval case specifically testing period return comparison

### Dependencies

- None. The `MarketDataService.getRange()` method already exists and is tested.

### Estimated Effort

- 1.5–2 days

---

## WS-4: Statistical Risk Analysis

### Problem

The `analyze_risk` tool assigns hardcoded risk weights per asset class (EQUITY: 0.75, ETF: 0.55, etc.) and computes a "volatility proxy score" that has no statistical basis. A 3× leveraged ETF and a Treasury bond ETF both get 0.55. There's no consideration of actual historical volatility, correlation between holdings, or realized drawdowns.

### Current State

- `MarketData` table stores daily prices for every symbol in the portfolio.
- `MarketDataService.getRange()` can fetch date-ranged price data for multiple symbols.
- The tool already fetches `portfolioDetails.holdings` with `valueInBaseCurrency` and `symbol`.

### Design

#### New Utility: `portfolio-statistics.ts`

**Location:** `apps/api/src/app/endpoints/ai/tools/utils/portfolio-statistics.ts`

This is a pure computation module (no dependencies, no DI) that takes arrays of price data and computes statistical risk metrics.

```typescript
export interface DailyReturn {
  date: string;
  symbol: string;
  return: number; // simple daily return (P1/P0 - 1)
}

export interface VolatilityResult {
  annualizedVolatility: number; // stddev of daily returns * sqrt(252)
  dailyReturns: number[];
  maxDrawdownPct: number; // worst peak-to-trough drawdown
  period: { startDate: string; endDate: string; tradingDays: number };
  sharpeProxy: number; // (annualized mean return) / annualized vol (risk-free = 0)
}

export interface CorrelationEntry {
  correlation: number; // Pearson r (-1 to 1)
  symbolA: string;
  symbolB: string;
}

export interface DiversificationMetrics {
  correlationMatrix: CorrelationEntry[]; // top N pairs by |correlation|
  diversificationScore: number; // 0–1, higher = more diversified
  effectivePositions: number; // Herfindahl-based effective N
}

/**
 * Compute annualized volatility from daily price series.
 * Requires at least 20 trading days of data; returns null otherwise.
 */
export function computeVolatility(
  prices: { date: string; marketPrice: number }[]
): VolatilityResult | null;

/**
 * Compute pairwise Pearson correlations between holdings' daily return series.
 * Only returns the top `maxPairs` most correlated pairs to keep output bounded.
 * Holdings with < 20 overlapping trading days are excluded.
 */
export function computeCorrelations(
  holdingReturns: Map<string, DailyReturn[]>,
  maxPairs?: number // default 10
): CorrelationEntry[];

/**
 * Compute portfolio-level diversification metrics.
 * Uses the Herfindahl-Hirschman Index (HHI) of allocation weights
 * and mean pairwise correlation to produce a 0–1 diversification score.
 *
 * Score = (1 - normalizedHHI) * (1 - meanAbsCorrelation)
 *   - HHI of equal-weight N holdings = 1/N → normalized HHI = 0 → max diversity
 *   - Mean |correlation| of 0 → max diversity
 *   - Both factors multiply: concentrated AND correlated = worst score
 */
export function computeDiversification(
  allocations: { symbol: string; weight: number }[],
  correlations: CorrelationEntry[]
): DiversificationMetrics;
```

#### Integration into `AnalyzeRiskTool`

The tool's `execute()` method adds a new data-fetch step:

```typescript
// Fetch 90 days of daily prices for top 20 holdings
const topSymbols = holdings.slice(0, 20).map((h) => ({
  dataSource: h.dataSource as DataSource,
  symbol: h.symbol
}));

const ninetyDaysAgo = subDays(new Date(), 90);
const historicalData = await this.marketDataService.getRange({
  dateQuery: { gte: ninetyDaysAgo },
  uniqueAssets: topSymbols
});

// Group by symbol
const pricesBySymbol = new Map<
  string,
  { date: string; marketPrice: number }[]
>();
for (const dp of historicalData) {
  const key = dp.symbol;
  if (!pricesBySymbol.has(key)) pricesBySymbol.set(key, []);
  pricesBySymbol
    .get(key)
    .push({ date: dp.date.toISOString(), marketPrice: dp.marketPrice });
}
```

Then compute and add to the output:

```typescript
// Compute per-holding volatility
const holdingVolatilities = new Map<string, VolatilityResult>();
const holdingReturns = new Map<string, DailyReturn[]>();

for (const [symbol, prices] of pricesBySymbol) {
  const vol = computeVolatility(prices);
  if (vol) {
    holdingVolatilities.set(symbol, vol);
    holdingReturns.set(
      symbol,
      vol.dailyReturns.map((r, i) => ({
        date: prices[i + 1]?.date ?? '',
        symbol,
        return: r
      }))
    );
  }
}

// Portfolio-weighted volatility
const weightedVolatility = holdings.reduce((sum, h) => {
  const vol = holdingVolatilities.get(h.symbol);
  return sum + h.allocationInPortfolio * (vol?.annualizedVolatility ?? 0.5);
}, 0);

// Correlation and diversification
const correlations = computeCorrelations(holdingReturns, 10);
const diversification = computeDiversification(
  holdings.map((h) => ({ symbol: h.symbol, weight: h.allocationInPortfolio })),
  correlations
);
```

#### Extended Output

The existing `volatilityProxyScore` field stays (backward compatibility) but new fields are added:

```typescript
interface AnalyzeRiskOutput {
  // ... existing fields unchanged ...

  // NEW: statistical metrics (populated when sufficient historical data exists)
  statistics?: {
    portfolioVolatility: number; // weighted annualized vol
    maxDrawdownPct: number; // worst portfolio-level drawdown
    diversificationScore: number; // 0–1
    effectivePositions: number; // HHI-based
    topCorrelatedPairs: CorrelationEntry[]; // up to 5 most correlated pairs
    holdingVolatilities: {
      symbol: string;
      annualizedVolatility: number;
      maxDrawdownPct: number;
    }[];
    dataQuality: {
      holdingsWithSufficientData: number;
      holdingsTotal: number;
      periodDays: number;
    };
  };
}
```

#### Updated Risk Flags

When statistical data is available, the existing hardcoded-weight flags are **supplemented** (not replaced) with statistically-derived flags:

```typescript
// NEW: high-correlation flag
const highCorrPairs = correlations.filter((c) => c.correlation > 0.85);
if (highCorrPairs.length > 0) {
  flags.push({
    code: 'high_correlation',
    title: 'Highly correlated positions',
    description: `${highCorrPairs.length} pair(s) have correlation > 0.85, reducing effective diversification.`,
    severity: highCorrPairs.length >= 3 ? 'high' : 'medium',
    metricName: 'max_pairwise_correlation',
    metricValue: Math.max(...highCorrPairs.map((c) => c.correlation)),
    threshold: 0.85
  });
}

// NEW: realized volatility flag (replaces or augments the proxy)
if (weightedVolatility > 0.3) {
  flags.push({
    code: 'high_realized_volatility',
    title: 'High realized volatility',
    description: `Portfolio 90-day annualized volatility is ${(weightedVolatility * 100).toFixed(1)}%.`,
    severity: weightedVolatility > 0.5 ? 'high' : 'medium',
    metricName: 'portfolio_annualized_volatility',
    metricValue: weightedVolatility,
    threshold: 0.3
  });
}
```

#### Graceful Degradation

If fewer than 5 holdings have sufficient price history (< 20 trading days), the `statistics` block is omitted entirely and a warning is added:

```typescript
if (holdingsWithData < 5) {
  warnings.push({
    code: 'insufficient_historical_data',
    message: `Only ${holdingsWithData}/${holdingsCount} holdings have sufficient price history for statistical risk analysis.`
  });
}
```

The existing hardcoded-weight volatility proxy continues to work as a fallback, ensuring backward compatibility.

### New Files

```
tools/utils/
  portfolio-statistics.ts           (~200 lines)
  portfolio-statistics.spec.ts      (~300 lines)
```

### Modified Files

| File                                   | Change                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `tools/analyze-risk.tool.ts`           | Inject `MarketDataService`, fetch historical prices, compute stats, add `statistics` to output, add new flags |
| `tools/schemas/analyze-risk.schema.ts` | Add `statistics` optional object to output schema                                                             |
| `ai.module.ts`                         | `MarketDataService` already imported; `AnalyzeRiskTool` needs `MarketDataService` added to its constructor    |
| `chart-data-extractor.service.ts`      | Optionally render a correlation heatmap or per-holding volatility bar chart from `statistics`                 |

### Test Strategy

**Pure unit tests for `portfolio-statistics.ts`:**

- `computeVolatility`: known price series with hand-calculated expected volatility
- `computeVolatility`: flat prices → 0 volatility
- `computeVolatility`: < 20 data points → null
- `computeCorrelations`: two perfectly correlated series → r = 1.0
- `computeCorrelations`: two inversely correlated series → r ≈ -1.0
- `computeCorrelations`: random series → |r| < 0.5
- `computeDiversification`: 1 holding → score near 0; 10 uncorrelated holdings → score near 1

**Integration tests:**

- Updated `rich-risk-analysis` golden set to assert `statistics` block is present when tool uses the "rich" profile with mocked market data

### Dependencies

- `MarketDataService` is already in the module. The `MarketData` table must have historical data for the user's holdings (populated by existing Ghostfolio data-gathering jobs).

### Estimated Effort

- 3–4 days (statistics module is pure math, main work is integration and test fixtures)

---

## WS-5: Intelligent Scope Classifier

### Problem

The scope gate in `ai.service.ts` uses ~70 hardcoded regex patterns for financial relevance plus a list of banned phrases. This is brittle (false positives on "return" in non-financial contexts, false negatives on novel financial queries, fragile ordering where "predict the future price of my ETF" gets rejected because "predict the future" matches before "ETF").

### Design

Replace the regex-based classifier with a **two-tier approach**:

#### Tier 1: Deterministic Fast Path (zero cost, <1ms)

Keep a minimal set of **high-confidence** patterns that are unambiguous:

```typescript
// Definite rejects — these cannot be financial queries
private static readonly HARD_REJECT_PATTERNS = [
  'write code', 'generate code', 'write a poem', 'tell me a joke',
  'medical advice', 'legal advice', 'diagnose', 'prescription'
];

// Definite allows — these are always financial
private static readonly HARD_ALLOW_PATTERNS = [
  /\bportfoli/i, /\bhold(?:ing|s)\b/i, /\brebalanc/i,
  /\bcomplian/i, /\bstress.?test/i, /\btax\b/i
];
```

If a hard pattern matches, return immediately. This covers ~60% of queries with zero ambiguity.

#### Tier 2: LLM Micro-Classifier (for ambiguous messages)

For the remaining ~40% that don't match any hard pattern, use a single structured-output LLM call with GPT-4o-mini (the cheapest model):

```typescript
const classificationSchema = {
  name: 'scope_classification',
  schema: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: [
          'portfolio_query',
          'financial_question',
          'off_topic',
          'ambiguous'
        ],
        description: 'The primary intent of the user message'
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'How confident you are in this classification'
      }
    },
    required: ['intent', 'confidence'],
    additionalProperties: false
  }
};
```

System prompt:

```
You are a request classifier for a portfolio analysis assistant. Classify the user's message intent.

- "portfolio_query": The user wants to analyze, view, or modify their investment portfolio (holdings, risk, taxes, performance, compliance, rebalancing, transactions, simulations, stress tests, market data).
- "financial_question": The user is asking about financial concepts, markets, or investing in general, but not specifically about their portfolio. Allow these through.
- "off_topic": The user is asking about something unrelated to finance (jokes, code, medical, legal, general knowledge, creative writing).
- "ambiguous": The message is too short or vague to classify.
```

**Routing logic:**

```typescript
// Tier 2 result routing:
switch (classification.intent) {
  case 'portfolio_query':
  case 'financial_question':
    return { type: 'ALLOW' };
  case 'off_topic':
    return { type: 'REJECT', reason: SCOPE_REFUSAL_RESPONSE };
  case 'ambiguous':
    return { type: 'AMBIGUOUS' };
}
```

**Cost:** GPT-4o-mini structured output with ~100 tokens input + ~20 tokens output ≈ $0.00003 per classification. At 1000 queries/day, that's $0.03/day.

#### Caching

The classifier result for a given message is cached in-memory (LRU, 500 entries, 5-minute TTL) so identical or near-identical messages don't re-run the LLM. The cache key is the lowercased, whitespace-normalized message.

### New Service: `ScopeClassifierService`

**Location:** `apps/api/src/app/endpoints/ai/scope/scope-classifier.service.ts`

```typescript
@Injectable()
export class ScopeClassifierService {
  private readonly cache = new LRUCache<string, ScopeResult>(500, 300_000);

  constructor(@Inject(LLM_CLIENT_TOKEN) private readonly llmClient: LLMClient) {}

  async classify(message: string): Promise<ScopeResult>;
}
```

### Migration Path

1. The existing `checkScopeGate()` method in `ai.service.ts` becomes `checkScopeGateLegacy()` (kept as fallback).
2. A new `checkScopeGateV2()` calls `ScopeClassifierService.classify()`.
3. Feature flag: `SCOPE_CLASSIFIER_V2=1` enables the new classifier. Default: legacy.
4. After validation, remove the legacy code.

### Modified Files

| File            | Change                                                           |
| --------------- | ---------------------------------------------------------------- |
| `ai.service.ts` | Replace `checkScopeGate()` with call to `ScopeClassifierService` |
| `ai.module.ts`  | Register `ScopeClassifierService`                                |

### New Files

```
scope/
  scope-classifier.service.ts       (~120 lines)
  scope-classifier.service.spec.ts  (~200 lines)
  scope-classifier.types.ts         (~20 lines)
```

### Test Strategy

**Unit tests (mocked LLM):**

- Hard-reject patterns: "write a poem about stocks" → REJECT without LLM call
- Hard-allow patterns: "show my holdings" → ALLOW without LLM call
- Ambiguous message → LLM called → routed correctly based on mock response
- Cache hit: same message twice → LLM called only once

**Regression tests:**

- All 3 existing `ai.service.spec.ts` keyword-stuffing tests continue to pass
- The existing scope-gate eval cases (`out-of-scope-crystal-ball`, `prompt-injection-ignore-instructions`, `malformed-query-gibberish`) all pass

**New eval cases:**

- "How should I position my 60/40 for the next decade?" → ALLOW (was potentially rejected by regex)
- "I want to return this product" → REJECT (was potentially allowed by regex matching "return")
- "What's the impact of inflation on bond ETFs?" → ALLOW (general financial question)

### Dependencies

- Benefits from WS-9 (model router) to ensure the cheapest model is used. Without WS-9, hardcode GPT-4o-mini for classifications.

### Estimated Effort

- 2–3 days

---

## WS-6: Tool Selection Router

### Problem

Every request sends all 10 tool definitions (~3000 tokens of schema) to the LLM, regardless of query. "What's my portfolio value?" sends the full schemas for `stress_test`, `simulate_trades`, `rebalance_suggest`, etc. This wastes tokens, increases cost, and increases the probability of the LLM calling an irrelevant tool.

### Design

#### Tool Relevance Scoring

**New service:** `ToolRouterService`

**Location:** `apps/api/src/app/endpoints/ai/routing/tool-router.service.ts`

The router uses a two-step approach:

**Step 1: Keyword signal scoring (deterministic, zero cost)**

Each tool gets a set of trigger keywords/phrases. The router scores each tool by counting keyword matches in the user message:

```typescript
private static readonly TOOL_SIGNALS: Record<string, string[]> = {
  get_portfolio_summary: ['portfolio', 'holdings', 'value', 'worth', 'summary', 'overview', 'allocation', 'what do i own', 'how much'],
  get_transaction_history: ['transaction', 'trade history', 'activity', 'bought', 'sold', 'recent trades', 'order history'],
  analyze_risk: ['risk', 'volatile', 'volatility', 'concentration', 'diversif', 'exposure', 'danger', 'safe'],
  market_data_lookup: ['price', 'quote', 'lookup', 'ticker', 'symbol', 'market data', 'current price', 'how much is'],
  performance_compare: ['performance', 'compare', 'benchmark', 'beat', 'outperform', 'underperform', 'vs', 'versus', 's&p', 'nasdaq', 'return'],
  compliance_check: ['compliance', 'compliant', 'rule', 'violation', 'regulatory', 'limit', 'restriction', 'allowed'],
  rebalance_suggest: ['rebalance', 'rebalancing', 'equal weight', 'target allocation', 'drift', 'adjust'],
  simulate_trades: ['simulate', 'what if', 'hypothetical', 'if i buy', 'if i sell', 'what would happen'],
  stress_test: ['stress test', 'crash', 'scenario', 'downturn', 'crisis', '2008', 'covid', 'worst case'],
  tax_estimate: ['tax', 'capital gains', 'loss harvest', 'realized', 'unrealized', 'fifo', 'cost basis', 'tax year']
};
```

**Step 2: Selection logic**

```typescript
public selectTools(message: string, requestedToolNames?: string[]): string[] {
  // If caller explicitly specified tools, respect that (existing behavior)
  if (requestedToolNames?.length) {
    return requestedToolNames;
  }

  const scores = this.scoreTools(message);
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);

  // Always include portfolio_summary as a foundation tool
  const selected = new Set<string>(['get_portfolio_summary']);

  // Add tools with score > 0, up to MAX_TOOLS
  for (const [tool, score] of sorted) {
    if (score > 0 && selected.size < MAX_SELECTED_TOOLS) {
      selected.add(tool);
    }
  }

  // If nothing scored (vague query), include all tools (fallback to current behavior)
  if (selected.size <= 1) {
    return [...AGENT_ALLOWED_TOOL_NAMES];
  }

  // Always include at least 3 tools to give the LLM some flexibility
  while (selected.size < MIN_SELECTED_TOOLS) {
    const next = sorted.find(([tool]) => !selected.has(tool));
    if (next) selected.add(next[0]);
    else break;
  }

  return [...selected];
}
```

**Constants:**

```typescript
const MAX_SELECTED_TOOLS = 5; // Never send more than 5 tool schemas
const MIN_SELECTED_TOOLS = 3; // Always send at least 3 for flexibility
```

#### Integration

In `ai.service.ts`, before calling `reactAgentService.run()`:

```typescript
const routedToolNames = this.toolRouterService.selectTools(
  message,
  sanitizedToolNames  // caller-specified tools take precedence
);

const result = await this.reactAgentService.run({
  prompt: message,
  toolNames: routedToolNames,  // was: sanitizedToolNames
  ...
});
```

#### Telemetry

The router logs which tools were selected vs. which the LLM actually invoked. This enables ongoing tuning of keyword signals:

```typescript
Logger.log(
  JSON.stringify({
    routedTools: routedToolNames,
    invokedTools: invokedToolNames,
    message: message.slice(0, 100)
  }),
  'ToolRouterService'
);
```

If the LLM frequently invokes a tool that wasn't in the routed set (requiring an escalation cycle), the keyword signals for that tool need expansion.

### New Files

```
routing/
  tool-router.service.ts          (~100 lines)
  tool-router.service.spec.ts     (~200 lines)
```

### Modified Files

| File            | Change                                                            |
| --------------- | ----------------------------------------------------------------- |
| `ai.service.ts` | Inject `ToolRouterService`, call `selectTools()` before agent run |
| `ai.module.ts`  | Register `ToolRouterService`                                      |

### Test Strategy

- Unit tests for keyword scoring: known messages → expected tool selections
- Edge case: message with no keywords → all tools (fallback)
- Edge case: caller specifies `toolNames` → router bypassed
- Regression: all existing golden-set eval cases still pass (router must not break any currently-passing case)

### Dependencies

- None.

### Estimated Effort

- 1.5–2 days

---

## WS-7: Semantic Response Cache

### Problem

Identical or semantically equivalent queries ("What's my portfolio worth?" / "How much is my portfolio?") run the full agent loop every time — LLM call, tool execution, verification. For queries where the underlying data hasn't changed, this is pure waste.

### Design

#### Cache Architecture

```
User sends message
       ↓
┌─────────────────────┐
│ Cache Key Computation│ ← normalize(message) + userId + toolSetHash
└──────────┬──────────┘
           ↓
     ┌───────────┐
     │ Cache Hit? │
     └───┬───┬───┘
       Yes   No
        ↓     ↓
  ┌────────┐ ┌──────────────┐
  │Freshness│ │ Run Agent    │
  │ Check   │ │ (full loop)  │
  └────┬───┘ └──────┬───────┘
    Fresh Stale      ↓
      ↓     ↓   ┌────────┐
  ┌──────┐  │   │ Cache   │
  │Return│  └───→│ Store   │
  │Cached│      └────────┘
  └──────┘
```

#### Cache Key

```typescript
function computeCacheKey(
  userId: string,
  message: string,
  toolNames: string[]
): string {
  const normalizedMessage = message
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // strip punctuation
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();

  const toolHash = toolNames.sort().join(',');
  return crypto
    .createHash('sha256')
    .update(`${userId}:${normalizedMessage}:${toolHash}`)
    .digest('hex');
}
```

#### Freshness Check

A cached response is considered fresh if:

1. It's less than `CACHE_TTL_MS` old (default: 120 seconds), AND
2. No new `Order` records have been created for this user since the cache entry was stored (checked via `prismaService.order.findFirst({ where: { userId, createdAt: { gt: cacheEntry.storedAt } } })`)

The order check ensures that if the user made a trade between queries, the cache is invalidated.

#### Cache Storage

**In-memory LRU cache** (same pattern as the rate limiter). No Redis dependency — the cache is per-instance and ephemeral.

```typescript
interface CacheEntry {
  response: ChatResponse;
  storedAt: Date;
}

private readonly cache = new Map<string, CacheEntry>();
private static readonly MAX_ENTRIES = 200;
private static readonly TTL_MS = 120_000;  // 2 minutes
```

#### New Service: `ResponseCacheService`

**Location:** `apps/api/src/app/endpoints/ai/cache/response-cache.service.ts`

```typescript
@Injectable()
export class ResponseCacheService {
  async get(key: string, userId: string): Promise<ChatResponse | null>;
  set(key: string, response: ChatResponse): void;
  invalidateUser(userId: string): void;
  computeKey(userId: string, message: string, toolNames: string[]): string;
}
```

#### Integration

In `ai.service.ts`:

```typescript
public async chat({ message, userId, ... }): Promise<ChatResponse> {
  // ... scope gate ...

  const cacheKey = this.responseCacheService.computeKey(userId, message, sanitizedToolNames);
  const cached = await this.responseCacheService.get(cacheKey, userId);
  if (cached) {
    // Still persist the exchange in conversation history
    await this.persistExchange(conversationId, message, cached, effectiveSystemPrompt, userId);
    return { ...cached, conversationId: resolvedConversationId };
  }

  // ... run agent, verify, persist ...

  this.responseCacheService.set(cacheKey, response);
  return response;
}
```

**Streaming path:** Cache hit for streaming emits the cached response as a single `done` event (no intermediate streaming events). This is correct because the user gets instant response.

#### Cache Bypass

- Conversations with prior history (continuing a thread) bypass the cache — the response depends on conversational context.
- Explicit `toolNames` override bypasses the cache (caller is testing specific tools).
- A `Cache-Control: no-cache` header on the request bypasses the cache.

### New Files

```
cache/
  response-cache.service.ts       (~100 lines)
  response-cache.service.spec.ts  (~150 lines)
```

### Modified Files

| File            | Change                                                                                  |
| --------------- | --------------------------------------------------------------------------------------- |
| `ai.service.ts` | Inject `ResponseCacheService`, add cache check before agent, cache store after response |
| `ai.module.ts`  | Register `ResponseCacheService`                                                         |

### Test Strategy

- Unit tests: cache hit, cache miss, TTL expiry, LRU eviction, invalidation on new order
- Integration test: send same message twice → second is faster and returns same data
- Regression: all golden-set evals pass (cache is transparent)

### Dependencies

- None.

### Estimated Effort

- 2 days

---

## WS-8: Context-Aware Action Engine

### Problem

The `ActionExtractorService` returns hardcoded follow-up suggestions based on a static lookup table. If risk analysis finds zero flags, it still suggests "How can I reduce risk?" If compliance shows 3 violations, it still suggests a generic "What violations need attention?" rather than a specific follow-up.

### Design

#### Replace Static Mapping with Result-Inspecting Functions

Each tool gets a **result inspector** function that examines the tool's output data and returns context-specific actions:

```typescript
// New type
interface ActionInspector {
  (toolName: string, data: Record<string, unknown>): ActionItem[];
}

// Registry of inspectors
private static readonly TOOL_INSPECTORS: Record<string, ActionInspector> = {
  analyze_risk: (_, data) => {
    const actions: ActionItem[] = [];
    const flags = data['flags'] as any[] | undefined;
    const riskLevel = data['overallRiskLevel'] as string | undefined;

    if (flags?.length > 0) {
      // There ARE risk issues — suggest fixing them
      const topFlag = flags[0];
      actions.push({
        actionType: 'chip',
        key: 'fix-risk-flag',
        label: `Address ${topFlag.title?.toLowerCase() ?? 'risk issue'}`,
        prompt: `How can I address the ${topFlag.title?.toLowerCase() ?? 'risk issue'} flag in my portfolio?`
      });
    } else {
      // No risk issues — suggest proactive exploration
      actions.push({
        actionType: 'chip',
        key: 'stress-test-portfolio',
        label: 'Run a stress test',
        prompt: 'Run a stress test on my portfolio to check resilience'
      });
    }

    if (riskLevel === 'HIGH') {
      actions.push({
        actionType: 'button',
        key: 'rebalance-reduce-risk',
        label: 'Suggest rebalancing to reduce risk',
        prompt: 'Suggest how I should rebalance to reduce my portfolio risk level'
      });
    }

    // Statistics-aware actions (from WS-4)
    const stats = data['statistics'] as Record<string, unknown> | undefined;
    const topCorrelated = stats?.['topCorrelatedPairs'] as any[] | undefined;
    if (topCorrelated?.length > 0) {
      const pair = topCorrelated[0];
      actions.push({
        actionType: 'chip',
        key: 'reduce-correlation',
        label: `${pair.symbolA} & ${pair.symbolB} are highly correlated`,
        prompt: `My ${pair.symbolA} and ${pair.symbolB} positions are highly correlated. How can I diversify?`
      });
    }

    return actions;
  },

  compliance_check: (_, data) => {
    const results = data['results'] as any[] | undefined;
    const failures = results?.filter((r: any) => r.status === 'fail') ?? [];

    if (failures.length > 0) {
      return [
        {
          actionType: 'button',
          key: 'fix-compliance-violations',
          label: `Fix ${failures.length} violation${failures.length > 1 ? 's' : ''}`,
          prompt: `How can I fix the ${failures.length} compliance violation${failures.length > 1 ? 's' : ''} in my portfolio?`
        },
        {
          actionType: 'chip',
          key: 'rebalance-for-compliance',
          label: 'Rebalance to become compliant',
          prompt: 'Suggest rebalancing trades that would bring my portfolio into compliance'
        }
      ];
    }

    return [
      {
        actionType: 'chip',
        key: 'portfolio-all-clear',
        label: 'Great! What about risk?',
        prompt: "I'm compliant. Now analyze my portfolio risk"
      }
    ];
  },

  tax_estimate: (_, data) => {
    const candidates = data['taxLossHarvestingCandidates'] as any[] | undefined;
    const gains = data['realizedGains'] as Record<string, unknown> | undefined;
    const total = gains?.['total'] as Record<string, unknown> | undefined;
    const netGain = total?.['netInBaseCurrency'] as number ?? 0;

    const actions: ActionItem[] = [];

    if (candidates?.length > 0) {
      const topCandidate = candidates[0];
      actions.push({
        actionType: 'chip',
        key: 'harvest-loss',
        label: `Harvest loss on ${topCandidate.symbol}`,
        prompt: `Should I sell ${topCandidate.symbol} to harvest the tax loss of ${topCandidate.unrealizedLossInBaseCurrency}?`
      });
    }

    if (netGain > 0) {
      actions.push({
        actionType: 'chip',
        key: 'offset-gains',
        label: 'Find ways to offset gains',
        prompt: 'What strategies can I use to offset my realized capital gains?'
      });
    }

    return actions;
  },

  // ... similar inspectors for other tools ...
};
```

#### Updated `extract()` Method

```typescript
public extract(
  invokedToolNames: string[],
  executedTools: ExecutedToolEntry[]    // NEW: now receives actual tool results
): ActionItem[] {
  const actions: ActionItem[] = [];
  const seenKeys = new Set<string>();

  // Process most recently invoked tools first
  for (const toolName of [...invokedToolNames].reverse()) {
    const inspector = ActionExtractorService.TOOL_INSPECTORS[toolName];
    if (!inspector) continue;

    // Find the tool result data
    const entry = executedTools.find(
      e => e.toolName === toolName && e.envelope.status === 'success'
    );
    const data = entry?.envelope.data ?? {};

    const toolActions = inspector(toolName, data);
    for (const action of toolActions) {
      if (seenKeys.has(action.key) || actions.length >= MAX_ACTIONS) continue;
      seenKeys.add(action.key);
      actions.push(action);
    }
  }

  return actions;
}
```

#### Call Site Update

In `ai.service.ts`:

```typescript
// OLD:
verified.actions = this.actionExtractorService.extract(invokedToolNames);

// NEW:
verified.actions = this.actionExtractorService.extract(
  invokedToolNames,
  result.executedTools ?? []
);
```

### Modified Files

| File                               | Change                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `action-extractor.service.ts`      | Replace static lookup with result-inspecting functions, update `extract()` signature |
| `action-extractor.service.spec.ts` | Rewrite tests to pass tool result data, test context-specific action generation      |
| `ai.service.ts`                    | Pass `executedTools` to `extract()`                                                  |

### Test Strategy

**Unit tests per inspector:**

- `analyze_risk` with high risk flags → "Address concentration" action
- `analyze_risk` with no flags → "Run a stress test" action
- `compliance_check` with 2 failures → "Fix 2 violations" action
- `compliance_check` fully compliant → "Great! What about risk?" action
- `tax_estimate` with harvesting candidates → "Harvest loss on AAPL" action
- `tax_estimate` with no candidates → no harvesting action

**Regression:**

- All existing tests adapted (they were testing static mappings; now test with mock data)

### Dependencies

- Benefits from WS-4 (risk statistics provide richer data for action generation)

### Estimated Effort

- 1.5–2 days

---

## WS-9: Model Complexity Router

### Problem

Every query — from "what's my portfolio?" (trivial single-tool) to "analyze risk, simulate selling tech, stress test against 2008, and estimate tax impact" (complex multi-tool chain) — uses the same model (GPT-4o-mini or GPT-4o depending on env config). Simple queries are overpaying, and the system has no fallback if the primary model is down.

### Design

#### Complexity Classifier

A deterministic function that classifies query complexity:

```typescript
export type QueryComplexity = 'simple' | 'moderate' | 'complex';

export function classifyComplexity(
  message: string,
  routedToolCount: number,
  hasConversationHistory: boolean
): QueryComplexity {
  // Complex indicators:
  // - Message asks for multiple analyses ("and", "then", "also")
  // - 4+ tools routed
  // - Contains conditional/hypothetical language ("what if", "compare", "simulate")
  // - Has conversation history (multi-turn reasoning)

  const multiAnalysisPattern =
    /\b(and\s+(?:also|then)|then\s+(?:also)?|compare.*(?:and|with|to|against)|both|all)\b/i;
  const hypotheticalPattern =
    /\b(what\s+if|hypothetical|simulate|scenario|stress\s+test)\b/i;

  let score = 0;

  if (routedToolCount >= 4) score += 2;
  else if (routedToolCount >= 2) score += 1;

  if (multiAnalysisPattern.test(message)) score += 1;
  if (hypotheticalPattern.test(message)) score += 1;
  if (hasConversationHistory) score += 1;
  if (message.length > 200) score += 1;

  if (score >= 3) return 'complex';
  if (score >= 1) return 'moderate';
  return 'simple';
}
```

#### Model Selection

```typescript
export interface ModelConfig {
  model: string;
  costPer1kTokens: number;
  maxContextTokens: number;
}

private static readonly MODEL_MAP: Record<QueryComplexity, ModelConfig> = {
  simple: {
    model: process.env.OPENAI_MODEL_SIMPLE ?? 'gpt-4.1-nano',
    costPer1kTokens: 0.0001,
    maxContextTokens: 128_000
  },
  moderate: {
    model: process.env.OPENAI_MODEL_MODERATE ?? 'gpt-4.1-mini',
    costPer1kTokens: 0.0004,
    maxContextTokens: 128_000
  },
  complex: {
    model: process.env.OPENAI_MODEL_COMPLEX ?? 'gpt-4.1',
    costPer1kTokens: 0.002,
    maxContextTokens: 128_000
  }
};
```

#### LLM Client Enhancement

Add `model` override to `LLMCompletionRequest`:

```typescript
export interface LLMCompletionRequest {
  messages: LLMMessage[];
  model?: string; // NEW: overrides default model
  temperature?: number;
  toolChoice?: 'auto' | 'none' | 'required';
  tools?: LLMToolDefinition[];
}
```

In `OpenAiClientService.buildRequestParams()`:

```typescript
model: request.model ?? this.model,  // was: this.model
```

#### Fallback Chain

If the primary model for a complexity tier fails (429, 5xx), automatically retry with the next tier up:

```typescript
const FALLBACK_CHAIN: Record<QueryComplexity, QueryComplexity[]> = {
  simple: ['moderate', 'complex'],
  moderate: ['complex', 'simple'],
  complex: ['moderate']
};
```

This is implemented in the `ReactAgentService` catch block, where the retry re-runs with an escalated model.

#### Integration

In `ai.service.ts`:

```typescript
const complexity = classifyComplexity(
  message,
  routedToolNames.length,
  priorMessages.length > 0
);

const modelConfig = ModelRouterService.getModelConfig(complexity);

const result = await this.reactAgentService.run({
  prompt: message,
  model: modelConfig.model,        // NEW
  guardrails: {
    ...defaultGuardrails,
    fallbackCostPer1kTokensUsd: modelConfig.costPer1kTokens
  },
  ...
});
```

### New Files

```
routing/
  model-router.service.ts          (~80 lines)
  model-router.service.spec.ts     (~120 lines)
  complexity-classifier.ts         (~60 lines)
  complexity-classifier.spec.ts    (~100 lines)
```

### Modified Files

| File                           | Change                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| `llm/llm-client.interface.ts`  | Add optional `model` field to `LLMCompletionRequest`         |
| `llm/openai-client.service.ts` | Use `request.model ?? this.model`                            |
| `agent/react-agent.service.ts` | Pass `model` through to LLM calls                            |
| `ai.service.ts`                | Inject `ModelRouterService`, classify complexity, pass model |
| `agent/agent.constants.ts`     | Add model env var defaults                                   |

### Test Strategy

- Unit tests for complexity classifier: known messages → expected complexity levels
- Unit tests for model selection: each complexity → correct model config
- Integration test: simple query → verify cheaper model used (check telemetry log)
- Fallback test: mock primary model 429 → verify fallback model used

### Dependencies

- Benefits from WS-6 (tool router provides `routedToolCount` input to complexity classifier)

### Estimated Effort

- 2–3 days

---

## WS-10: Tool Output Summarization

### Problem

Tools return verbose JSON blobs that are injected directly into the LLM context. `analyze_risk` returns the full `exposures` object, all `flags`, all `warnings`, `assumptions` arrays, etc. The `AGENT_TOOL_OUTPUT_MAX_CHARS = 32_000` limit is a blunt safety net, but the real problem is signal-to-noise ratio. The LLM has to wade through thousands of tokens of boilerplate to find the 5–10 salient facts.

### Design

#### Tool-Specific Summarizers

Each tool gets a deterministic summarizer function that extracts the key facts into a compact format. The full JSON is still available in the tool result envelope (for citation checking in WS-1), but the LLM sees only the summary.

**New file:** `tools/utils/tool-summarizers.ts`

```typescript
export type ToolSummarizer = (data: Record<string, unknown>) => string;

export const TOOL_SUMMARIZERS: Record<string, ToolSummarizer> = {
  get_portfolio_summary: (data) => {
    const totals = (data['totals'] as Record<string, unknown>) ?? {};
    const topHoldings = (data['topHoldings'] as any[]) ?? [];
    const warnings = (data['warnings'] as any[]) ?? [];

    let summary = `Portfolio: ${totals['holdingsCount'] ?? 0} holdings, total value ${data['baseCurrency'] ?? 'USD'} ${Number(totals['totalPortfolioValueInBaseCurrency'] ?? 0).toLocaleString()}, cash ${Number(totals['cashInBaseCurrency'] ?? 0).toLocaleString()}.\n`;

    summary +=
      'Top holdings: ' +
      topHoldings
        .slice(0, 5)
        .map(
          (h) =>
            `${h.symbol} (${(Number(h.allocationInPortfolio ?? 0) * 100).toFixed(1)}%, ${data['baseCurrency']} ${Number(h.valueInBaseCurrency ?? 0).toLocaleString()})`
        )
        .join(', ') +
      '.\n';

    if (warnings.length > 0) {
      summary += `Warnings: ${warnings.map((w) => w.message).join('; ')}`;
    }

    return summary;
  },

  analyze_risk: (data) => {
    const riskLevel = data['overallRiskLevel'] ?? 'UNKNOWN';
    const flags = (data['flags'] as any[]) ?? [];
    const vol = data['volatilityProxyScore'] ?? 0;
    const stats = data['statistics'] as Record<string, unknown> | undefined;

    let summary = `Risk level: ${riskLevel}. Volatility proxy: ${(Number(vol) * 100).toFixed(1)}%.`;

    if (stats) {
      summary += ` Portfolio volatility (90d): ${(Number(stats['portfolioVolatility'] ?? 0) * 100).toFixed(1)}%. Diversification score: ${(Number(stats['diversificationScore'] ?? 0) * 100).toFixed(0)}%.`;
    }

    if (flags.length > 0) {
      summary +=
        '\nFlags: ' +
        flags
          .map(
            (f) =>
              `${f.title} (${f.severity}, ${f.metricName}: ${(Number(f.metricValue) * 100).toFixed(1)}% vs threshold ${(Number(f.threshold) * 100).toFixed(1)}%)`
          )
          .join('; ');
    } else {
      summary += '\nNo risk flags triggered.';
    }

    return summary;
  }

  // ... similar for all 10 tools ...
};
```

#### Integration into `ReactAgentService.executeToolCall()`

```typescript
// After getting the raw tool response:
const rawContent = JSON.stringify(toolResponse);

// NEW: attempt to summarize
const summarizer = TOOL_SUMMARIZERS[toolCall.name];
let content: string;

if (summarizer && typeof toolResponse === 'object' && toolResponse !== null) {
  try {
    const summaryText = summarizer(
      'data' in toolResponse ? (toolResponse as any).data : toolResponse
    );
    // Include summary + truncated raw for LLM to reference specific values
    content = `[SUMMARY]\n${summaryText}\n\n[RAW DATA (first ${AGENT_TOOL_OUTPUT_MAX_CHARS / 2} chars)]\n${rawContent.slice(0, AGENT_TOOL_OUTPUT_MAX_CHARS / 2)}`;
  } catch {
    // Summarizer failed — fall through to raw content
    content =
      rawContent.length > AGENT_TOOL_OUTPUT_MAX_CHARS
        ? rawContent.slice(
            0,
            AGENT_TOOL_OUTPUT_MAX_CHARS - TRUNCATION_SUFFIX.length
          ) + TRUNCATION_SUFFIX
        : rawContent;
  }
} else {
  content =
    rawContent.length > AGENT_TOOL_OUTPUT_MAX_CHARS
      ? rawContent.slice(
          0,
          AGENT_TOOL_OUTPUT_MAX_CHARS - TRUNCATION_SUFFIX.length
        ) + TRUNCATION_SUFFIX
      : rawContent;
}
```

**Key design decision:** The LLM still receives a portion of the raw JSON alongside the summary. This ensures the citation checker (WS-1) can still verify numbers, and the LLM can reference specific values when the user asks "what exactly is my AAPL allocation?"

#### Token Savings Estimate

| Tool                    | Current avg tokens | With summary | Savings |
| ----------------------- | ------------------ | ------------ | ------- |
| `get_portfolio_summary` | ~800               | ~200         | 75%     |
| `analyze_risk`          | ~1200              | ~300         | 75%     |
| `tax_estimate`          | ~600               | ~200         | 67%     |
| `compliance_check`      | ~900               | ~250         | 72%     |
| `rebalance_suggest`     | ~1500              | ~400         | 73%     |
| `stress_test`           | ~1000              | ~300         | 70%     |

Average reduction: ~70% fewer tokens per tool call.

### New Files

```
tools/utils/
  tool-summarizers.ts              (~250 lines)
  tool-summarizers.spec.ts         (~300 lines)
```

### Modified Files

| File                           | Change                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `agent/react-agent.service.ts` | Import summarizers, apply in `executeToolCall()`                                        |
| `agent/agent.constants.ts`     | Add `AGENT_SUMMARY_RAW_CHARS = 16_000` (how much raw JSON to include alongside summary) |

### Test Strategy

**Unit tests per summarizer:**

- Known tool output → expected summary string
- Empty/missing data → graceful summary ("No data available")
- Malformed data → no crash, fallback to raw

**Integration test:**

- Run a golden-set eval case and verify the `content` field in the tool message starts with `[SUMMARY]`
- Verify citation checker (WS-1) still works with summarized + truncated raw data

### Dependencies

- Independent. Benefits from WS-4 (richer `statistics` block to summarize in risk tool).

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

Depends on another WS for full functionality:
  WS-4  (Statistical Risk) — independent, but WS-8 and WS-10 reference its output
```

## Recommended Implementation Order

```
Phase A (Days 1–5):    WS-3, WS-6, WS-10 — quick wins, low risk
Phase B (Days 4–10):   WS-1, WS-8 — core quality improvements
Phase C (Days 8–14):   WS-4, WS-5 — statistical + classifier upgrades
Phase D (Days 12–18):  WS-2, WS-7, WS-9 — infrastructure enhancements
```

Phases overlap: Phase B can start before Phase A is fully complete because they touch different files.

## Total Estimated Effort

| WS        | Days      | Risk                                                            |
| --------- | --------- | --------------------------------------------------------------- |
| WS-1      | 3–4       | Medium (LLM grounding checker needs careful prompt engineering) |
| WS-2      | 4–5       | Medium (Prisma migration, extraction prompt quality)            |
| WS-3      | 1.5–2     | Low (data already exists, straightforward computation)          |
| WS-4      | 3–4       | Medium (statistics correctness requires careful testing)        |
| WS-5      | 2–3       | Low–Medium (LLM classification is well-understood)              |
| WS-6      | 1.5–2     | Low (deterministic routing, easy to test)                       |
| WS-7      | 2         | Low (in-memory cache, straightforward invalidation)             |
| WS-8      | 1.5–2     | Low (refactoring existing code, no new infra)                   |
| WS-9      | 2–3       | Medium (fallback chain needs robust error handling)             |
| WS-10     | 2         | Low (pure functions, easy to test)                              |
| **Total** | **23–30** |                                                                 |

With parallelization across 2 developers: **~15 working days (3 weeks)**.
