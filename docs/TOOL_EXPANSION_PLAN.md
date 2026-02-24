# Tool Expansion Plan — 5 New Agent Tools

## Overview

Add the remaining 5 tools from the Pre-Search document to bring the agent from 3 → 8 tools.
All tools follow the existing patterns established by the MVP tools.

**Current tools (3):** `get_portfolio_summary`, `get_transaction_history`, `analyze_risk`

**New tools (5):**

| #   | Tool                  | Tier | Complexity | Ghostfolio Services Used                                       |
| --- | --------------------- | ---- | ---------- | -------------------------------------------------------------- |
| 1   | `market_data_lookup`  | 2    | Medium     | `SymbolService`, `MarketDataService`, `SymbolProfileService`   |
| 2   | `performance_compare` | 2    | High       | `PortfolioService.getPerformance()`, `BenchmarkService`        |
| 3   | `tax_estimate`        | 3    | High       | `OrderService`, `PortfolioService.getHolding()`, Prisma direct |
| 4   | `compliance_check`    | 3    | Medium     | `PortfolioService.getDetails()`, Prisma direct                 |
| 5   | `rebalance_suggest`   | 3    | High       | `PortfolioService.getDetails()`, `UserService`                 |

---

## Conventions (from existing codebase)

Every tool follows this exact pattern:

### File structure

```
apps/api/src/app/endpoints/ai/tools/
├── <tool-name>.tool.ts          # @Injectable() class implementing ToolDefinition<TInput, TOutput>
├── <tool-name>.tool.spec.ts     # Jest unit tests with mocked services
├── tool.types.ts                # Shared types (already exists)
├── tool.registry.ts             # Registry (already exists)
└── validators.ts                # Validators (already exists)
```

### Class pattern

- `@Injectable()` NestJS service
- Implements `ToolDefinition<TInput, TOutput>`
- Has `name`, `description`, `inputSchema`, `outputSchema` (all `ToolJsonSchema`)
- Single `execute(input, context)` method
- `context.userId` is the ONLY source of user identity — never from input
- Returns typed output or `ToolResultEnvelope<TOutput>` (for `partial` status)
- All math is deterministic in code, never delegated to the LLM
- Output always includes a `warnings[]` array with `{ code, message }` entries

### Registration

- Add as `@Injectable()` provider in `ai.module.ts`
- Add to the `AI_TOOL_DEFINITIONS_TOKEN` factory inject list + array

### Testing pattern

- Construct tool directly with mocked services (`jest.fn().mockResolvedValue(...)`)
- No TestingModule needed — pure unit tests
- Test happy path, empty data, edge cases, and input validation boundaries

---

## Tool 1: `market_data_lookup`

### Purpose

Look up current price, symbol metadata, and recent price history for a given symbol. Lets the agent answer "What's the current price of AAPL?" or "Show me TSLA's price history for the last 30 days."

### File

`apps/api/src/app/endpoints/ai/tools/market-data-lookup.tool.ts`

### Dependencies (injected)

- **`SymbolService`** — `get()` returns current quote + optional historical data
- **`SymbolService`** — `lookup()` for symbol search when user gives a name instead of ticker
- **`SymbolProfileService`** — `getSymbolProfiles()` for metadata (assetClass, sectors, countries, currency)
- **`UserService`** — for base currency

### Input Schema

```typescript
interface MarketDataLookupInput {
  symbol: string; // required — ticker symbol (e.g., "AAPL")
  dataSource?: string; // optional — DataSource enum, default "YAHOO"
  includeHistory?: boolean; // optional — include recent price history, default false
  historyDays?: number; // optional — 1–365, default 30
}
```

### Output Schema

```typescript
interface MarketDataLookupOutput {
  symbol: string;
  dataSource: string;
  name: string;
  currency: string;
  assetClass: string;
  assetSubClass: string;
  marketPrice: number; // current/latest cached price
  priceUpdatedAt: string; // ISO timestamp of quote
  sectors: { name: string; weight: number }[];
  countries: { code: string; weight: number }[];
  historicalData: {
    // only if includeHistory=true
    date: string;
    marketPrice: number;
  }[];
  priceChange: {
    // computed from history if available
    absoluteChange: number;
    percentChange: number;
    periodDays: number;
  } | null;
  warnings: { code: string; message: string }[];
}
```

