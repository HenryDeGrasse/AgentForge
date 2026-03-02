# Epic 6: Model Upgrade, Statistical Tools, and Capability Boundaries

**Priority**: P0 — Addresses financial expert use cases and rendering bugs
**Branch**: `feat/eval-improvements`

---

## Problem Statement

1. **Model**: Using `gpt-4.1-mini` — lacks reasoning depth for complex financial
   synthesis, may generate rendering artifacts like "+30 lines" in responses
2. **Missing statistics**: No tool computes Sharpe ratio, Sortino, beta, alpha,
   max drawdown, VaR, or CVaR. Expert users asking for these get empty results.
3. **No capability boundaries**: Agent doesn't communicate what it can/can't
   compute, giving vague failures instead of clear boundaries.
4. **Portfolio summarizer**: Doesn't include dollar values, forcing the LLM to
   parse raw JSON and produce garbled output.

---

## 6A: Model Upgrade

### Current State

```typescript
// openai-client.service.ts:21
private readonly model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
```

### Change

Update the default fallback model from `gpt-4.1-mini` to `gpt-4.1` (full).
The env var override (`OPENAI_MODEL`) is preserved so deployments can choose.

Also update the default cost estimate to reflect gpt-4.1 pricing.

### Files

| File                           | Change                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| `llm/openai-client.service.ts` | Default model `gpt-4.1-mini` → `gpt-4.1`, cost per 1k tokens |

### Acceptance Criteria

- [ ] Default model is `gpt-4.1`
- [ ] `OPENAI_MODEL` env var still overrides
- [ ] Cost estimate reflects new model pricing
- [ ] All tests pass

---

## 6B: Portfolio Summary Value Fix ("+30 lines" Bug)

### Root Cause

The `summarizePortfolioSummary` function only includes symbol + allocation
percentage. Dollar values are absent from the summary. The LLM must dig
through up to 16KB of raw JSON to find `valueInBaseCurrency`, and often
garbles the values or the model collapses/folds the long content.

### Fix

Include dollar values directly in the summary so the LLM never needs to
parse raw JSON for basic portfolio data:

```
[SUMMARY] Portfolio: 10 holdings in USD. Total: $54,362.
Top holdings:
  - VOO: 45.2% ($24,565) (ETF)
  - NVDA: 21.3% ($11,561) (EQUITY)
  - BND: 8.8% ($4,780) (FIXED_INCOME)
  ...all holdings listed
```

List ALL holdings (not just top 5) since there are typically ≤20, and the
LLM needs to reference any of them.

### Files

| File                                   | Change                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `tools/utils/tool-summarizers.ts`      | Rewrite `summarizePortfolioSummary` with dollar values and full listing |
| `tools/utils/tool-summarizers.spec.ts` | Update test expectations                                                |

### Acceptance Criteria

- [ ] Summary includes dollar values for every holding
- [ ] Total portfolio value in summary
- [ ] No raw JSON needed for basic portfolio questions
- [ ] Existing summarizer tests updated

---

## 6C: Statistical Risk Metrics (analyze_risk enhancement)

### Design

Add a new output section `statisticalMetrics` to the existing `analyze_risk`
tool. This uses Ghostfolio's `PortfolioService.getPerformance()` which returns
a `chart` array of daily `HistoricalDataItem` entries with `netWorth` and
`netPerformanceInPercentage`.

From the daily chart data we can compute:

| Metric                    | Formula                                                         | Notes                                  |
| ------------------------- | --------------------------------------------------------------- | -------------------------------------- |
| **Sharpe ratio**          | (mean daily return - risk-free) / stddev × √252                 | Annualized; risk-free default 0.04/252 |
| **Sortino ratio**         | (mean daily return - risk-free) / downside dev × √252           | Only negative returns in denominator   |
| **Max drawdown**          | Max peak-to-trough decline                                      | From netWorth series                   |
| **Current drawdown**      | Current decline from peak                                       | From netWorth series                   |
| **Annualized volatility** | stddev(daily returns) × √252                                    | Standard annualization                 |
| **VaR (95%)**             | 5th percentile of daily returns × portfolio value               | Historical VaR                         |
| **CVaR (95%)**            | Mean of returns below VaR threshold × portfolio value           | Conditional VaR                        |
| **Beta**                  | cov(portfolio, benchmark) / var(benchmark)                      | Requires benchmark data                |
| **Alpha**                 | portfolio return - (risk-free + beta × (benchmark - risk-free)) | Jensen's alpha                         |

### Implementation

```typescript
interface StatisticalMetrics {
  annualizedReturnPct: number;
  annualizedVolatilityPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  varPct95: number; // 1-day 95% VaR as percentage
  cvarPct95: number; // 1-day 95% CVaR as percentage
  beta?: number; // undefined if no benchmark data
  alpha?: number; // undefined if no benchmark data
  dataPointCount: number;
  periodStartDate: string;
  periodEndDate: string;
}
```

