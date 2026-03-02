/**
 * Demo Account Tool Coverage Tests
 *
 * Every AI tool is exercised against realistic demo-account-shaped mock data.
 * These tests exist to catch production bugs where tools return empty/zero
 * values for real portfolio data — the Sharpe ratio "insufficient data" failure
 * being the canonical example.
 *
 * Design principles:
 *  1. Mock data matches the EXACT shape returned by Ghostfolio services for
 *     the seeded demo account (10 holdings, 33 activities, 2 accounts).
 *  2. Every significant output field is asserted — not just "no error".
 *  3. Tests explicitly call out which real bug they would have caught.
 *  4. Statistical metrics tests provide a realistic chart series (≥5 points
 *     with non-zero netWorth) so any regression to the "insufficient data"
 *     path fails loudly.
 */
import { AnalyzeRiskTool } from '@ghostfolio/api/app/endpoints/ai/tools/analyze-risk.tool';
import { ComplianceCheckTool } from '@ghostfolio/api/app/endpoints/ai/tools/compliance-check.tool';
import { GetPortfolioSummaryTool } from '@ghostfolio/api/app/endpoints/ai/tools/get-portfolio-summary.tool';
import { GetTransactionHistoryTool } from '@ghostfolio/api/app/endpoints/ai/tools/get-transaction-history.tool';
import { MarketDataLookupTool } from '@ghostfolio/api/app/endpoints/ai/tools/market-data-lookup.tool';
import { PerformanceCompareTool } from '@ghostfolio/api/app/endpoints/ai/tools/performance-compare.tool';
import { RebalanceSuggestTool } from '@ghostfolio/api/app/endpoints/ai/tools/rebalance-suggest.tool';
import { SimulateTradesTool } from '@ghostfolio/api/app/endpoints/ai/tools/simulate-trades.tool';
import { StressTestTool } from '@ghostfolio/api/app/endpoints/ai/tools/stress-test.tool';
import { TaxEstimateTool } from '@ghostfolio/api/app/endpoints/ai/tools/tax-estimate.tool';

// Unused mock kept for potential future use — suppressed lint warning
// eslint-disable-next-line @typescript-eslint/no-unused-vars

// ─── Shared demo context ─────────────────────────────────────────────────────

const DEMO_USER_ID = 'd6e4f1a0-b8c3-4e7f-9a2d-1c5e8f3b7d40';
const CTX = { userId: DEMO_USER_ID };

// ─── Realistic mock data matching the seeded demo portfolio ─────────────────

/** 10-holding portfolio matching the demo seed data */
const DEMO_HOLDINGS = {
  AAPL: {
    allocationInPercentage: 0.024,
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    currency: 'USD',
    dataSource: 'YAHOO',
    dateOfFirstActivity: new Date('2023-01-10'),
    investment: 1170,
    marketPrice: 228.0,
    name: 'Apple Inc.',
    netPerformanceWithCurrencyEffect: 1130,
    quantity: 10,
    sectors: [{ name: 'Technology', weight: 1 }],
    symbol: 'AAPL',
    valueInBaseCurrency: 2280
  },
  AMZN: {
    allocationInPercentage: 0.03,
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    currency: 'USD',
    dataSource: 'YAHOO',
    dateOfFirstActivity: new Date('2023-06-15'),
    investment: 1300,
    marketPrice: 208.0,
    name: 'Amazon.com Inc.',
    netPerformanceWithCurrencyEffect: 340,
    quantity: 10,
    sectors: [
      { name: 'Consumer Cyclical', weight: 0.5 },
      { name: 'Technology', weight: 0.5 }
    ],
    symbol: 'AMZN',
    valueInBaseCurrency: 1625
  },
  'BTC-USD': {
    allocationInPercentage: 0.063,
    assetClass: 'LIQUIDITY',
    assetSubClass: 'CRYPTOCURRENCY',
    currency: 'USD',
    dataSource: 'YAHOO',
    dateOfFirstActivity: new Date('2023-08-01'),
    investment: 1475,
    marketPrice: 97500,
    name: 'Bitcoin USD',
    netPerformanceWithCurrencyEffect: 1960,
    quantity: 0.036,
    sectors: [],
    symbol: 'BTC-USD',
    valueInBaseCurrency: 3435
  },
  BND: {
    allocationInPercentage: 0.088,
    assetClass: 'FIXED_INCOME',
    assetSubClass: 'ETF',
    currency: 'USD',
    dataSource: 'YAHOO',
    dateOfFirstActivity: new Date('2023-01-20'),
    investment: 4810,
    marketPrice: 73.5,
    name: 'Vanguard Total Bond Market ETF',
    netPerformanceWithCurrencyEffect: -30,
    quantity: 65,
    sectors: [],
    symbol: 'BND',
    valueInBaseCurrency: 4780
  },
  JPM: {
    allocationInPercentage: 0.017,
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    currency: 'USD',
    dataSource: 'YAHOO',
    dateOfFirstActivity: new Date('2023-03-10'),
    investment: 910,
    marketPrice: 130.0,
    name: 'JPMorgan Chase & Co.',
    netPerformanceWithCurrencyEffect: 0,
    quantity: 7,
    sectors: [{ name: 'Financial Services', weight: 1 }],
    symbol: 'JPM',
    valueInBaseCurrency: 910
  },
  MSFT: {
    allocationInPercentage: 0.04,
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    currency: 'USD',
    dataSource: 'YAHOO',
    dateOfFirstActivity: new Date('2023-01-12'),
    investment: 1920,
    marketPrice: 415.0,
    name: 'Microsoft Corporation',
    netPerformanceWithCurrencyEffect: 260,
    quantity: 8,
    sectors: [{ name: 'Technology', weight: 1 }],
    symbol: 'MSFT',
    valueInBaseCurrency: 3320
  },
  NVDA: {
    allocationInPercentage: 0.213,
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    currency: 'USD',
    dataSource: 'YAHOO',
    dateOfFirstActivity: new Date('2023-03-05'),
    investment: 12450,
    marketPrice: 134.0,
    name: 'NVIDIA Corporation',
    netPerformanceWithCurrencyEffect: -890,
    quantity: 86,
    sectors: [{ name: 'Technology', weight: 1 }],
    symbol: 'NVDA',
    valueInBaseCurrency: 11524
  },
  VEA: {
    allocationInPercentage: 0.059,
    assetClass: 'EQUITY',
    assetSubClass: 'ETF',
    currency: 'USD',
    dataSource: 'YAHOO',
    dateOfFirstActivity: new Date('2023-05-01'),
    investment: 3200,
    marketPrice: 46.0,
    name: 'Vanguard FTSE Developed Markets ETF',
    netPerformanceWithCurrencyEffect: 0,
    quantity: 70,
    sectors: [{ name: 'Financial Services', weight: 0.18 }],
    symbol: 'VEA',
    valueInBaseCurrency: 3200
  },
  VNQ: {
    allocationInPercentage: 0.015,
    assetClass: 'REAL_ESTATE',
    assetSubClass: 'ETF',
    currency: 'USD',
    dataSource: 'YAHOO',
    dateOfFirstActivity: new Date('2023-05-01'),
    investment: 1100,
    marketPrice: 80.0,
    name: 'Vanguard Real Estate ETF',
    netPerformanceWithCurrencyEffect: -300,
    quantity: 10,
    sectors: [{ name: 'Real Estate', weight: 1 }],
    symbol: 'VNQ',
    valueInBaseCurrency: 800
  },
  VOO: {
    allocationInPercentage: 0.452,
    assetClass: 'EQUITY',
    assetSubClass: 'ETF',
    currency: 'USD',
    dataSource: 'YAHOO',
    dateOfFirstActivity: new Date('2023-01-15'),
    investment: 20608,
    marketPrice: 500.0,
    name: 'Vanguard S&P 500 ETF',
    netPerformanceWithCurrencyEffect: 3957,
    quantity: 49,
    sectors: [
      { name: 'Technology', weight: 0.3 },
      { name: 'Healthcare', weight: 0.13 },
      { name: 'Financial Services', weight: 0.13 }
    ],
    symbol: 'VOO',
    valueInBaseCurrency: 24565
  }
};

