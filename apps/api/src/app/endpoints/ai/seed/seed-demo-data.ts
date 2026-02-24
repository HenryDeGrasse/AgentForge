/**
 * Demo seed data definitions for the AgentForge AI tools.
 *
 * Contains all constants and helpers needed to populate a Ghostfolio
 * database with a realistic portfolio for development, demos, and testing.
 *
 * The actual Prisma seed runner (prisma/seed-demo.mts) imports from here.
 * Unit tests validate the data consistency without touching the database.
 */

// ─── Fixed IDs ───────────────────────────────────────────────────────────────

export const DEMO_USER_ID = 'd6e4f1a0-b8c3-4e7f-9a2d-1c5e8f3b7d40';

// ─── Accounts ────────────────────────────────────────────────────────────────

export interface DemoAccount {
  currency: string;
  id: string;
  name: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    currency: 'USD',
    id: 'a1b2c3d4-0001-4000-8000-000000000001',
    name: 'Brokerage'
  },
  {
    currency: 'USD',
    id: 'a1b2c3d4-0002-4000-8000-000000000002',
    name: 'Retirement (IRA)'
  }
];

// ─── Symbol Profiles ─────────────────────────────────────────────────────────

export interface DemoSymbolProfile {
  assetClass: string;
  assetSubClass: string;
  countries?: {
    code: string;
    continent: string;
    name: string;
    weight: number;
  }[];
  currency: string;
  dataSource: string;
  name: string;
  sectors?: { name: string; weight: number }[];
  symbol: string;
}

export const DEMO_SYMBOL_PROFILES: DemoSymbolProfile[] = [
  // ── Equities ──
  {
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO',
    name: 'Apple Inc.',
    sectors: [{ name: 'Technology', weight: 1 }],
    symbol: 'AAPL'
  },
  {
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO',
    name: 'Microsoft Corporation',
    sectors: [{ name: 'Technology', weight: 1 }],
    symbol: 'MSFT'
  },
  {
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO',
    name: 'NVIDIA Corporation',
    sectors: [{ name: 'Technology', weight: 1 }],
    symbol: 'NVDA'
  },
  {
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO',
    name: 'Amazon.com Inc.',
    sectors: [
      { name: 'Consumer Cyclical', weight: 0.5 },
      { name: 'Technology', weight: 0.5 }
    ],
    symbol: 'AMZN'
  },
  {
    assetClass: 'EQUITY',
    assetSubClass: 'STOCK',
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO',
    name: 'JPMorgan Chase & Co.',
    sectors: [{ name: 'Financial Services', weight: 1 }],
    symbol: 'JPM'
  },

  // ── ETFs ──
  {
    assetClass: 'EQUITY',
    assetSubClass: 'ETF',
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO',
    name: 'Vanguard S&P 500 ETF',
    sectors: [
      { name: 'Technology', weight: 0.3 },
      { name: 'Healthcare', weight: 0.13 },
      { name: 'Financial Services', weight: 0.13 },
      { name: 'Consumer Cyclical', weight: 0.1 },
      { name: 'Communication Services', weight: 0.09 },
      { name: 'Industrials', weight: 0.08 }
    ],
    symbol: 'VOO'
  },
  {
    assetClass: 'FIXED_INCOME',
    assetSubClass: 'ETF',
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO',
    name: 'Vanguard Total Bond Market ETF',
    sectors: [],
    symbol: 'BND'
  },
  {
    assetClass: 'REAL_ESTATE',
    assetSubClass: 'ETF',
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO',
    name: 'Vanguard Real Estate ETF',
    sectors: [{ name: 'Real Estate', weight: 1 }],
    symbol: 'VNQ'
  },

  // ── Crypto ──
  {
    assetClass: 'LIQUIDITY',
    assetSubClass: 'CRYPTOCURRENCY',
    countries: [],
    currency: 'USD',
    dataSource: 'YAHOO',
    name: 'Bitcoin USD',
    sectors: [],
    symbol: 'BTC-USD'
  },

  // ── International equity ──
  {
    assetClass: 'EQUITY',
    assetSubClass: 'ETF',
    countries: [
      { code: 'JP', continent: 'Asia', name: 'Japan', weight: 0.16 },
      { code: 'GB', continent: 'Europe', name: 'United Kingdom', weight: 0.1 },
      { code: 'FR', continent: 'Europe', name: 'France', weight: 0.09 },
      { code: 'CH', continent: 'Europe', name: 'Switzerland', weight: 0.08 },
      { code: 'DE', continent: 'Europe', name: 'Germany', weight: 0.07 }
    ],
    currency: 'USD',
    dataSource: 'YAHOO',
    name: 'Vanguard FTSE Developed Markets ETF',
    sectors: [
      { name: 'Financial Services', weight: 0.18 },
      { name: 'Industrials', weight: 0.15 },
      { name: 'Technology', weight: 0.14 },
      { name: 'Healthcare', weight: 0.12 },
      { name: 'Consumer Cyclical', weight: 0.11 }
    ],
    symbol: 'VEA'
  }
];