### Key implementation details

- Use `SymbolService.get()` with `includeHistoricalData` param for the heavy lifting
- Look up the `SymbolProfile` from Prisma to get `assetClass`, `sectors`, `countries`, `name`
- If `marketPrice` is 0 or null → warning `missing_market_price`
- If no historical data returned when requested → warning `no_historical_data`
- Compute `priceChange` deterministically: `(latest - earliest) / earliest`
- Clamp `historyDays` to 1–365
- Default `dataSource` to `'YAHOO'` (most common in Ghostfolio)

### Test cases

1. Happy path — symbol found, price + metadata returned
2. Symbol with history — `includeHistory=true`, verify price change computation
3. Unknown symbol — returns structured error/empty with warning
4. Missing metadata — no sectors/countries → empty arrays, no crash
5. Zero market price → `missing_market_price` warning

---

## Tool 2: `performance_compare`

### Purpose

Compare the user's portfolio performance against benchmarks over a given date range. Answers "How has my portfolio performed vs the S&P 500 this year?"

### File

`apps/api/src/app/endpoints/ai/tools/performance-compare.tool.ts`

### Dependencies (injected)

- **`PortfolioService`** — `getPerformance()` for portfolio returns
- **`BenchmarkService`** — `getBenchmarks()` for benchmark performance data, `getBenchmarkTrends()` for 50d/200d trends
- **`UserService`** — for base currency and user settings

### Input Schema

```typescript
interface PerformanceCompareInput {
  dateRange?: 'ytd' | '1d' | '1w' | '1m' | '3m' | '6m' | '1y' | '5y' | 'max'; // default 'ytd'
  benchmarkSymbols?: string[]; // optional — specific benchmarks to compare. If empty, use configured benchmarks.
}
```

### Output Schema

```typescript
interface PerformanceCompareOutput {
  baseCurrency: string;
  dateRange: string;
  period: {
    startDate: string;
    endDate: string;
  };
  portfolio: {
    currentNetWorth: number;
    currentValueInBaseCurrency: number;
    netPerformance: number;
    netPerformancePercentage: number;
    netPerformanceWithCurrencyEffect: number;
    netPerformancePercentageWithCurrencyEffect: number;
    totalInvestment: number;
    firstOrderDate: string | null;
    hasErrors: boolean;
  };
  benchmarks: {
    symbol: string;
    name: string;
    dataSource: string;
    marketCondition: string; // 'ALL_TIME_HIGH' | 'BEAR_MARKET' | 'NEUTRAL_MARKET'
    performances: {
      allTimeHigh: {
        date: string | null;
        performancePercent: number;
      };
    };
    trend50d: string; // 'UP' | 'DOWN' | 'NEUTRAL'
    trend200d: string;
  }[];
  comparison: {
    // deterministic diff computed in code
    outperformingBenchmarks: string[]; // benchmark symbols portfolio beats
    underperformingBenchmarks: string[]; // benchmark symbols portfolio trails
  };
  assumptions: string[];
  warnings: { code: string; message: string }[];
}
```

### Key implementation details

- Call `PortfolioService.getPerformance()` with user's `dateRange` and `userId`
- Call `BenchmarkService.getBenchmarks()` for configured benchmark data
- Deterministically compute `comparison` — compare `netPerformancePercentage` vs each benchmark's performance
- **Important:** Ghostfolio's `BenchmarkService.getBenchmarks()` returns `performancePercentFromAllTimeHigh`, NOT period returns. The comparison section should clearly state this assumption.
- If no benchmark data → warning `no_benchmark_data`
- If portfolio has no activities → warning `empty_portfolio`
- If `hasErrors` from portfolio calc → warning `calculation_errors`
- `dateRange` maps directly to Ghostfolio's `DateRange` type

### Test cases

1. Happy path — portfolio vs 2 benchmarks, outperforming one
2. No benchmarks configured → empty benchmarks array + warning
3. Empty portfolio → zero performance, helpful warning
4. Portfolio with calculation errors → still returns data + `hasErrors` warning
5. Various date ranges