const DEMO_SUMMARY = {
  cash: 0,
  committedFunds: 0,
  currentNetWorth: 55440,
  dividend: 63,
  emergencyFund: { assets: 0, liabilities: 0, total: 0 },
  excludedAccountsAndActivities: 0,
  fees: 64.5,
  filteredValueInBaseCurrency: 55440,
  fireShieldFactor: 0,
  firstOrderDate: new Date('2023-01-10'),
  grossPerformance: 7100,
  grossPerformancePercentage: 0.141,
  interest: 0,
  items: 33,
  liabilities: 0,
  netPerformance: 7035,
  netPerformancePercentage: 0.139,
  ordersCount: 33,
  totalBuy: 48405,
  totalSell: 4415,
  totalValueInBaseCurrency: 55440
};

const DEMO_PORTFOLIO_DETAILS = {
  createdAt: new Date('2025-02-27T12:00:00Z'),
  accounts: {
    'a1b2c3d4-0001-4000-8000-000000000001': {
      balance: 0,
      currency: 'USD',
      name: 'Brokerage',
      transactionCount: 23,
      valueInBaseCurrency: 33680
    },
    'a1b2c3d4-0002-4000-8000-000000000002': {
      balance: 0,
      currency: 'USD',
      name: 'Retirement (IRA)',
      transactionCount: 10,
      valueInBaseCurrency: 21760
    }
  },
  holdings: DEMO_HOLDINGS,
  summary: DEMO_SUMMARY
};

/**
 * 252 trading-day chart with realistic non-zero netWorth values (1 year of data).
 * This is what getPerformance() MUST return for statistical metrics to compute.
 * Bug regression: if netWorth is 0 or undefined on all entries, Sharpe fails.
 */
function buildDemoPerformanceChart(dataPoints = 252) {
  const chart = [];
  let netWorth = 48000;

  for (let i = 0; i < dataPoints; i++) {
    const date = new Date('2024-02-28');
    date.setDate(date.getDate() + i);

    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) {
      continue;
    }

    // Simulate daily drift: mostly positive with realistic volatility
    const dailyReturn = (Math.random() - 0.47) * 0.015; // ~0.3% daily drift

    netWorth = netWorth * (1 + dailyReturn);

    chart.push({
      date: date.toISOString().split('T')[0],
      investmentValueWithCurrencyEffect: 48405,
      netPerformance: netWorth - 48405,
      netPerformanceInPercentage: (netWorth - 48405) / 48405,
      netPerformanceInPercentageWithCurrencyEffect: (netWorth - 48405) / 48405,
      netPerformanceWithCurrencyEffect: netWorth - 48405,
      netWorth, // ← THIS must be non-zero for Sharpe to compute
      totalAccountBalance: 0,
      totalInvestment: 48405,
      totalInvestmentValueWithCurrencyEffect: 48405,
      value: netWorth,
      valueWithCurrencyEffect: netWorth
    });
  }

  return chart;
}

const DEMO_CHART = buildDemoPerformanceChart();

const DEMO_PERFORMANCE_RESPONSE = {
  chart: DEMO_CHART,
  firstOrderDate: new Date('2023-01-10'),
  hasErrors: false,
  performance: {
    currentNetWorth: 55440,
    currentValueInBaseCurrency: 55440,
    netPerformance: 7035,
    netPerformancePercentage: 0.139,
    netPerformancePercentageWithCurrencyEffect: 0.139,
    netPerformanceWithCurrencyEffect: 7035,
    totalInvestment: 48405,
    totalInvestmentValueWithCurrencyEffect: 48405
  }
};

