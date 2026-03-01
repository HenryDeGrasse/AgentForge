import {
  computeAlpha,
  computeAnnualizedReturn,
  computeAnnualizedVolatility,
  computeBeta,
  computeCVaR,
  computeDailyReturns,
  computeMaxDrawdown,
  computeSharpeRatio,
  computeSortinoRatio,
  computeVaR
} from './statistical-helpers';

describe('statistical-helpers', () => {
  // ─── computeDailyReturns ───────────────────────────────────────────

  describe('computeDailyReturns', () => {
    it('computes daily returns from a net-worth series', () => {
      const series = [100, 110, 105, 115];
      const returns = computeDailyReturns(series);

      expect(returns).toHaveLength(3);
      expect(returns[0]).toBeCloseTo(0.1, 10); // 110/100 - 1
      expect(returns[1]).toBeCloseTo(-0.04545, 4); // 105/110 - 1
      expect(returns[2]).toBeCloseTo(0.09524, 4); // 115/105 - 1
    });

    it('returns empty array for series with fewer than 2 points', () => {
      expect(computeDailyReturns([100])).toEqual([]);
      expect(computeDailyReturns([])).toEqual([]);
    });

    it('skips zero values to avoid division by zero', () => {
      const series = [100, 0, 110];
      const returns = computeDailyReturns(series);

      // Should skip the 0 → return only the valid transition
      expect(returns.every((r) => Number.isFinite(r))).toBe(true);
    });
  });

  // ─── computeSharpeRatio ────────────────────────────────────────────

  describe('computeSharpeRatio', () => {
    it('computes annualized Sharpe ratio for a known return series', () => {
      // Alternating 1% and -0.5% daily returns (mean = 0.25%, positive bias)
      const dailyReturns = Array(252)
        .fill(0)
        .map((_, i) => (i % 2 === 0 ? 0.01 : -0.005));

      const riskFreeDaily = 0;
      const sharpe = computeSharpeRatio(dailyReturns, riskFreeDaily);

      // mean = 0.0025, stddev ≈ 0.0075 → annualized Sharpe ≈ 5.29
      expect(sharpe).toBeGreaterThan(4);
      expect(sharpe).toBeLessThan(7);
    });

    it('returns positive Sharpe for positive risk-adjusted returns', () => {
      // Alternating returns with positive bias
      const dailyReturns = Array(252)
        .fill(0)
        .map((_, i) => (i % 2 === 0 ? 0.005 : -0.002));

      const riskFreeDaily = 0.04 / 252;
      const sharpe = computeSharpeRatio(dailyReturns, riskFreeDaily);

      expect(sharpe).toBeGreaterThan(0);
    });

    it('returns negative Sharpe for net negative returns', () => {
      const dailyReturns = Array(252)
        .fill(0)
        .map((_, i) => (i % 2 === 0 ? -0.005 : 0.002));

      const riskFreeDaily = 0.04 / 252;
      const sharpe = computeSharpeRatio(dailyReturns, riskFreeDaily);

      expect(sharpe).toBeLessThan(0);
    });

    it('returns 0 for empty returns', () => {
      expect(computeSharpeRatio([], 0)).toBe(0);
    });
  });

  // ─── computeSortinoRatio ───────────────────────────────────────────

  describe('computeSortinoRatio', () => {
    it('only considers downside deviation', () => {
      // All positive returns → downside dev = 0 → Sortino = 0 (degenerate)
      const dailyReturns = Array(100).fill(0.002);
      const sortino = computeSortinoRatio(dailyReturns, 0);

      expect(sortino).toBe(0);
    });

    it('is higher than Sharpe when upside volatility dominates', () => {
      // Big upside, small downside
      const dailyReturns = Array(252)
        .fill(0)
        .map((_, i) => (i % 5 === 0 ? -0.001 : 0.005));

      const riskFreeDaily = 0.04 / 252;
      const sharpe = computeSharpeRatio(dailyReturns, riskFreeDaily);
      const sortino = computeSortinoRatio(dailyReturns, riskFreeDaily);

      expect(sortino).toBeGreaterThan(sharpe);
    });

    it('returns 0 for empty returns', () => {
      expect(computeSortinoRatio([], 0)).toBe(0);
    });
  });

  // ─── computeMaxDrawdown ────────────────────────────────────────────

  describe('computeMaxDrawdown', () => {
    it('computes max drawdown from a peak-trough-recovery series', () => {
      const series = [100, 120, 90, 110, 130]; // peak 120 → trough 90 = -25%
      const { maxDrawdownPct, currentDrawdownPct } = computeMaxDrawdown(series);

      expect(maxDrawdownPct).toBeCloseTo(0.25, 5); // 30/120
      expect(currentDrawdownPct).toBeCloseTo(0, 5); // recovered above peak
    });

    it('reports current drawdown when portfolio is below peak', () => {
      const series = [100, 120, 108]; // peak 120, current 108 = -10%
      const { maxDrawdownPct, currentDrawdownPct } = computeMaxDrawdown(series);

      expect(maxDrawdownPct).toBeCloseTo(0.1, 5);
      expect(currentDrawdownPct).toBeCloseTo(0.1, 5);
    });

    it('returns zeros for monotonically increasing series', () => {
      const series = [100, 110, 120, 130];
      const { maxDrawdownPct, currentDrawdownPct } = computeMaxDrawdown(series);

      expect(maxDrawdownPct).toBe(0);
      expect(currentDrawdownPct).toBe(0);
    });

    it('returns zeros for empty or single-value series', () => {
      expect(computeMaxDrawdown([]).maxDrawdownPct).toBe(0);
      expect(computeMaxDrawdown([100]).maxDrawdownPct).toBe(0);
    });
  });

  // ─── computeAnnualizedVolatility ───────────────────────────────────

  describe('computeAnnualizedVolatility', () => {
    it('annualizes daily volatility using √252', () => {
      // Zero-mean series so stddev = 0.01 exactly
      const dailyReturns = [0.01, -0.01, 0.01, -0.01];
      const vol = computeAnnualizedVolatility(dailyReturns);

      // stddev of [0.01, -0.01, 0.01, -0.01] (mean=0) with N-1 denominator
      // variance = 4*(0.01^2)/3 = 0.000133... → stddev ≈ 0.01155
      // annualized = 0.01155 * √252 ≈ 0.1833
      expect(vol).toBeGreaterThan(0.15);
      expect(vol).toBeLessThan(0.2);
    });

    it('returns 0 for empty or single-value returns', () => {
      expect(computeAnnualizedVolatility([])).toBe(0);
      expect(computeAnnualizedVolatility([0.01])).toBe(0);
    });
  });

  // ─── computeVaR ────────────────────────────────────────────────────

  describe('computeVaR', () => {
    it('computes 95% VaR as the 5th percentile of daily returns', () => {
      // 100 sorted returns: -0.99, -0.98, ..., 0.00
      const dailyReturns = Array(100)
        .fill(0)
        .map((_, i) => (i - 99) / 100); // -0.99 to 0.00

      const var95 = computeVaR(dailyReturns, 0.95);

      // 5th percentile = index 4 → value -0.95
      expect(var95).toBeCloseTo(0.95, 1);
    });

    it('returns 0 for empty returns', () => {
      expect(computeVaR([], 0.95)).toBe(0);
    });
  });

  // ─── computeCVaR ───────────────────────────────────────────────────

  describe('computeCVaR', () => {
    it('computes CVaR as the mean of returns below the VaR threshold', () => {
      // 100 sorted returns: -0.99, -0.98, ..., 0.00
      const dailyReturns = Array(100)
        .fill(0)
        .map((_, i) => (i - 99) / 100);

      const cvar95 = computeCVaR(dailyReturns, 0.95);

      // Tail = 5 lowest returns: -0.99, -0.98, -0.97, -0.96, -0.95
      // Mean = -0.97
      expect(cvar95).toBeCloseTo(0.97, 1);
    });

    it('returns 0 for empty returns', () => {
      expect(computeCVaR([], 0.95)).toBe(0);
    });
  });

  // ─── computeBeta ───────────────────────────────────────────────────

  describe('computeBeta', () => {
    it('returns 1.0 when portfolio tracks benchmark perfectly', () => {
      const returns = [0.01, -0.02, 0.015, -0.005, 0.01];
      const beta = computeBeta(returns, returns);

      expect(beta).toBeCloseTo(1.0, 5);
    });

    it('returns ~2.0 when portfolio moves at 2x benchmark', () => {
      const benchmarkReturns = [0.01, -0.02, 0.015, -0.005, 0.01];
      const portfolioReturns = benchmarkReturns.map((r) => r * 2);
      const beta = computeBeta(portfolioReturns, benchmarkReturns);

      expect(beta).toBeCloseTo(2.0, 5);
    });

    it('returns 0 when arrays are mismatched length', () => {
      expect(computeBeta([0.01], [0.01, 0.02])).toBe(0);
    });

    it('returns 0 for empty arrays', () => {
      expect(computeBeta([], [])).toBe(0);
    });
  });

  // ─── computeAlpha ──────────────────────────────────────────────────

  describe('computeAlpha', () => {
    it('computes Jensen alpha correctly', () => {
      // portfolioReturn=0.15, benchmarkReturn=0.10, beta=1.2, riskFree=0.04
      // alpha = 0.15 - (0.04 + 1.2 * (0.10 - 0.04)) = 0.15 - 0.112 = 0.038
      const alpha = computeAlpha(0.15, 0.1, 1.2, 0.04);

      expect(alpha).toBeCloseTo(0.038, 5);
    });
  });

  // ─── computeAnnualizedReturn ───────────────────────────────────────

  describe('computeAnnualizedReturn', () => {
    it('annualizes a return over a known number of trading days', () => {
      // 10% return over 126 trading days (half a year) → ~21% annualized
      const annualized = computeAnnualizedReturn(0.1, 126);

      expect(annualized).toBeCloseTo(0.21, 1);
    });

    it('returns 0 for zero trading days', () => {
      expect(computeAnnualizedReturn(0.1, 0)).toBe(0);
    });
  });
});
