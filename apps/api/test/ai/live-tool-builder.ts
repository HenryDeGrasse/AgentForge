/**
 * Live Eval Tool Builder
 *
 * Builds REAL tool instances (AnalyzeRiskTool, GetPortfolioSummaryTool, etc.)
 * backed by mocked services that return demo-account-shaped data.
 *
 * Why real tools instead of the fast-tier stubs in tool-profiles.ts?
 *  - Real tools validate LLM-provided arguments (dateRange, symbol, strategy)
 *  - Real tools compute derived values (FIFO lots, risk flags, compliance rules)
 *  - Real tools return production-shaped envelopes, exercising the same code paths
 *  - The LLM's argument choices matter — we're testing gpt-4.1, not our fixtures
 *
 * The mock data matches the demo seed (seed-demo.ts): 10 holdings, 33 activities,
 * 2 accounts, $55k total value. Same data as the seeded development database.
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
import type { ToolDefinition } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

// ─── Demo account constants ─────────────────────────────────────────────────

export const LIVE_EVAL_USER_ID = 'd6e4f1a0-b8c3-4e7f-9a2d-1c5e8f3b7d40';

// ─── Shared demo data (matches seed-demo.ts) ─────────────────────────────────

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
  createdAt: new Date('2025-02-27T12:00:00Z'),
  holdings: DEMO_HOLDINGS,
  summary: DEMO_SUMMARY
};

function buildDemoPerformanceChart(dataPoints = 252) {
  const chart = [];
  let netWorth = 48000;

  for (let i = 0; i < dataPoints; i++) {
    const date = new Date('2024-02-28');

    date.setDate(date.getDate() + i);

    if (date.getDay() === 0 || date.getDay() === 6) {
      continue;
    }

    const dailyReturn = (0.53 - (i % 10) * 0.006) * 0.012;

    netWorth = netWorth * (1 + dailyReturn);

    chart.push({
      date: date.toISOString().split('T')[0],
      investmentValueWithCurrencyEffect: 48405,
      netPerformance: netWorth - 48405,
      netPerformanceInPercentage: (netWorth - 48405) / 48405,
      netPerformanceInPercentageWithCurrencyEffect: (netWorth - 48405) / 48405,
      netPerformanceWithCurrencyEffect: netWorth - 48405,
      netWorth,
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

/** Demo activities: 33 total (representative 5 covering all required fields) */
const makeActivity = (
  id: string,
  symbol: string,
  name: string,
  date: string,
  type: 'BUY' | 'SELL',
  quantity: number,
  unitPrice: number,
  fee: number,
  accountId: string,
  accountName: string
) => ({
  SymbolProfile: { currency: 'USD', dataSource: 'YAHOO', name, symbol },
  account: { id: accountId, name: accountName },
  accountId,
  currency: 'USD',
  date: new Date(date),
  fee,
  feeInBaseCurrency: fee,
  id,
  quantity,
  type,
  unitPrice,
  value: quantity * unitPrice,
  valueInBaseCurrency: quantity * unitPrice
});

const ACCT_BROKERAGE = 'a1b2c3d4-0001-4000-8000-000000000001';
const ACCT_IRA = 'a1b2c3d4-0002-4000-8000-000000000002';

const DEMO_ACTIVITIES = [
  makeActivity(
    'act-001',
    'AAPL',
    'Apple Inc.',
    '2023-01-10',
    'BUY',
    15,
    130.0,
    0,
    ACCT_BROKERAGE,
    'Brokerage'
  ),
  makeActivity(
    'act-002',
    'NVDA',
    'NVIDIA Corporation',
    '2023-03-05',
    'BUY',
    10,
    230.0,
    4.95,
    ACCT_BROKERAGE,
    'Brokerage'
  ),
  makeActivity(
    'act-003',
    'AAPL',
    'Apple Inc.',
    '2024-01-15',
    'SELL',
    5,
    185.0,
    4.95,
    ACCT_BROKERAGE,
    'Brokerage'
  ),
  makeActivity(
    'act-004',
    'VOO',
    'Vanguard S&P 500 ETF',
    '2023-01-15',
    'BUY',
    20,
    380.0,
    0,
    ACCT_IRA,
    'Retirement (IRA)'
  ),
  makeActivity(
    'act-005',
    'BND',
    'Vanguard Total Bond Market ETF',
    '2023-01-20',
    'BUY',
    65,
    74.0,
    0,
    ACCT_IRA,
    'Retirement (IRA)'
  )
];