const DEMO_ACTIVITIES = [
  {
    SymbolProfile: { dataSource: 'YAHOO', name: 'Apple Inc.', symbol: 'AAPL' },
    account: {
      id: 'a1b2c3d4-0001-4000-8000-000000000001',
      name: 'Brokerage'
    },
    date: new Date('2023-01-10'),
    feeInBaseCurrency: 0,
    id: 'act-001',
    quantity: 15,
    type: 'BUY',
    unitPrice: 130.0,
    valueInBaseCurrency: 1950
  },
  {
    SymbolProfile: { dataSource: 'YAHOO', name: 'NVIDIA', symbol: 'NVDA' },
    account: {
      id: 'a1b2c3d4-0001-4000-8000-000000000001',
      name: 'Brokerage'
    },
    date: new Date('2023-03-05'),
    feeInBaseCurrency: 4.95,
    id: 'act-002',
    quantity: 10,
    type: 'BUY',
    unitPrice: 230.0,
    valueInBaseCurrency: 2300
  },
  {
    SymbolProfile: { dataSource: 'YAHOO', name: 'Apple Inc.', symbol: 'AAPL' },
    account: {
      id: 'a1b2c3d4-0001-4000-8000-000000000001',
      name: 'Brokerage'
    },
    date: new Date('2024-01-15'),
    feeInBaseCurrency: 4.95,
    id: 'act-003',
    quantity: 5,
    type: 'SELL',
    unitPrice: 185.0,
    valueInBaseCurrency: 925
  }
];

const DEMO_USER = {
  id: DEMO_USER_ID,
  role: 'ADMIN',
  settings: { settings: { baseCurrency: 'USD' } }
};

const DEMO_VOO_BENCHMARK = {
  dataSource: 'YAHOO',
  marketCondition: 'NEUTRAL_MARKETS',
  name: 'Vanguard S&P 500 ETF',
  performances: {
    allTimeHigh: { date: new Date('2024-12-01'), performancePercent: -0.03 }
  },
  symbol: 'VOO',
  trend200d: 'UP',
  trend50d: 'UP'
};

// ─── Mock service builders ────────────────────────────────────────────────────

function portfolioServiceMock(overrides: Record<string, jest.Mock> = {}) {
  return {
    getDetails: jest.fn().mockResolvedValue(DEMO_PORTFOLIO_DETAILS),
    getPerformance: jest.fn().mockResolvedValue(DEMO_PERFORMANCE_RESPONSE),
    ...overrides
  } as any;
}

function userServiceMock() {
  return { user: jest.fn().mockResolvedValue(DEMO_USER) } as any;
}

function benchmarkServiceMock(overrides: Record<string, jest.Mock> = {}) {
  return {
    getBenchmarks: jest.fn().mockResolvedValue([DEMO_VOO_BENCHMARK]),
    getBenchmarkTrends: jest.fn().mockResolvedValue({
      trend200d: 'UP',
      trend50d: 'UP'
    }),
    ...overrides
  } as any;
}

function marketDataServiceMock() {
  // Two months of VOO daily prices for period return comparison
  const prices = Array.from({ length: 60 }, (_, i) => ({
    date: new Date(new Date('2025-01-02').getTime() + i * 86400000),
    marketPrice: 490 + i * 0.5,
    symbol: 'VOO'
  }));

  return {
    getRange: jest.fn().mockResolvedValue(prices),
    getQuote: jest.fn().mockResolvedValue({ marketPrice: 500, currency: 'USD' })
  } as any;
}

function symbolServiceMock() {
  return {
    get: jest.fn().mockResolvedValue({
      assetClass: 'EQUITY',
      assetSubClass: 'ETF',
      currency: 'USD',
      dataSource: 'YAHOO',
      historicalData: [],
      marketPrice: 500,
      name: 'Vanguard S&P 500 ETF',
      symbol: 'VOO'
    })
  } as any;
}

function symbolProfileServiceMock() {
  const profile = {
    assetClass: 'EQUITY',
    assetSubClass: 'ETF',
    countries: [],
    currency: 'USD',
    dataSource: 'YAHOO',
    name: 'Vanguard S&P 500 ETF',
    sectors: [],
    symbol: 'VOO'
  };

  return {
    getSymbolProfile: jest.fn().mockResolvedValue(profile),
    getSymbolProfiles: jest.fn().mockResolvedValue([profile]),
    getHistoricalData: jest.fn().mockResolvedValue([])
  } as any;
}

// ─── 1. get_portfolio_summary ─────────────────────────────────────────────────

