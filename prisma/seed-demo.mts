/**
 * Demo portfolio seed script for AgentForge.
 *
 * Creates a realistic portfolio with 10 symbols, 2 accounts, and 35+ transactions
 * spanning 2023–2025 for development, demos, and AI tool testing.
 *
 * Usage:
 *   npx tsx prisma/seed-demo.mts
 *
 * Idempotent — safe to re-run. Uses upserts for user/accounts/profiles
 * and skips duplicate activities.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Fixed IDs (must match seed-demo-data.ts) ────────────────────────────────

const DEMO_USER_ID = 'd6e4f1a0-b8c3-4e7f-9a2d-1c5e8f3b7d40';

const DEMO_ACCOUNTS = [
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

const DEMO_SYMBOL_PROFILES = [
  {
    assetClass: 'EQUITY' as const,
    assetSubClass: 'STOCK' as const,
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO' as const,
    name: 'Apple Inc.',
    sectors: [{ name: 'Technology', weight: 1 }],
    symbol: 'AAPL'
  },
  {
    assetClass: 'EQUITY' as const,
    assetSubClass: 'STOCK' as const,
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO' as const,
    name: 'Microsoft Corporation',
    sectors: [{ name: 'Technology', weight: 1 }],
    symbol: 'MSFT'
  },
  {
    assetClass: 'EQUITY' as const,
    assetSubClass: 'STOCK' as const,
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO' as const,
    name: 'NVIDIA Corporation',
    sectors: [{ name: 'Technology', weight: 1 }],
    symbol: 'NVDA'
  },
  {
    assetClass: 'EQUITY' as const,
    assetSubClass: 'STOCK' as const,
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO' as const,
    name: 'Amazon.com Inc.',
    sectors: [
      { name: 'Consumer Cyclical', weight: 0.5 },
      { name: 'Technology', weight: 0.5 }
    ],
    symbol: 'AMZN'
  },
  {
    assetClass: 'EQUITY' as const,
    assetSubClass: 'STOCK' as const,
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO' as const,
    name: 'JPMorgan Chase & Co.',
    sectors: [{ name: 'Financial Services', weight: 1 }],
    symbol: 'JPM'
  },
  {
    assetClass: 'EQUITY' as const,
    assetSubClass: 'ETF' as const,
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO' as const,
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
    assetClass: 'FIXED_INCOME' as const,
    assetSubClass: 'ETF' as const,
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO' as const,
    name: 'Vanguard Total Bond Market ETF',
    sectors: [],
    symbol: 'BND'
  },
  {
    assetClass: 'REAL_ESTATE' as const,
    assetSubClass: 'ETF' as const,
    countries: [
      {
        code: 'US',
        continent: 'North America',
        name: 'United States',
        weight: 1
      }
    ],
    currency: 'USD',
    dataSource: 'YAHOO' as const,
    name: 'Vanguard Real Estate ETF',
    sectors: [{ name: 'Real Estate', weight: 1 }],
    symbol: 'VNQ'
  },
  {
    assetClass: 'LIQUIDITY' as const,
    assetSubClass: 'CRYPTOCURRENCY' as const,
    countries: [],
    currency: 'USD',
    dataSource: 'YAHOO' as const,
    name: 'Bitcoin USD',
    sectors: [],
    symbol: 'BTC-USD'
  },
  {
    assetClass: 'EQUITY' as const,
    assetSubClass: 'ETF' as const,
    countries: [
      { code: 'JP', continent: 'Asia', name: 'Japan', weight: 0.16 },
      { code: 'GB', continent: 'Europe', name: 'United Kingdom', weight: 0.1 },
      { code: 'FR', continent: 'Europe', name: 'France', weight: 0.09 },
      { code: 'CH', continent: 'Europe', name: 'Switzerland', weight: 0.08 },
      { code: 'DE', continent: 'Europe', name: 'Germany', weight: 0.07 }
    ],
    currency: 'USD',
    dataSource: 'YAHOO' as const,
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

interface Activity {
  accountId: string;
  currency: string;
  dataSource: string;
  date: string;
  fee: number;
  quantity: number;
  symbol: string;
  type: 'BUY' | 'DIVIDEND' | 'SELL';
  unitPrice: number;
}

const BROKERAGE = DEMO_ACCOUNTS[0].id;
const RETIREMENT = DEMO_ACCOUNTS[1].id;

const DEMO_ACTIVITIES: Activity[] = [
  // 2023 — Initial build-up
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

  // 2024 — Rebalancing + sells for tax testing
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

  // 2025 — Continued activity
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

// ─── Main seed logic ─────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 AgentForge demo seed starting...\n');

  // 1. Create or find demo user
  const user = await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {},
    create: {
      id: DEMO_USER_ID,
      provider: 'ANONYMOUS',
      role: 'ADMIN'
    }
  });
  console.log(`✅ User: ${user.id} (role: ${user.role})`);

  // 2. Create user settings (baseCurrency = USD)
  await prisma.settings.upsert({
    where: { userId: DEMO_USER_ID },
    update: {},
    create: {
      userId: DEMO_USER_ID,
      settings: { baseCurrency: 'USD' }
    }
  });
  console.log('✅ User settings: baseCurrency=USD');

  // 3. Create accounts
  for (const account of DEMO_ACCOUNTS) {
    await prisma.account.upsert({
      where: {
        id_userId: {
          id: account.id,
          userId: DEMO_USER_ID
        }
      },
      update: {},
      create: {
        id: account.id,
        name: account.name,
        currency: account.currency,
        userId: DEMO_USER_ID
      }
    });
    console.log(`✅ Account: ${account.name} (${account.id})`);
  }

  // 4. Create symbol profiles (upsert on dataSource+symbol unique constraint)
  const profileIdMap = new Map<string, string>();

  for (const profile of DEMO_SYMBOL_PROFILES) {
    const existing = await prisma.symbolProfile.findUnique({
      where: {
        dataSource_symbol: {
          dataSource: profile.dataSource,
          symbol: profile.symbol
        }
      }
    });

    if (existing) {
      // Update metadata fields that may have been empty
      await prisma.symbolProfile.update({
        where: { id: existing.id },
        data: {
          assetClass: profile.assetClass,
          assetSubClass: profile.assetSubClass,
          countries: profile.countries,
          name: profile.name,
          sectors: profile.sectors
        }
      });
      profileIdMap.set(`${profile.dataSource}:${profile.symbol}`, existing.id);
      console.log(
        `✅ SymbolProfile (updated): ${profile.symbol} → ${existing.id}`
      );
    } else {
      const created = await prisma.symbolProfile.create({
        data: {
          assetClass: profile.assetClass,
          assetSubClass: profile.assetSubClass,
          countries: profile.countries,
          currency: profile.currency,
          dataSource: profile.dataSource,
          name: profile.name,
          sectors: profile.sectors,
          symbol: profile.symbol
        }
      });
      profileIdMap.set(`${profile.dataSource}:${profile.symbol}`, created.id);
      console.log(
        `✅ SymbolProfile (created): ${profile.symbol} → ${created.id}`
      );
    }
  }

  // 5. Create activities (orders)
  let createdCount = 0;
  let skippedCount = 0;

  for (const activity of DEMO_ACTIVITIES) {
    const profileKey = `${activity.dataSource}:${activity.symbol}`;
    const symbolProfileId = profileIdMap.get(profileKey);

    if (!symbolProfileId) {
      console.warn(`⚠️  No profile for ${profileKey}, skipping activity`);
      skippedCount++;
      continue;
    }

    // Check for existing order with same date + symbol + type + quantity
    // to make the script idempotent
    const existing = await prisma.order.findFirst({
      where: {
        userId: DEMO_USER_ID,
        symbolProfileId,
        date: new Date(activity.date),
        type: activity.type,
        quantity: activity.quantity
      }
    });

    if (existing) {
      skippedCount++;
      continue;
    }

    await prisma.order.create({
      data: {
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
          connect: { id: symbolProfileId }
        },
        type: activity.type,
        unitPrice: activity.unitPrice,
        user: {
          connect: { id: DEMO_USER_ID }
        }
      }
    });
    createdCount++;
  }

  console.log(
    `\n✅ Activities: ${createdCount} created, ${skippedCount} skipped (already exist)`
  );

  // 6. Configure benchmark (VOO as S&P 500 proxy)
  const vooProfile = await prisma.symbolProfile.findUnique({
    where: {
      dataSource_symbol: {
        dataSource: 'YAHOO',
        symbol: 'VOO'
      }
    }
  });

  if (vooProfile) {
    const benchmarkValue = JSON.stringify([{ symbolProfileId: vooProfile.id }]);

    await prisma.property.upsert({
      where: { key: 'BENCHMARKS' },
      update: { value: benchmarkValue },
      create: { key: 'BENCHMARKS', value: benchmarkValue }
    });
    console.log(`✅ Benchmark configured: VOO (${vooProfile.id})`);
  }

  // 7. Print summary
  const orderCount = await prisma.order.count({
    where: { userId: DEMO_USER_ID }
  });
  const profileCount = await prisma.symbolProfile.count();

  console.log('\n────────────────────────────────────────');
  console.log('📊 Demo Portfolio Summary');
  console.log('────────────────────────────────────────');
  console.log(`   User:            ${DEMO_USER_ID}`);
  console.log(`   Accounts:        ${DEMO_ACCOUNTS.length}`);
  console.log(`   Symbol Profiles: ${profileCount}`);
  console.log(`   Activities:      ${orderCount}`);
  console.log(`   Benchmark:       VOO (S&P 500)`);
  console.log('────────────────────────────────────────');
  console.log('\n🎉 Demo seed complete! Start the API and try:');
  console.log('   curl http://localhost:3333/api/v1/ai/chat \\');
  console.log('     -H "Authorization: Bearer <token>" \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"prompt": "What is my portfolio allocation?"}\'');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Demo seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