---

## Tool 3: `tax_estimate`

### Purpose

Estimate realized capital gains/losses from transactions. Identify tax-loss harvesting candidates. **Clearly labeled as estimates — NOT tax advice.**

### File

`apps/api/src/app/endpoints/ai/tools/tax-estimate.tool.ts`

### Dependencies (injected)

- **`OrderService`** — `getOrders()` for BUY/SELL transactions
- **`PortfolioService`** — `getDetails()` for current holdings with cost basis
- **`UserService`** — for base currency
- **`PrismaService`** — direct query for enriching with symbol profile data

### Input Schema

```typescript
interface TaxEstimateInput {
  taxYear?: number; // optional — defaults to current year
  jurisdiction?: string; // optional — e.g., 'US', 'DE', 'CH'. If omitted → generic estimate + warning
  holdingPeriodMonths?: number; // optional — short-term cutoff in months, default 12
}
```

### Output Schema

```typescript
interface TaxEstimateOutput {
  taxYear: number;
  jurisdiction: string | null;
  baseCurrency: string;
  realizedGains: {
    shortTerm: {
      gainInBaseCurrency: number;
      lossInBaseCurrency: number;
      netInBaseCurrency: number;
      transactionCount: number;
    };
    longTerm: {
      gainInBaseCurrency: number;
      lossInBaseCurrency: number;
      netInBaseCurrency: number;
      transactionCount: number;
    };
    total: {
      gainInBaseCurrency: number;
      lossInBaseCurrency: number;
      netInBaseCurrency: number;
      transactionCount: number;
    };
  };
  taxLossHarvestingCandidates: {
    symbol: string;
    name: string;
    currentValueInBaseCurrency: number;
    costBasisInBaseCurrency: number;
    unrealizedLossInBaseCurrency: number;
    holdingPeriodDays: number;
    isLongTerm: boolean;
  }[];
  assumptions: string[];
  disclaimers: string[];
  warnings: { code: string; message: string }[];
}
```

### Key implementation details

- **Cost basis method:** FIFO (First In, First Out) — stated as assumption
- Query all BUY and SELL orders for the tax year via `OrderService.getOrders()`
- For each SELL, match against earliest unmatched BUYs of same symbol to compute gain/loss
- Classify short-term vs long-term based on `holdingPeriodMonths` (default 12)
- For TLH candidates: scan current holdings for unrealized losses using `PortfolioService.getDetails()` holdings data
- **Explicit refusal rules (from Pre-Search):**
  - No jurisdiction → return generic estimate + warning `no_jurisdiction_provided`
  - Unsupported asset type (e.g., options) → `unsupported_asset_type` warning
  - Missing cost basis → return range with warning rather than single number
- **Always include disclaimers:**
  - "This is an estimate for informational purposes only, not tax advice."
  - "Consult a qualified tax professional for actual tax obligations."
  - "Wash sale rules and jurisdiction-specific rules are NOT applied."
- All math deterministic in code — FIFO matching loop, no LLM

### Test cases

1. Happy path — multiple BUY/SELL pairs, correct short/long classification
2. No sells in tax year → zero realized gains, still show TLH candidates
3. Missing cost basis → warning + range estimate
4. No jurisdiction → generic estimate + `no_jurisdiction_provided` warning
5. Single holding with unrealized loss → appears in TLH candidates
6. Partial sell (sell 5 of 10 shares) → correct FIFO matching

---

## Tool 4: `compliance_check`

### Purpose

Run rule-based policy checks against the portfolio. Flags concentration limits, restricted assets, minimum diversification. **Explainable and deterministic — NOT LLM-judged.**

### File

`apps/api/src/app/endpoints/ai/tools/compliance-check.tool.ts`

### Dependencies (injected)

- **`PortfolioService`** — `getDetails()` for holdings + allocation data
- **`UserService`** — for base currency

### Input Schema

```typescript
interface ComplianceCheckInput {
  rules?: {
    maxSinglePositionPct?: number; // default 0.25 (25%)
    maxTop3Pct?: number; // default 0.65 (65%)
    maxSectorPct?: number; // default 0.40 (40%)
    maxAssetClassPct?: number; // default 0.80 (80%)
    minHoldingsCount?: number; // default 5
    maxCashPct?: number; // default 0.30 (30%)
    restrictedSymbols?: string[]; // symbols that should not appear
    restrictedAssetClasses?: string[]; // asset classes that should not appear
  };
}
```