The `analyze_risk` tool will:

1. Call `portfolioService.getPerformance({ dateRange: '1y' })` to get chart data
2. Extract daily `netWorth` values → compute daily returns
3. Compute all statistical metrics from the return series
4. Optionally fetch benchmark chart data for beta/alpha (if benchmarks configured)

### New Input Parameter

```typescript
// Added to AnalyzeRiskInput
dateRange?: DateRange;  // Default '1y' — controls period for statistical metrics
riskFreeRatePct?: number; // Annual risk-free rate, default 0.04 (4%)
```

### Files

| File                                   | Change                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `tools/analyze-risk.tool.ts`           | Add statistical metrics computation                                        |
| `tools/schemas/analyze-risk.schema.ts` | Add `statisticalMetrics` to output, `dateRange`/`riskFreeRatePct` to input |
| `tools/analyze-risk.tool.spec.ts`      | 8-10 new tests for statistical metrics                                     |
| `tools/utils/tool-summarizers.ts`      | Update `summarizeAnalyzeRisk` for new metrics                              |

### Statistical Computation Helpers

Extract pure functions into `tools/utils/statistical-helpers.ts`:

```typescript
export function computeDailyReturns(netWorthSeries: number[]): number[];
export function computeSharpeRatio(
  dailyReturns: number[],
  riskFreeDaily: number
): number;
export function computeSortinoRatio(
  dailyReturns: number[],
  riskFreeDaily: number
): number;
export function computeMaxDrawdown(netWorthSeries: number[]): {
  maxDrawdownPct: number;
  currentDrawdownPct: number;
};
export function computeAnnualizedVolatility(dailyReturns: number[]): number;
export function computeVaR(
  dailyReturns: number[],
  confidenceLevel: number
): number;
export function computeCVaR(
  dailyReturns: number[],
  confidenceLevel: number
): number;
export function computeBeta(
  portfolioReturns: number[],
  benchmarkReturns: number[]
): number;
export function computeAlpha(
  portfolioReturn: number,
  benchmarkReturn: number,
  beta: number,
  riskFreeRate: number
): number;
```

These are pure mathematical functions with thorough unit tests.

### Test Cases

1. Sharpe ratio with known return series (verify against hand calculation)
2. Sortino ratio only counts downside deviation
3. Max drawdown from a peak-trough-recovery series
4. Current drawdown when portfolio is below peak
5. VaR at 95% — verify 5th percentile calculation
6. CVaR at 95% — mean of tail losses
7. Beta against benchmark returns
8. Alpha computation
9. Edge case: insufficient data points (< 5 days) → warning, no metrics
10. Edge case: flat returns (zero volatility) → Sharpe = 0

### Acceptance Criteria

- [ ] Statistical metrics computed from real Ghostfolio performance data
- [ ] Pure helper functions with full test coverage
- [ ] Graceful degradation with insufficient data
- [ ] Beta/alpha optional (only when benchmark data available)
- [ ] Summarizer surfaces key metrics

---

## 6D: Capability Boundaries in System Prompt (Path C)

### Addition to System Prompt

```
## Quantitative capabilities
You have statistical analysis capabilities through the analyze_risk tool,
which computes: Sharpe ratio, Sortino ratio, annualized volatility,
max drawdown, current drawdown, VaR (95%), CVaR (95%), and beta/alpha
(when benchmark data is available).

When asked for metrics you can compute, call analyze_risk with the
appropriate dateRange. Present the results clearly with context
(e.g. "A Sharpe ratio of 1.2 is generally considered good").

Metrics you CANNOT compute:
- Factor exposures beyond basic asset class/sector
- Options Greeks
- Credit risk scores
- Proprietary risk models
- Forward-looking predictions or forecasts

When asked for metrics you cannot compute, say specifically which metric
is unavailable rather than giving a vague "I can't do that" response.
```

### Files

| File                       | Change                                |
| -------------------------- | ------------------------------------- |
| `agent/agent.constants.ts` | Add quantitative capabilities section |

---

## Implementation Order

```
Phase 1: Foundation (no dependencies)
  1. Create statistical-helpers.ts with pure math functions + tests (TDD)
  2. Fix portfolio summarizer to include dollar values
  3. Upgrade default model to gpt-4.1

Phase 2: Integration
  4. Add statisticalMetrics to analyze_risk tool + schema
  5. Update analyze_risk summarizer
  6. Add capability boundaries to system prompt (6D)

Phase 3: Verify
  7. Run full test suite
  8. Commit
```

## Dependencies

- `PortfolioService.getPerformance()` — already exists in Ghostfolio
- `BenchmarkService` — already used by performance_compare for beta/alpha
- `MarketDataService.getRange()` — already used for benchmark period returns