// ─── Activities / Transactions ───────────────────────────────────────────────

export interface DemoActivity {
  accountId: string;
  currency: string;
  dataSource: string;
  date: string;
  fee: number;
  quantity: number;
  symbol: string;
  type: 'BUY' | 'DIVIDEND' | 'FEE' | 'INTEREST' | 'SELL';
  unitPrice: number;
}

const BROKERAGE = DEMO_ACCOUNTS[0].id;
const RETIREMENT = DEMO_ACCOUNTS[1].id;

export const DEMO_ACTIVITIES: DemoActivity[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // 2023 — Initial portfolio build-up
  // ══════════════════════════════════════════════════════════════════════════

  // Jan 2023 — Opening positions (Brokerage)
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-01-10',
    fee: 0,
    quantity: 15,
    symbol: 'AAPL',
    type: 'BUY',
    unitPrice: 130.0
  },
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-01-12',
    fee: 0,
    quantity: 8,
    symbol: 'MSFT',
    type: 'BUY',
    unitPrice: 240.0
  },
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-01-15',
    fee: 0,
    quantity: 25,
    symbol: 'VOO',
    type: 'BUY',
    unitPrice: 365.0
  },

  // Jan 2023 — Retirement positions
  {
    accountId: RETIREMENT,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-01-20',
    fee: 0,
    quantity: 30,
    symbol: 'VOO',
    type: 'BUY',
    unitPrice: 368.0
  },
  {
    accountId: RETIREMENT,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-01-20',
    fee: 0,
    quantity: 50,
    symbol: 'BND',
    type: 'BUY',
    unitPrice: 74.0
  },

  // Mar 2023 — Add NVDA and JPM
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-03-05',
    fee: 4.95,
    quantity: 10,
    symbol: 'NVDA',
    type: 'BUY',
    unitPrice: 230.0
  },
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-03-10',
    fee: 4.95,
    quantity: 12,
    symbol: 'JPM',
    type: 'BUY',
    unitPrice: 130.0
  },

  // Apr 2023 — AAPL dividend
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-04-15',
    fee: 0,
    quantity: 15,
    symbol: 'AAPL',
    type: 'DIVIDEND',
    unitPrice: 0.24
  },

  // May 2023 — Add international + real estate
  {
    accountId: RETIREMENT,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-05-01',
    fee: 0,
    quantity: 40,
    symbol: 'VEA',
    type: 'BUY',
    unitPrice: 44.0
  },
  {
    accountId: RETIREMENT,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-05-01',
    fee: 0,
    quantity: 20,
    symbol: 'VNQ',
    type: 'BUY',
    unitPrice: 80.0
  },

  // Jun 2023 — Add Amazon
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-06-15',
    fee: 4.95,
    quantity: 8,
    symbol: 'AMZN',
    type: 'BUY',
    unitPrice: 130.0
  },

  // Jul 2023 — AAPL dividend Q3
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-07-15',
    fee: 0,
    quantity: 15,
    symbol: 'AAPL',
    type: 'DIVIDEND',
    unitPrice: 0.24
  },

  // Aug 2023 — Buy Bitcoin
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-08-01',
    fee: 9.99,
    quantity: 0.05,
    symbol: 'BTC-USD',
    type: 'BUY',
    unitPrice: 29500.0
  },

  // Sep 2023 — DCA into NVDA (it's running up)
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-09-10',
    fee: 4.95,
    quantity: 5,
    symbol: 'NVDA',
    type: 'BUY',
    unitPrice: 450.0
  },

  // Oct 2023 — AAPL dividend Q4
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-10-15',
    fee: 0,
    quantity: 15,
    symbol: 'AAPL',
    type: 'DIVIDEND',
    unitPrice: 0.24
  },

  // Nov 2023 — Add more MSFT
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2023-11-01',
    fee: 0,
    quantity: 4,
    symbol: 'MSFT',
    type: 'BUY',
    unitPrice: 340.0
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 2024 — Rebalancing, some sells for tax testing
  // ══════════════════════════════════════════════════════════════════════════

  // Jan 2024 — Sell some AAPL (held >1 year = long-term gain)
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2024-01-15',
    fee: 4.95,
    quantity: 5,
    symbol: 'AAPL',
    type: 'SELL',
    unitPrice: 185.0
  },

  // Feb 2024 — Buy more VOO in retirement
  {
    accountId: RETIREMENT,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2024-02-01',
    fee: 0,
    quantity: 10,
    symbol: 'VOO',
    type: 'BUY',
    unitPrice: 440.0
  },

  // Mar 2024 — Sell JPM (held ~1 year, short/long boundary)
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2024-03-15',
    fee: 4.95,
    quantity: 5,
    symbol: 'JPM',
    type: 'SELL',
    unitPrice: 195.0
  },

  // Apr 2024 — AAPL dividend
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2024-04-15',
    fee: 0,
    quantity: 10,
    symbol: 'AAPL',
    type: 'DIVIDEND',
    unitPrice: 0.25
  },

  // May 2024 — Buy more NVDA (concentration building intentionally)
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2024-05-10',
    fee: 4.95,
    quantity: 8,
    symbol: 'NVDA',
    type: 'BUY',
    unitPrice: 900.0
  },

  // Jul 2024 — Sell some Bitcoin (short-term, bought Aug 2023)
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2024-07-01',
    fee: 9.99,
    quantity: 0.02,
    symbol: 'BTC-USD',
    type: 'SELL',
    unitPrice: 62000.0
  },

  // Aug 2024 — Partial AMZN sell (held >1 year = long-term)
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2024-08-01',
    fee: 4.95,
    quantity: 3,
    symbol: 'AMZN',
    type: 'SELL',
    unitPrice: 185.0
  },

  // Oct 2024 — AAPL dividend
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2024-10-15',
    fee: 0,
    quantity: 10,
    symbol: 'AAPL',
    type: 'DIVIDEND',
    unitPrice: 0.25
  },

  // Nov 2024 — Tax-loss harvest: sell VNQ at a loss
  {
    accountId: RETIREMENT,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2024-11-10',
    fee: 0,
    quantity: 10,
    symbol: 'VNQ',
    type: 'SELL',
    unitPrice: 75.0
  },

  // Dec 2024 — Year-end DCA
  {
    accountId: RETIREMENT,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2024-12-15',
    fee: 0,
    quantity: 15,
    symbol: 'BND',
    type: 'BUY',
    unitPrice: 72.0
  },
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2024-12-20',
    fee: 4.95,
    quantity: 5,
    symbol: 'AMZN',
    type: 'BUY',
    unitPrice: 195.0
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 2025 — Continued activity
  // ══════════════════════════════════════════════════════════════════════════

  // Jan 2025 — More NVDA (heavy concentration for compliance_check to flag)
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2025-01-15',
    fee: 4.95,
    quantity: 5,
    symbol: 'NVDA',
    type: 'BUY',
    unitPrice: 140.0
  },

  // Feb 2025 — Sell MSFT (short-term portion from Nov 2023 buy)
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2025-02-10',
    fee: 4.95,
    quantity: 4,
    symbol: 'MSFT',
    type: 'SELL',
    unitPrice: 410.0
  },

  // Mar 2025 — Add VEA in brokerage
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2025-03-01',
    fee: 0,
    quantity: 30,
    symbol: 'VEA',
    type: 'BUY',
    unitPrice: 48.0
  },

  // Apr 2025 — Buy more Bitcoin
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2025-04-01',
    fee: 9.99,
    quantity: 0.03,
    symbol: 'BTC-USD',
    type: 'BUY',
    unitPrice: 85000.0
  },

  // May 2025 — AAPL dividend
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2025-05-15',
    fee: 0,
    quantity: 10,
    symbol: 'AAPL',
    type: 'DIVIDEND',
    unitPrice: 0.26
  },

  // Jun 2025 — Sell small NVDA position (short-term from Jan 2025)
  {
    accountId: BROKERAGE,
    currency: 'USD',
    dataSource: 'YAHOO',
    date: '2025-06-20',
    fee: 4.95,
    quantity: 2,
    symbol: 'NVDA',
    type: 'SELL',
    unitPrice: 155.0
  }
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a Prisma Order create input from a DemoActivity.
 * Requires a map of `dataSource:symbol` → symbolProfileId.
 */