### Output Schema

```typescript
interface ComplianceCheckOutput {
  baseCurrency: string;
  generatedAt: string;
  portfolioValueInBaseCurrency: number;
  holdingsCount: number;
  rulesChecked: number;
  rulesPassed: number;
  rulesFailed: number;
  results: {
    ruleId: string;
    ruleName: string;
    description: string;
    status: 'pass' | 'fail' | 'warn' | 'skip';
    currentValue: number | string;
    threshold: number | string;
    details: string;
  }[];
  overallStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'NEEDS_REVIEW';
  assumptions: string[];
  warnings: { code: string; message: string }[];
}
```

### Key implementation details

- Pure rule-based evaluation — no LLM judgment
- Each rule is a function: `(portfolio, threshold) → { status, currentValue, details }`
- Built-in rules (all run by default with configurable thresholds):
  1. **`max_single_position`** — no single holding > X% of portfolio
  2. **`max_top3_concentration`** — top 3 holdings < X% of portfolio
  3. **`max_sector_concentration`** — no single sector > X%
  4. **`max_asset_class_concentration`** — no single asset class > X%
  5. **`min_holdings_count`** — must have at least N holdings
  6. **`max_cash_allocation`** — cash < X% of portfolio
  7. **`restricted_symbols`** — flagged symbols must not appear
  8. **`restricted_asset_classes`** — flagged asset classes must not appear
- `overallStatus`: `COMPLIANT` if all pass, `NON_COMPLIANT` if any fail, `NEEDS_REVIEW` if only warnings
- This deliberately overlaps with `analyze_risk` but is framed as policy/compliance vs. risk analysis
- Reuse the holdings data pattern from `analyze_risk` (call `PortfolioService.getDetails()`)

### Test cases

1. Happy path — all rules pass → `COMPLIANT`
2. Single position exceeds limit → `NON_COMPLIANT` with correct rule failure
3. Restricted symbol present → flagged
4. Sparse portfolio (2 holdings) → `min_holdings_count` fails
5. High cash allocation → `max_cash_allocation` fails
6. Custom thresholds override defaults
7. Empty portfolio → all rules skip or warn

---

## Tool 5: `rebalance_suggest`

### Purpose

Generate a simulation-only rebalancing plan. Shows what trades would bring the portfolio closer to a target allocation. **Simulation only — cannot execute.**

### File

`apps/api/src/app/endpoints/ai/tools/rebalance-suggest.tool.ts`

### Dependencies (injected)

- **`PortfolioService`** — `getDetails()` for current holdings + cash
- **`UserService`** — for base currency

### Input Schema

```typescript
interface RebalanceSuggestInput {
  strategy?: 'equal_weight' | 'market_cap_weight' | 'custom'; // default 'equal_weight'
  targetAllocations?: {
    // required if strategy='custom'
    symbol: string;
    targetPct: number; // 0–1
  }[];
  constraints?: {
    maxTurnoverPct?: number; // 0–1, default 0.20 (20% of portfolio)
    maxTrades?: number; // default 10
    minTradeValueInBaseCurrency?: number; // default 50
    cashReservePct?: number; // 0–1, default 0.02 (keep 2% in cash)
  };
}
```

### Output Schema

```typescript
interface RebalanceSuggestOutput {
  baseCurrency: string;
  generatedAt: string;
  strategy: string;
  portfolioValueInBaseCurrency: number;
  currentAllocations: {
    symbol: string;
    name: string;
    currentPct: number;
    currentValueInBaseCurrency: number;
  }[];
  targetAllocations: {
    symbol: string;
    name: string;
    targetPct: number;
    targetValueInBaseCurrency: number;
  }[];
  suggestedTrades: {
    symbol: string;
    name: string;
    action: 'BUY' | 'SELL';
    quantityEstimate: number; // approximate shares (uses current market price)
    valueInBaseCurrency: number;
    currentPct: number;
    targetPct: number;
    driftPct: number; // |current - target|
  }[];
  summary: {
    totalTradesCount: number;
    totalBuyValueInBaseCurrency: number;
    totalSellValueInBaseCurrency: number;
    estimatedTurnoverPct: number;
    constraintsApplied: string[];
    tradesLimitedByConstraints: boolean;
  };
  assumptions: string[];
  disclaimers: string[];
  warnings: { code: string; message: string }[];
}
```

