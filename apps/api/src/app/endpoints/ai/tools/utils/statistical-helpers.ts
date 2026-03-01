/**
 * Pure statistical helper functions for portfolio risk metrics.
 *
 * All functions are deterministic and operate on plain number arrays.
 * Annualization assumes 252 trading days per year.
 */

const TRADING_DAYS_PER_YEAR = 252;

/**
 * Convert a net-worth time series into daily simple returns.
 * Skips zero values to avoid division by zero.
 */
export function computeDailyReturns(netWorthSeries: number[]): number[] {
  const returns: number[] = [];

  for (let i = 1; i < netWorthSeries.length; i++) {
    const prev = netWorthSeries[i - 1];

    if (prev === 0 || !Number.isFinite(prev)) {
      continue;
    }

    const curr = netWorthSeries[i];

    if (!Number.isFinite(curr)) {
      continue;
    }

    returns.push(curr / prev - 1);
  }

  return returns;
}

/**
 * Annualized Sharpe ratio = (mean excess return / stddev) × √252.
 * Returns 0 if volatility is zero or data is insufficient.
 */
export function computeSharpeRatio(
  dailyReturns: number[],
  riskFreeDaily: number
): number {
  if (dailyReturns.length < 2) {
    return 0;
  }

  const excessReturns = dailyReturns.map((r) => r - riskFreeDaily);
  const mean = arrayMean(excessReturns);
  const stddev = arrayStddev(excessReturns);

  if (stddev === 0) {
    return 0;
  }

  return (mean / stddev) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * Annualized Sortino ratio = (mean excess return / downside dev) × √252.
 * Only negative excess returns contribute to the denominator.
 * Returns 0 if downside deviation is zero or data is insufficient.
 */
export function computeSortinoRatio(
  dailyReturns: number[],
  riskFreeDaily: number
): number {
  if (dailyReturns.length < 2) {
    return 0;
  }

  const excessReturns = dailyReturns.map((r) => r - riskFreeDaily);
  const mean = arrayMean(excessReturns);
  const downsideReturns = excessReturns.filter((r) => r < 0);

  if (downsideReturns.length === 0) {
    return 0;
  }

  const downsideDev = Math.sqrt(
    downsideReturns.reduce((sum, r) => sum + r * r, 0) / downsideReturns.length
  );

  if (downsideDev === 0) {
    return 0;
  }

  return (mean / downsideDev) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * Max drawdown and current drawdown from a net-worth series.
 * Returns values as positive fractions (e.g. 0.25 = 25% drawdown).
 */
export function computeMaxDrawdown(netWorthSeries: number[]): {
  currentDrawdownPct: number;
  maxDrawdownPct: number;
} {
  if (netWorthSeries.length < 2) {
    return { currentDrawdownPct: 0, maxDrawdownPct: 0 };
  }

  let peak = netWorthSeries[0];
  let maxDrawdown = 0;

  for (const value of netWorthSeries) {
    if (value > peak) {
      peak = value;
    }

    if (peak > 0) {
      const drawdown = (peak - value) / peak;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  const lastValue = netWorthSeries[netWorthSeries.length - 1];
  const currentDrawdown = peak > 0 ? Math.max(0, (peak - lastValue) / peak) : 0;

  return {
    currentDrawdownPct: currentDrawdown,
    maxDrawdownPct: maxDrawdown
  };
}

/**
 * Annualized volatility = daily stddev × √252.
 */
export function computeAnnualizedVolatility(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) {
    return 0;
  }

  return arrayStddev(dailyReturns) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * Historical Value at Risk at the given confidence level.
 * Returns a positive number representing the loss threshold.
 * E.g. VaR(95%) = 0.02 means 95% of days have losses smaller than 2%.
 */
export function computeVaR(
  dailyReturns: number[],
  confidenceLevel: number
): number {
  if (dailyReturns.length === 0) {
    return 0;
  }

  const sorted = [...dailyReturns].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * (1 - confidenceLevel));
  const varReturn = sorted[index];

  return Math.abs(varReturn);
}

/**
 * Conditional Value at Risk (Expected Shortfall) at the given confidence level.
 * Mean of all returns in the tail beyond VaR.
 * Returns a positive number.
 */
export function computeCVaR(
  dailyReturns: number[],
  confidenceLevel: number
): number {
  if (dailyReturns.length === 0) {
    return 0;
  }

  const sorted = [...dailyReturns].sort((a, b) => a - b);
  const cutoff = Math.max(1, Math.floor(sorted.length * (1 - confidenceLevel)));
  const tail = sorted.slice(0, cutoff);
  const meanTail = arrayMean(tail);

  return Math.abs(meanTail);
}

/**
 * Portfolio beta relative to a benchmark.
 * beta = cov(portfolio, benchmark) / var(benchmark).
 */
export function computeBeta(
  portfolioReturns: number[],
  benchmarkReturns: number[]
): number {
  if (
    portfolioReturns.length < 2 ||
    portfolioReturns.length !== benchmarkReturns.length
  ) {
    return 0;
  }

  const meanP = arrayMean(portfolioReturns);
  const meanB = arrayMean(benchmarkReturns);

  let covariance = 0;
  let benchmarkVariance = 0;

  for (let i = 0; i < portfolioReturns.length; i++) {
    const dp = portfolioReturns[i] - meanP;
    const db = benchmarkReturns[i] - meanB;

    covariance += dp * db;
    benchmarkVariance += db * db;
  }

  if (benchmarkVariance === 0) {
    return 0;
  }

  return covariance / benchmarkVariance;
}

/**
 * Jensen's alpha = portfolioReturn - (riskFree + beta × (benchmarkReturn - riskFree)).
 */
export function computeAlpha(
  portfolioReturn: number,
  benchmarkReturn: number,
  beta: number,
  riskFreeRate: number
): number {
  return (
    portfolioReturn - (riskFreeRate + beta * (benchmarkReturn - riskFreeRate))
  );
}

/**
 * Annualize a total return over a given number of trading days.
 * Uses CAGR formula: (1 + totalReturn)^(252/days) - 1.
 */
export function computeAnnualizedReturn(
  totalReturn: number,
  tradingDays: number
): number {
  if (tradingDays <= 0) {
    return 0;
  }

  return Math.pow(1 + totalReturn, TRADING_DAYS_PER_YEAR / tradingDays) - 1;
}

// ─── Internal helpers ────────────────────────────────────────────────────

function arrayMean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Sample standard deviation (N-1 denominator). */
function arrayStddev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const mean = arrayMean(values);
  const sumSquaredDiffs = values.reduce(
    (sum, v) => sum + (v - mean) * (v - mean),
    0
  );

  return Math.sqrt(sumSquaredDiffs / (values.length - 1));
}