const DEMO_USER = {
  id: LIVE_EVAL_USER_ID,
  role: 'ADMIN',
  settings: { settings: { baseCurrency: 'USD' } }
};

const DEMO_VOO_BENCHMARK = {
  dataSource: 'YAHOO',
  marketCondition: 'NEUTRAL_MARKETS',
  name: 'Vanguard S&P 500 ETF',
  performances: {
    allTimeHigh: {
      date: new Date('2024-12-01'),
      performancePercent: -0.03
    }
  },
  symbol: 'VOO',
  trend200d: 'UP',
  trend50d: 'UP'
};

// ─── Mock service factories ───────────────────────────────────────────────────

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

function benchmarkServiceMock() {
  return {
    getBenchmarkTrends: jest
      .fn()
      .mockResolvedValue({ trend200d: 'UP', trend50d: 'UP' }),
    getBenchmarks: jest.fn().mockResolvedValue([DEMO_VOO_BENCHMARK])
  } as any;
}

function marketDataServiceMock() {
  const prices = Array.from({ length: 60 }, (_, i) => ({
    date: new Date(new Date('2025-01-02').getTime() + i * 86_400_000),
    marketPrice: 490 + i * 0.5,
    symbol: 'VOO'
  }));

  return {
    getQuote: jest
      .fn()
      .mockResolvedValue({ currency: 'USD', marketPrice: 500 }),
    getRange: jest.fn().mockResolvedValue(prices)
  } as any;
}

/** Known demo symbol → data map. For unknown symbols, returns a generic equity quote. */
const DEMO_SYMBOL_DATA: Record<
  string,
  {
    assetClass: string;
    assetSubClass: string;
    marketPrice: number;
    name: string;
  }
> = {
  AAPL: {
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    marketPrice: 228.0,
    name: 'Apple Inc.'
  },
  AMZN: {
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    marketPrice: 208.0,
    name: 'Amazon.com Inc.'
  },
  BND: {
    assetClass: 'FIXED_INCOME',
    assetSubClass: 'ETF',
    marketPrice: 73.5,
    name: 'Vanguard Total Bond Market ETF'
  },
  'BTC-USD': {
    assetClass: 'LIQUIDITY',
    assetSubClass: 'CRYPTOCURRENCY',
    marketPrice: 97500,
    name: 'Bitcoin USD'
  },
  JPM: {
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    marketPrice: 130.0,
    name: 'JPMorgan Chase & Co.'
  },
  MSFT: {
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    marketPrice: 415.0,
    name: 'Microsoft Corporation'
  },
  NVDA: {
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    marketPrice: 134.0,
    name: 'NVIDIA Corporation'
  },
  SPY: {
    assetClass: 'EQUITY',
    assetSubClass: 'ETF',
    marketPrice: 590.0,
    name: 'SPDR S&P 500 ETF Trust'
  },
  VEA: {
    assetClass: 'EQUITY',
    assetSubClass: 'ETF',
    marketPrice: 46.0,
    name: 'Vanguard FTSE Developed Markets ETF'
  },
  VNQ: {
    assetClass: 'REAL_ESTATE',
    assetSubClass: 'ETF',
    marketPrice: 80.0,
    name: 'Vanguard Real Estate ETF'
  },
  VOO: {
    assetClass: 'EQUITY',
    assetSubClass: 'ETF',
    marketPrice: 500.0,
    name: 'Vanguard S&P 500 ETF'
  }
};

function getSymbolData(symbol: string) {
  const known = DEMO_SYMBOL_DATA[symbol.toUpperCase()];

  if (known) {
    return {
      currency: 'USD',
      dataSource: 'YAHOO',
      historicalData: [],
      symbol,
      ...known
    };
  }

  // Unknown symbol — return generic equity
  return {
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    currency: 'USD',
    dataSource: 'YAHOO',
    historicalData: [],
    marketPrice: 100.0,
    name: symbol,
    symbol
  };
}