### Key implementation details

- **SIMULATION ONLY** — output includes explicit disclaimers, never executes
- **Strategy logic (deterministic):**
  - `equal_weight`: target = 1/N for each holding (minus cash reserve)
  - `market_cap_weight`: keep current proportions (no-op, but show drift from current)
  - `custom`: use provided `targetAllocations`. Validate they sum to ~1.0 (±0.05 tolerance)
- **Rebalancing algorithm:**
  1. Compute drift per holding: `driftPct = currentPct - targetPct`
  2. Sort by absolute drift descending
  3. For each holding, compute trade needed: `tradeValue = (targetPct - currentPct) * portfolioValue`
  4. Apply constraints: skip trades below `minTradeValue`, cap at `maxTrades`, respect `maxTurnoverPct`
  5. `quantityEstimate = tradeValue / marketPrice` (approximate — uses cached price)
- Cash reserve: hold back `cashReservePct` of portfolio value from target allocations
- All math in code — no LLM
- **Always include disclaimers:**
  - "This is a simulation only. No trades will be executed."
  - "Quantity estimates use cached market prices and may differ from actual execution prices."
  - "Tax implications of suggested trades are not considered."

### Test cases

1. Happy path — `equal_weight` with 3 holdings, correct trades generated
2. Custom allocation — targets sum to 1.0, trades match
3. Custom allocation — targets DON'T sum to ~1.0 → validation error
4. Constraints applied — `maxTrades=2` limits output to 2 suggestions
5. Constraints applied — `maxTurnoverPct=0.10` limits total trade value
6. `minTradeValue` filters out tiny rebalances
7. Empty portfolio → no suggestions, helpful warning
8. Single holding + `equal_weight` → no-op (already 100%)
9. Cash reserve math — verify cash is excluded from allocation targets

---

## Registration / Wiring Changes

### `ai.module.ts` changes

```typescript
// New imports
import { ComplianceCheckTool } from './tools/compliance-check.tool';
import { MarketDataLookupTool } from './tools/market-data-lookup.tool';
import { PerformanceCompareTool } from './tools/performance-compare.tool';
import { RebalanceSuggestTool } from './tools/rebalance-suggest.tool';
import { TaxEstimateTool } from './tools/tax-estimate.tool';

// New module imports (may be needed)
// - SymbolModule (for SymbolService)
// - BenchmarkModule (already imported)

// Add to providers array:
//   MarketDataLookupTool,
//   PerformanceCompareTool,
//   TaxEstimateTool,
//   ComplianceCheckTool,
//   RebalanceSuggestTool,

// Update AI_TOOL_DEFINITIONS_TOKEN factory:
//   inject: [...existing, MarketDataLookupTool, PerformanceCompareTool, TaxEstimateTool, ComplianceCheckTool, RebalanceSuggestTool]
//   useFactory: (...tools) => tools
```

### Additional service imports likely needed

- **`SymbolService`** — not currently in `ai.module.ts`; lives in `apps/api/src/app/symbol/symbol.service.ts`. Needs `DataProviderService` (from `DataProviderModule`, already imported).
- **`BenchmarkService`** — imported via `BenchmarkModule` already.
- **`SymbolProfileService`** — imported via `SymbolProfileModule` already.
- **`AccountBalanceService`** — already in providers.

---

## Implementation Order

Based on dependencies and complexity:

### Phase 1 — Tier 2 tools (independent, medium complexity)

These have no dependencies on each other and can be built in parallel.

1. **`market_data_lookup`** — most self-contained; uses SymbolService which is straightforward
2. **`performance_compare`** — uses PortfolioService.getPerformance() + BenchmarkService

### Phase 2 — Tier 3 tools (build on existing data, higher complexity)