export function buildActivityCreateInput(
  activity: DemoActivity,
  profileIdMap: Map<string, string>
) {
  const profileKey = `${activity.dataSource}:${activity.symbol}`;
  const profileId = profileIdMap.get(profileKey);

  if (!profileId) {
    throw new Error(
      `No SymbolProfile ID found for ${profileKey}. Was it created?`
    );
  }

  return {
    account: {
      connect: {
        id_userId: {
          id: activity.accountId,
          userId: DEMO_USER_ID
        }
      }
    },
    currency: activity.currency,
    date: new Date(activity.date),
    fee: activity.fee,
    quantity: activity.quantity,
    SymbolProfile: {
      connect: {
        id: profileId
      }
    },
    type: activity.type as
      | 'BUY'
      | 'DIVIDEND'
      | 'FEE'
      | 'INTEREST'
      | 'LIABILITY'
      | 'SELL',
    unitPrice: activity.unitPrice,
    user: {
      connect: {
        id: DEMO_USER_ID
      }
    }
  };
}

/**
 * Compute summary stats for logging / verification.
 */
export function computeSeedStats() {
  const buyCount = DEMO_ACTIVITIES.filter((a) => a.type === 'BUY').length;
  const sellCount = DEMO_ACTIVITIES.filter((a) => a.type === 'SELL').length;
  const dividendCount = DEMO_ACTIVITIES.filter(
    (a) => a.type === 'DIVIDEND'
  ).length;

  return {
    accountCount: DEMO_ACCOUNTS.length,
    buyCount,
    dividendCount,
    sellCount,
    totalActivities: DEMO_ACTIVITIES.length,
    uniqueSymbols: new Set(DEMO_ACTIVITIES.map((a) => a.symbol)).size
  };
}