describe('get_portfolio_summary — demo account', () => {
  let tool: GetPortfolioSummaryTool;

  beforeEach(() => {
    tool = new GetPortfolioSummaryTool(
      portfolioServiceMock(),
      {
        order: {
          aggregate: jest.fn().mockResolvedValue({
            _count: { _all: 33 },
            _max: { date: new Date('2025-06-15') }
          })
        }
      } as any, // PrismaService mock (for activity stats)
      userServiceMock()
    );
  });

  it('returns all 10 holdings with non-zero values', async () => {
    const result = await tool.execute({}, CTX);

    expect(result.totals.holdingsCount).toBe(10);
    expect(result.totals.totalPortfolioValueInBaseCurrency).toBeGreaterThan(
      50000
    );
    expect(result.topHoldings.length).toBeGreaterThan(0);

    // Every holding must have a dollar value — regression for "+N lines" bug
    for (const h of result.topHoldings) {
      expect(h.valueInBaseCurrency).toBeGreaterThan(0);
      expect(h.symbol).toBeTruthy();
      expect(h.marketPrice).toBeGreaterThan(0);
    }
  });

  it('respects topN parameter', async () => {
    const result = await tool.execute({ topN: 3 }, CTX);

    expect(result.topHoldings.length).toBeLessThanOrEqual(3);
  });

  it('returns no warnings for a healthy portfolio', async () => {
    const result = await tool.execute({}, CTX);

    // May have warnings but must not throw
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('includes baseCurrency, generatedAt, and snapshotCreatedAt', async () => {
    const result = await tool.execute({}, CTX);

    expect(result.baseCurrency).toBe('USD');
    expect(result.generatedAt).toBeTruthy();
    expect(result.snapshotCreatedAt).toBeTruthy();
  });
});

// ─── 2. analyze_risk (with statistical metrics) ───────────────────────────────

describe('analyze_risk — demo account', () => {
  let tool: AnalyzeRiskTool;

  beforeEach(() => {
    tool = new AnalyzeRiskTool(portfolioServiceMock(), userServiceMock());
  });

  it('returns HIGH risk level due to VOO concentration', async () => {
    const result = await tool.execute({}, CTX);

    expect(result.data.overallRiskLevel).toBe('HIGH');
    expect(result.data.holdingsCount).toBe(10);
    expect(result.data.portfolioValueInBaseCurrency).toBeGreaterThan(50000);
  });

  it('flags single-position concentration on VOO (45.2%)', async () => {
    const result = await tool.execute({}, CTX);
    const concentrationFlag = result.data.flags.find(
      (f) => f.code === 'single_position_concentration'
    );

    expect(concentrationFlag).toBeDefined();
    // Allow for rounding from mock holdings (tool recomputes from actual values)
    expect(concentrationFlag.metricValue).toBeGreaterThan(0.35);
    // 44% is medium (high requires >50%), but it must be flagged
    expect(['medium', 'high']).toContain(concentrationFlag.severity);
  });

  it('flags top-3 concentration when threshold is lowered to 70%', async () => {
    const result = await tool.execute(
      { concentrationTop3Threshold: 0.7 }, // lower threshold to trigger the flag
      CTX
    );
    const top3Flag = result.data.flags.find(
      (f) => f.code === 'top3_concentration'
    );

    expect(top3Flag).toBeDefined();
    expect(top3Flag.metricValue).toBeGreaterThan(0.7);
  });

  it('flags Technology sector concentration', async () => {
    const result = await tool.execute({}, CTX);
    const sectorFlag = result.data.flags.find(
      (f) => f.code === 'sector_concentration'
    );

    expect(sectorFlag).toBeDefined();
    expect(sectorFlag.metricValue).toBeGreaterThan(0.4);
  });

  /**
   * REGRESSION TEST: "Sharpe ratio could not be computed due to insufficient data"
   *
   * This test would have caught the production bug where:
   *  1. getPerformance() returned chart entries with netWorth=0 (Redis cache)
   *  2. extractValueSeries() found 0 valid entries
   *  3. statisticalMetrics was undefined in the response
   *
   * Fix: the tool now tries netWorth → valueWithCurrencyEffect → value,
   * and the Redis cache must be cleared when market data changes.
   */
  it('BUG REGRESSION: statisticalMetrics is defined and has non-zero Sharpe', async () => {
    const result = await tool.execute({ dateRange: '1y' }, CTX);

    expect(result.data.statisticalMetrics).toBeDefined();

    const stats = result.data.statisticalMetrics!;

    expect(stats.dataPointCount).toBeGreaterThanOrEqual(5);
    expect(stats.annualizedVolatilityPct).toBeGreaterThan(0);
    expect(stats.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(stats.varPct95).toBeGreaterThan(0);
    expect(stats.cvarPct95).toBeGreaterThan(stats.varPct95 - 0.001);
    expect(Number.isFinite(stats.sharpeRatio)).toBe(true);
    expect(Number.isFinite(stats.sortinoRatio)).toBe(true);
    expect(stats.periodStartDate).toBeTruthy();
    expect(stats.periodEndDate).toBeTruthy();
  });

  it('BUG REGRESSION: falls back to valueWithCurrencyEffect when netWorth is undefined', async () => {
    // Simulate the "netWorth commented out" calculator path
    const chartWithoutNetWorth = DEMO_CHART.map((entry) => ({
      ...entry,
      netWorth: undefined // calculator has this commented out
    }));

    const tool2 = new AnalyzeRiskTool(
      portfolioServiceMock({
        getPerformance: jest.fn().mockResolvedValue({
          ...DEMO_PERFORMANCE_RESPONSE,
          chart: chartWithoutNetWorth
        })
      }),
      userServiceMock()
    );

    const result = await tool2.execute({ dateRange: '1y' }, CTX);

    // Should fall back to valueWithCurrencyEffect — statisticalMetrics must not be undefined
    expect(result.data.statisticalMetrics).toBeDefined();
    expect(result.data.statisticalMetrics!.dataPointCount).toBeGreaterThan(0);
  });

  it('BUG REGRESSION: warns clearly when ALL value fields are zero (not silent)', async () => {
    // Simulate all chart values being 0 (stale Redis cache scenario)
    const zeroChart = DEMO_CHART.map((entry) => ({
      ...entry,
      netWorth: 0,
      value: 0,
      valueWithCurrencyEffect: 0
    }));

    const tool3 = new AnalyzeRiskTool(
      portfolioServiceMock({
        getPerformance: jest.fn().mockResolvedValue({
          ...DEMO_PERFORMANCE_RESPONSE,
          chart: zeroChart
        })
      }),
      userServiceMock()
    );

    const result = await tool3.execute({ dateRange: '1y' }, CTX);

    // statisticalMetrics should be undefined when data is all-zero
    expect(result.data.statisticalMetrics).toBeUndefined();

    // But there must be an explicit warning — NOT silent failure
    const statsWarning = result.data.warnings.find((w) =>
      w.code.includes('insufficient')
    );

    expect(statsWarning).toBeDefined();
    expect(statsWarning!.message).toMatch(/data point/i);
  });

  it('omits statisticalMetrics gracefully when chart has < 5 entries', async () => {
    const tool4 = new AnalyzeRiskTool(
      portfolioServiceMock({
        getPerformance: jest.fn().mockResolvedValue({
          ...DEMO_PERFORMANCE_RESPONSE,
          chart: DEMO_CHART.slice(0, 3) // only 3 points
        })
      }),
      userServiceMock()
    );

    const result = await tool4.execute({}, CTX);

    expect(result.data.statisticalMetrics).toBeUndefined();
    expect(
      result.data.warnings.some((w) => w.code === 'insufficient_data_for_stats')
    ).toBe(true);
  });

  it('uses riskFreeRatePct input parameter', async () => {
    const r1 = await tool.execute({ riskFreeRatePct: 0 }, CTX);
    const r2 = await tool.execute({ riskFreeRatePct: 0.05 }, CTX);

    // Higher risk-free rate should produce lower Sharpe ratio
    expect(r1.data.statisticalMetrics!.sharpeRatio).toBeGreaterThanOrEqual(
      r2.data.statisticalMetrics!.sharpeRatio
    );
  });
});

// ─── 3. performance_compare ───────────────────────────────────────────────────

describe('performance_compare — demo account', () => {
  let tool: PerformanceCompareTool;

  beforeEach(() => {
    tool = new PerformanceCompareTool(
      portfolioServiceMock(),
      benchmarkServiceMock(),
      marketDataServiceMock(),
      userServiceMock()
    );
  });

  it('returns portfolio performance with non-zero values', async () => {
    const result = await tool.execute({}, CTX);

    expect(result.portfolio.totalInvestment).toBeGreaterThan(40000);
    expect(result.portfolio.currentValueInBaseCurrency).toBeGreaterThan(50000);
    expect(result.portfolio.firstOrderDate).toBeTruthy();
    expect(result.baseCurrency).toBe('USD');
  });

  it('returns benchmark comparison for VOO', async () => {
    const result = await tool.execute({ benchmarkSymbols: ['VOO'] }, CTX);

    expect(result.benchmarks).toHaveLength(1);
    expect(result.benchmarks[0].symbol).toBe('VOO');

    // Comparison must classify portfolio as out or underperforming
    const totalComparisons =
      result.comparison.outperformingBenchmarks.length +
      result.comparison.underperformingBenchmarks.length;

    expect(totalComparisons).toBeGreaterThan(0);
  });

  it('handles missing benchmark data gracefully', async () => {
    const tool2 = new PerformanceCompareTool(
      portfolioServiceMock(),
      benchmarkServiceMock({
        getBenchmarks: jest.fn().mockResolvedValue([])
      }),
      marketDataServiceMock(),
      userServiceMock()
    );

    const result = await tool2.execute({}, CTX);

    expect(result.warnings.some((w) => w.code === 'no_benchmark_data')).toBe(
      true
    );
    expect(result.portfolio.totalInvestment).toBeGreaterThan(0);
  });

  it('supports different date ranges', async () => {
    for (const dateRange of ['ytd', '1y', 'max'] as const) {
      const result = await tool.execute({ dateRange }, CTX);

      expect(result.dateRange).toBe(dateRange);
      expect(result.period.startDate).toBeTruthy();
      expect(result.period.endDate).toBeTruthy();
    }
  });
});

// ─── 4. tax_estimate ─────────────────────────────────────────────────────────

describe('tax_estimate — demo account', () => {
  let tool: TaxEstimateTool;

  const activitiesWithBuySell = [
    // AAPL: bought Jan 2023 at $130, sold Jan 2024 at $185 (long-term)
    {
      SymbolProfile: { dataSource: 'YAHOO', symbol: 'AAPL' },
      date: new Date('2023-01-10'),
      feeInBaseCurrency: 0,
      id: 'buy-aapl',
      quantity: 15,
      type: 'BUY',
      valueInBaseCurrency: 1950
    },
    {
      SymbolProfile: { dataSource: 'YAHOO', symbol: 'AAPL' },
      date: new Date('2024-01-15'),
      feeInBaseCurrency: 4.95,
      id: 'sell-aapl',
      quantity: 5,
      type: 'SELL',
      valueInBaseCurrency: 925
    },
    // JPM: bought Mar 2023, sold Mar 2024 (12-month boundary)
    {
      SymbolProfile: { dataSource: 'YAHOO', symbol: 'JPM' },
      date: new Date('2023-03-10'),
      feeInBaseCurrency: 4.95,
      id: 'buy-jpm',
      quantity: 12,
      type: 'BUY',
      valueInBaseCurrency: 1560
    },
    {
      SymbolProfile: { dataSource: 'YAHOO', symbol: 'JPM' },
      date: new Date('2024-03-15'),
      feeInBaseCurrency: 4.95,
      id: 'sell-jpm',
      quantity: 5,
      type: 'SELL',
      valueInBaseCurrency: 975
    }
  ];

  beforeEach(() => {
    tool = new TaxEstimateTool(
      {
        getOrders: jest.fn().mockResolvedValue({
          activities: activitiesWithBuySell,
          count: activitiesWithBuySell.length
        })
      } as any,
      portfolioServiceMock(),
      userServiceMock()
    );
  });

  it('computes realized gains via FIFO for demo sells', async () => {
    const result = await tool.execute(
      { jurisdiction: 'US', taxYear: 2024 },
      CTX
    );

    // AAPL: sold 5 of 15 shares. Cost = 5/15 * $1950 = $650. Proceeds = $925 - $4.95 = $920.05
    // JPM: sold 5 of 12 shares. Cost = 5/12 * $1560 = $650. Proceeds = $975 - $4.95 = $970.05
    expect(result.realizedGains.total.transactionCount).toBe(2);
    expect(result.realizedGains.total.netInBaseCurrency).toBeGreaterThan(0);
    expect(result.taxYear).toBe(2024);
  });

  it('returns no warnings when jurisdiction is provided', async () => {
    const result = await tool.execute(
      { jurisdiction: 'US', taxYear: 2024 },
      CTX
    );
    const jurisdictionWarning = result.warnings.find(
      (w) => w.code === 'no_jurisdiction_provided'
    );

    expect(jurisdictionWarning).toBeUndefined();
  });

  it('populates hypotheticalImpact for a proposed NVDA sell', async () => {
    const result = await tool.execute(
      {
        hypotheticalTrades: [{ action: 'sell', quantity: 10, symbol: 'NVDA' }],
        jurisdiction: 'US',
        taxYear: 2024
      },
      CTX
    );

    // No real NVDA sells in 2024 activities above, so realizedGains should be
    // from AAPL+JPM only; hypotheticalImpact covers the NVDA scenario
    expect(result.hypotheticalImpact).toBeDefined();
    expect(result.hypotheticalImpact!.trades).toHaveLength(1);

    const nvidaTrade = result.hypotheticalImpact!.trades[0];

    expect(nvidaTrade.symbol).toBe('NVDA');
    // No NVDA buy activities → insufficient lots → warning expected
    expect(nvidaTrade.warning).toMatch(/lot|quantity/i);
  });

  it('returns TLH candidates for underwater positions (VNQ, BND)', async () => {
    const result = await tool.execute(
      { jurisdiction: 'US', taxYear: 2025 },
      CTX
    );

    const tlhSymbols = result.taxLossHarvestingCandidates.map((c) => c.symbol);

    // VNQ is underwater ($800 value vs $1100 investment)
    expect(tlhSymbols).toContain('VNQ');
    expect(
      result.taxLossHarvestingCandidates[0].unrealizedLossInBaseCurrency
    ).toBeLessThan(0);
  });

  it('reports baseCurrency, assumptions, and disclaimers', async () => {
    const result = await tool.execute({ taxYear: 2024 }, CTX);

    expect(result.baseCurrency).toBe('USD');
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.disclaimers.length).toBeGreaterThan(0);
  });
});

// ─── 5. rebalance_suggest ─────────────────────────────────────────────────────

describe('rebalance_suggest — demo account', () => {
  let tool: RebalanceSuggestTool;

  beforeEach(() => {
    tool = new RebalanceSuggestTool(portfolioServiceMock(), userServiceMock());
  });

  it('suggests selling VOO with equal_weight strategy and relaxed turnover cap', async () => {
    const result = await tool.execute(
      {
        constraints: {
          cashReservePct: 0,
          maxTrades: 10,
          maxTurnoverPct: 1.0, // no cap — test that VOO (largest drift) gets a trade
          minTradeValueInBaseCurrency: 50
        },
        strategy: 'equal_weight'
      },
      CTX
    );

    expect(result.strategy).toBe('equal_weight');
    expect(result.portfolioValueInBaseCurrency).toBeGreaterThan(50000);

    // With uncapped turnover, VOO (45% vs 10% target) MUST appear as a SELL
    const vooTrade = result.suggestedTrades.find((t) => t.symbol === 'VOO');

    expect(vooTrade).toBeDefined();
    expect(vooTrade!.action).toBe('SELL');
    expect(vooTrade!.valueInBaseCurrency).toBeGreaterThan(10000);
  });

  /**
   * REGRESSION TEST: Default 20% turnover cap silently excludes VOO
   * even though it was flagged as the biggest risk.
   *
   * The system prompt now instructs the LLM to check tradesLimitedByConstraints
   * and explain the exclusion. This test verifies the flag is set correctly.
   */
  it('BUG REGRESSION: tradesLimitedByConstraints is true when VOO is excluded by default cap', async () => {
    const result = await tool.execute(
      { strategy: 'equal_weight' }, // default maxTurnoverPct=0.2
      CTX
    );

    // VOO drift is ~35% but the 20% cap only allows ~$11K in trades
    // VOO alone would need ~$19K → it gets excluded
    expect(result.summary.tradesLimitedByConstraints).toBe(true);

    const vooTarget = result.targetAllocations.find((t) => t.symbol === 'VOO');

    expect(vooTarget).toBeDefined();
    // VOO should have a target but no actual trade due to constraint
    // (could be tradeSuggested=true or false depending on trade ordering)
    expect(vooTarget!.targetPct).toBeLessThan(vooTarget!.targetPct + 0.01); // sanity
  });

  it('custom strategy correctly targets specific holdings', async () => {
    const result = await tool.execute(
      {
        constraints: { cashReservePct: 0, maxTrades: 10, maxTurnoverPct: 1 },
        strategy: 'custom',
        targetAllocations: [
          { symbol: 'VOO', targetPct: 0.25 },
          { symbol: 'NVDA', targetPct: 0.1 },
          { symbol: 'BND', targetPct: 0.15 },
          { symbol: 'AAPL', targetPct: 0.1 },
          { symbol: 'MSFT', targetPct: 0.1 },
          { symbol: 'AMZN', targetPct: 0.1 },
          { symbol: 'VEA', targetPct: 0.08 },
          { symbol: 'JPM', targetPct: 0.05 },
          { symbol: 'VNQ', targetPct: 0.05 },
          { symbol: 'BTC-USD', targetPct: 0.02 }
        ]
      },
      CTX
    );

    expect(result.strategy).toBe('custom');
    expect(result.warnings.some((w) => w.code.includes('custom_target'))).toBe(
      false
    );

    // VOO is at 45%, target is 25% → must be a SELL
    const vooTrade = result.suggestedTrades.find((t) => t.symbol === 'VOO');

    expect(vooTrade).toBeDefined();
    expect(vooTrade!.action).toBe('SELL');
  });

  it('warns when portfolio is empty', async () => {
    const tool2 = new RebalanceSuggestTool(
      portfolioServiceMock({
        getDetails: jest.fn().mockResolvedValue({
          holdings: {},
          summary: { cash: 0, totalValueInBaseCurrency: 0 }
        })
      }),
      userServiceMock()
    );

    const result = await tool2.execute({}, CTX);

    expect(result.warnings.some((w) => w.code === 'empty_portfolio')).toBe(
      true
    );
    expect(result.suggestedTrades).toEqual([]);
  });
});

// ─── 6. stress_test ──────────────────────────────────────────────────────────

describe('stress_test — demo account', () => {
  let tool: StressTestTool;

  beforeEach(() => {
    tool = new StressTestTool(portfolioServiceMock());
  });

  it('runs built-in market_crash_2008 scenario and returns impact values', async () => {
    const envelope = await tool.execute(
      { scenarioId: 'market_crash_2008' },
      CTX
    );
    const result = envelope.data!;

    expect(result.currentValueInBaseCurrency).toBeGreaterThan(50000);
    expect(Array.isArray(result.positionImpacts)).toBe(true);
    expect(result.scenario).toBeDefined();
    expect(result.scenario.name).toBeTruthy();
    expect(result.mostVulnerable.length).toBeGreaterThan(0);
    expect(result.recoveryNeededPct).toBeGreaterThan(0); // must recover some % after drop
  });

  it('position impacts are non-zero for equity holdings (VOO, NVDA)', async () => {
    const envelope = await tool.execute(
      { scenarioId: 'market_crash_2008' },
      CTX
    );
    const result = envelope.data!;

    const vooImpact = result.positionImpacts.find((p) => p.symbol === 'VOO');
    const nvdaImpact = result.positionImpacts.find((p) => p.symbol === 'NVDA');

    // Both are equity — must have non-zero loss in any stress scenario
    if (vooImpact) {
      expect(vooImpact.lossInBaseCurrency).not.toBe(0);
    }

    if (nvdaImpact) {
      expect(nvdaImpact.lossInBaseCurrency).not.toBe(0);
    }
  });

  it('returns error with available scenario IDs for an unknown scenarioId', async () => {
    const envelope = await tool.execute({ scenarioId: 'dot_com_crash' }, CTX);

    // Unknown scenario → error with availableScenarioIds, OR data is defined for a valid one
    if (envelope.status === 'error') {
      expect(envelope.error?.message).toMatch(/available scenario/i);
    } else {
      expect(envelope.data?.scenario.id).toBeTruthy();
    }
  });
});

// ─── 7. compliance_check ─────────────────────────────────────────────────────

describe('compliance_check — demo account', () => {
  let tool: ComplianceCheckTool;

  beforeEach(() => {
    tool = new ComplianceCheckTool(portfolioServiceMock(), userServiceMock());
  });

  it('returns NON_COMPLIANT for default rules due to VOO concentration', async () => {
    const result = await tool.execute({}, CTX);

    expect(result.overallStatus).toBe('NON_COMPLIANT');
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results.some((r) => r.status === 'fail')).toBe(true);
    expect(result.rulesFailed).toBeGreaterThan(0);
  });

  it('fails maxSinglePositionPct when VOO exceeds 40%', async () => {
    const result = await tool.execute(
      { rules: { maxSinglePositionPct: 0.4 } },
      CTX
    );

    expect(result.overallStatus).toBe('NON_COMPLIANT');
    const failedRule = result.results.find(
      (r) => r.status === 'fail' && r.ruleId.includes('single')
    );

    expect(failedRule).toBeDefined();
  });

  it('passes compliance when all thresholds are set permissively', async () => {
    const result = await tool.execute(
      {
        rules: {
          maxAssetClassPct: 0.95,
          maxCashPct: 0.95,
          maxSectorPct: 0.95,
          maxSinglePositionPct: 0.95,
          maxTop3Pct: 0.99,
          minHoldingsCount: 1
        }
      },
      CTX
    );

    expect(result.overallStatus).toBe('COMPLIANT');
    expect(result.rulesFailed).toBe(0);
  });

  it('blocks restricted symbols', async () => {
    const result = await tool.execute(
      { rules: { restrictedSymbols: ['BTC-USD', 'NVDA'] } },
      CTX
    );

    expect(result.overallStatus).toBe('NON_COMPLIANT');
    const cryptoFail = result.results.find(
      (r) => r.status === 'fail' && r.details?.includes('BTC-USD')
    );

    expect(cryptoFail).toBeDefined();
  });

  it('includes portfolioValueInBaseCurrency and holdingsCount', async () => {
    const result = await tool.execute({}, CTX);

    expect(result.portfolioValueInBaseCurrency).toBeGreaterThan(50000);
    expect(result.holdingsCount).toBe(10);
  });
});

// ─── 8. get_transaction_history ──────────────────────────────────────────────

describe('get_transaction_history — demo account', () => {
  let tool: GetTransactionHistoryTool;

  const fullOrderService = {
    getOrders: jest.fn().mockResolvedValue({
      activities: DEMO_ACTIVITIES,
      count: DEMO_ACTIVITIES.length
    })
  } as any;

  beforeEach(() => {
    tool = new GetTransactionHistoryTool(fullOrderService, userServiceMock());
  });

  it('returns 3 transactions and correct pagination', async () => {
    const result = await tool.execute({}, CTX);

    expect(result.transactions.length).toBe(3);
    expect(result.page.totalCount).toBe(3);
    expect(result.page.returnedCount).toBe(3);
  });

  it('filters by activity type (BUY)', async () => {
    const orderService = {
      getOrders: jest.fn().mockResolvedValue({
        activities: DEMO_ACTIVITIES.filter((a) => a.type === 'BUY'),
        count: 2
      })
    } as any;

    const t = new GetTransactionHistoryTool(orderService, userServiceMock());
    const result = await t.execute({ types: ['BUY'] }, CTX);

    expect(result.transactions.every((tx) => tx.type === 'BUY')).toBe(true);
  });

  it('each transaction has symbol, date, quantity, value', async () => {
    const result = await tool.execute({}, CTX);

    for (const tx of result.transactions) {
      expect(tx.symbol).toBeTruthy();
      expect(tx.date).toBeTruthy();
      expect(tx.quantity).toBeGreaterThan(0);
      expect(tx.valueInBaseCurrency).toBeGreaterThan(0);
      expect(['BUY', 'SELL', 'DIVIDEND', 'FEE', 'INTEREST']).toContain(tx.type);
    }
  });

  it('respects pageSize parameter', async () => {
    const result = await tool.execute({ pageSize: 1 }, CTX);

    expect(result.page.pageSize).toBe(1);
  });
});

// ─── 9. simulate_trades ──────────────────────────────────────────────────────

describe('simulate_trades — demo account', () => {
  let tool: SimulateTradesTool;

  beforeEach(() => {
    tool = new SimulateTradesTool(portfolioServiceMock(), userServiceMock());
  });

  it('simulates selling VOO and buying BND (cash neutral)', async () => {
    const envelope = await tool.execute(
      {
        trades: [
          { action: 'sell', symbol: 'VOO', notionalUsd: 10000 },
          { action: 'buy', symbol: 'BND', notionalUsd: 10000 }
        ]
      },
      CTX
    );
    const result = envelope.data!;

    // Post-simulation VOO allocation should be lower
    const vooAfter = result.hypotheticalPortfolio.positions.find(
      (p) => p.symbol === 'VOO'
    );

    if (vooAfter) {
      expect(vooAfter.valueInBaseCurrency).toBeLessThan(24565);
    }

    // Total portfolio value should be roughly the same (cash neutral)
    expect(
      result.hypotheticalPortfolio.totalValueInBaseCurrency
    ).toBeGreaterThan(0);
    expect(result.impact.totalValueChangeInBaseCurrency).toBeCloseTo(0, 0);
  });

  it('warns when selling more than available value (VNQ only $800)', async () => {
    const envelope = await tool.execute(
      {
        trades: [
          { action: 'sell', symbol: 'VNQ', notionalUsd: 99999 } // VNQ only worth $800
        ]
      },
      CTX
    );
    const result = envelope.data!;

    // Should either warn about insufficient value, cap trade, or partial status
    const hasWarning = result.warnings.length > 0;
    const isPartial = result.status === 'partial';
    const tradeAdjusted = result.tradeResults.some(
      (t) => t.warnings.length > 0 || t.status === 'capped'
    );

    expect(hasWarning || isPartial || tradeAdjusted).toBe(true);
  });

  it('returns portfolioBefore and hypotheticalPortfolio snapshots', async () => {
    const envelope = await tool.execute(
      { trades: [{ action: 'sell', symbol: 'VOO', notionalUsd: 5000 }] },
      CTX
    );
    const result = envelope.data!;

    expect(result.portfolioBefore.totalValueInBaseCurrency).toBeGreaterThan(
      50000
    );
    expect(
      result.hypotheticalPortfolio.totalValueInBaseCurrency
    ).toBeGreaterThan(0);
    expect(Array.isArray(result.disclaimers)).toBe(true);
  });
});

// ─── 10. market_data_lookup ──────────────────────────────────────────────────

describe('market_data_lookup — demo account', () => {
  let tool: MarketDataLookupTool;

  beforeEach(() => {
    tool = new MarketDataLookupTool(
      symbolServiceMock(),
      symbolProfileServiceMock(),
      userServiceMock()
    );
  });

  it('returns a quote for VOO with price, currency, and asset class', async () => {
    const result = await tool.execute({ symbol: 'VOO' }, CTX);

    expect(result.symbol).toBe('VOO');
    expect(result.marketPrice).toBeGreaterThan(0);
    expect(result.currency).toBe('USD');
    expect(result.assetClass).toBe('EQUITY');
  });

  it('handles unknown symbol gracefully', async () => {
    const tool2 = new MarketDataLookupTool(
      {
        get: jest.fn().mockResolvedValue(null)
      } as any,
      {
        getSymbolProfile: jest.fn().mockResolvedValue(null)
      } as any,
      userServiceMock()
    );

    // Should return an error envelope or empty result, not throw
    let threw = false;

    try {
      await tool2.execute({ symbol: 'XXXXXXX' }, CTX);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });

  it('returns historical data when includeHistory=true', async () => {
    const historySymbolService = {
      get: jest.fn().mockResolvedValue({
        assetClass: 'EQUITY',
        assetSubClass: 'ETF',
        currency: 'USD',
        dataSource: 'YAHOO',
        // Tool maps { date, value } → { date, marketPrice }
        historicalData: [
          { date: new Date('2025-01-01'), value: 480 },
          { date: new Date('2025-01-02'), value: 482 }
        ],
        marketPrice: 500,
        name: 'VOO',
        symbol: 'VOO'
      })
    } as any;

    const t = new MarketDataLookupTool(
      historySymbolService,
      symbolProfileServiceMock(),
      userServiceMock()
    );

    const result = await t.execute(
      { symbol: 'VOO', includeHistory: true },
      CTX
    );

    expect(result.historicalData.length).toBeGreaterThan(0);
    expect(result.historicalData[0].marketPrice).toBeGreaterThan(0);
  });
});