3. **`tax_estimate`** — needs careful FIFO matching logic; most code-heavy
4. **`compliance_check`** — medium complexity; reuses patterns from `analyze_risk`
5. **`rebalance_suggest`** — most complex output; needs holdings + market prices

### Phase 3 — Integration

6. **Wire all 5 tools into `ai.module.ts`**
7. **Update eval suite** — add 2–3 eval cases per tool (10–15 new cases)

---

## TDD Flow (per AGENTS.md)

For each tool:

1. **Write the spec file first** (`<tool>.tool.spec.ts`)
   - Mock all Ghostfolio services
   - Write happy path + edge case + empty data tests
   - Tests should FAIL (tool doesn't exist yet)

2. **Run tests → confirm red**

   ```bash
   npx nx test api --testPathPattern='<tool>.tool.spec'
   ```

3. **Implement the tool** (`<tool>.tool.ts`)
   - `@Injectable()` class
   - Input/output schemas
   - `execute()` method with deterministic logic

4. **Run tests → confirm green**

5. **Commit** (scoped conventional commit: `feat(ai): add <tool_name> tool`)

6. **Wire into module** (separate commit after all tools pass individually)

---

## Risk Notes

- **Ghostfolio's `PortfolioService.getPerformance()`** is heavy — it instantiates a portfolio calculator. May be slow for large portfolios. Monitor latency.
- **`BenchmarkService.getBenchmarks()`** returns ATH-relative performance, not period returns. The `performance_compare` tool must clearly document this.
- **`tax_estimate` FIFO matching** is the most complex new logic. Edge cases: partial sells, same-day buys/sells, multi-currency transactions. Needs thorough testing.
- **`rebalance_suggest` quantity estimates** use cached prices which may be stale. Must warn about this.
- **Schema coupling** — Ghostfolio's internal service return types aren't always typed. Defensive coding (`?? 0`, `?? ''`, `?? []`) is required everywhere, consistent with existing tools.

---

## What Comes After — Post-Tool-Expansion Next Steps

Once all 8 tools are live, tested, and wired in, these are the next areas to tackle (from the Pre-Search document roadmap):

### Observability

6. **Helicone integration** — Proxy OpenAI calls for cost/latency tracking. Swap the OpenAI `baseURL` to route through Helicone's proxy. Gives per-request token counts, cost breakdowns, and latency histograms with zero code changes to the agent loop. Configure `omit logs` for privacy-sensitive deployments.
7. **Langfuse integration** — Full agent tracing with traces/spans for each tool call and privacy-safe masking. Wrap `ReactAgentService.run()` in a Langfuse trace; create child spans for each LLM call and tool execution. Mask PII/financial amounts before sending. This is the foundation for eval dataset management and drift detection.

### Verification Depth

8. **Numerical integrity** — Add a `computed_fields` map to the final response schema. Every number in the agent's Markdown answer must trace back to a value in `computed_fields` or a referenced tool output. Numbers that appear in the prose but not in `computed_fields` are flagged for rejection/repair. This is the strongest defense against number hallucinations.
9. **Claim grounding** — Every factual claim in the agent's response must trace to a timestamped tool output. The agent should abstain on external questions that have no configured data source. Implement as a post-processing verification step that cross-references response claims against the tool call trace.

### Eval Expansion

10. **Scale eval suite to 50+ cases** — Expand from the current MVP eval pack to full coverage: happy path (20+), edge cases (10+), adversarial (10+), multi-step (10+). Each case includes expected tool(s), key output fields/invariants, and pass/fail criteria. This is the hard gate for regressions — eval pass rate target is >80% (stretch >90%).
11. **Langfuse dataset integration** — Store eval runs and score history in Langfuse datasets. Track score trends over time. Run nightly evals on latest model versions to detect drift without blocking merges. Compare against golden traces for behavioral regression detection.

### Memory/State

12. **Rolling summary memory** — Persist conversation context across turns and across restarts. Keep the last N turns verbatim, store a running summary for older turns, and maintain a "facts that must persist" store (e.g., user's base currency preference, previously discussed holdings). MVP storage: Redis with 24h TTL. Final: Redis cache + Postgres backing via Prisma for persistent history and audit trail.