function symbolServiceMock() {
  return {
    get: jest
      .fn()
      .mockImplementation(
        (arg: { dataGatheringItem?: { symbol?: string }; symbol?: string }) => {
          const symbol = arg?.dataGatheringItem?.symbol ?? arg?.symbol ?? 'VOO';
          return Promise.resolve(getSymbolData(symbol));
        }
      ),
    lookup: jest.fn().mockResolvedValue([])
  } as any;
}

function symbolProfileServiceMock() {
  return {
    getHistoricalData: jest.fn().mockResolvedValue([]),
    getSymbolProfile: jest.fn().mockImplementation(({ symbol }) => {
      const d = getSymbolData(symbol ?? 'VOO');

      return Promise.resolve({
        assetClass: d.assetClass,
        assetSubClass: d.assetSubClass,
        countries: [],
        currency: d.currency,
        dataSource: d.dataSource,
        name: d.name,
        sectors: [],
        symbol: d.symbol
      });
    }),
    getSymbolProfiles: jest
      .fn()
      .mockImplementation(
        (items: ({ dataSource?: string; symbol?: string } | string)[]) => {
          const resolvedItems = Array.isArray(items) ? items : [items ?? 'VOO'];

          return Promise.resolve(
            resolvedItems.map((item) => {
              const symbol =
                typeof item === 'string' ? item : (item?.symbol ?? 'VOO');
              const d = getSymbolData(symbol);

              return {
                assetClass: d.assetClass,
                assetSubClass: d.assetSubClass,
                countries: [],
                currency: d.currency,
                dataSource: d.dataSource,
                name: d.name,
                sectors: [],
                symbol: d.symbol
              };
            })
          );
        }
      )
  } as any;
}

function orderServiceMock() {
  return {
    getOrders: jest.fn().mockResolvedValue({
      activities: DEMO_ACTIVITIES,
      count: DEMO_ACTIVITIES.length
    })
  } as any;
}

function prismaServiceMock() {
  return {
    order: {
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: 33 },
        _max: { date: new Date('2025-06-15') }
      })
    }
  } as any;
}

// ─── Public builder ───────────────────────────────────────────────────────────

export interface LiveToolBuildResult {
  tools: ToolDefinition[];
}

/**
 * Returns real tool instances backed by demo-seed-shaped mock services.
 * All 10 AI tools are registered; the ToolRegistry will expose only the
 * subset the agent is allowed to call.
 */
export function buildLiveTools(): LiveToolBuildResult {
  const portfolioSvc = portfolioServiceMock();
  const userSvc = userServiceMock();
  const benchmarkSvc = benchmarkServiceMock();
  const marketDataSvc = marketDataServiceMock();
  const symbolSvc = symbolServiceMock();
  const symbolProfileSvc = symbolProfileServiceMock();
  const orderSvc = orderServiceMock();
  const prismaSvc = prismaServiceMock();

  // Cast to ToolDefinition[] — concrete tool classes return typed outputs
  // (e.g. PerformanceCompareOutput) which are structurally compatible but
  // TypeScript's index signature check blocks direct assignment.
  const tools = [
    new GetPortfolioSummaryTool(portfolioSvc, prismaSvc, userSvc),
    new AnalyzeRiskTool(portfolioSvc, userSvc),
    new GetTransactionHistoryTool(orderSvc, userSvc),
    new ComplianceCheckTool(portfolioSvc, userSvc),
    new MarketDataLookupTool(symbolSvc, symbolProfileSvc, userSvc),
    new PerformanceCompareTool(
      portfolioSvc,
      benchmarkSvc,
      marketDataSvc,
      userSvc
    ),
    new RebalanceSuggestTool(portfolioSvc, userSvc),
    new SimulateTradesTool(portfolioSvc, userSvc),
    new StressTestTool(portfolioSvc),
    new TaxEstimateTool(orderSvc, portfolioSvc, userSvc)
  ] as unknown as ToolDefinition[];

  return { tools };
}
