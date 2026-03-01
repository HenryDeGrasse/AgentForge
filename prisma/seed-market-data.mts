/**
 * Seed historical market data for all demo portfolio symbols.
 *
 * The portfolio calculator needs daily market prices for ALL holdings to build
 * the performance chart. Without complete price history, chart entries have
 * netWorth=0 and statistical metrics (Sharpe, drawdown, VaR etc.) can't be
 * computed.
 *
 * Also seeds VBINX (Vanguard Balanced Index) as a 60/40 benchmark symbol
 * so performance_compare and analyze_risk can answer benchmark questions.
 *
 * Usage:
 *   npx tsx prisma/seed-market-data.mts
 *
 * Idempotent — uses upsert on (dataSource, date, symbol).
 * Safe to run on every dev restart and as a Railway start command.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DATA_SOURCE = 'YAHOO';
const START_DATE = new Date('2022-01-01');
const END_DATE = new Date();

// All symbols that need static price data seeded.
// Includes all demo portfolio holdings + benchmark symbols.
const ALL_DEMO_SYMBOLS = [
  'AAPL',
  'MSFT',
  'NVDA',
  'AMZN',
  'JPM',
  'VOO',
  'BND',
  'VNQ',
  'BTC-USD',
  'VEA',
  'VBINX' // 60/40 benchmark
];

const SYMBOLS_TO_BACKFILL = ALL_DEMO_SYMBOLS;

// Monthly anchor prices for interpolation.
// Sources: approximate historical closing prices (not financial advice).
const PRICE_SERIES: Record<string, { date: string; price: number }[]> = {
  'BTC-USD': [
    { date: '2022-01-03', price: 46300 },
    { date: '2022-02-01', price: 38700 },
    { date: '2022-03-01', price: 44400 },
    { date: '2022-04-01', price: 45500 },
    { date: '2022-05-02', price: 38500 },
    { date: '2022-06-01', price: 31800 },
    { date: '2022-07-01', price: 19900 },
    { date: '2022-08-01', price: 23300 },
    { date: '2022-09-01', price: 20100 },
    { date: '2022-10-03', price: 19400 },
    { date: '2022-11-01', price: 20500 },
    { date: '2022-12-01', price: 17200 },
    { date: '2023-01-03', price: 16600 },
    { date: '2023-02-01', price: 23100 },
    { date: '2023-03-01', price: 23400 },
    { date: '2023-04-03', price: 28400 },
    { date: '2023-05-01', price: 29200 },
    { date: '2023-06-01', price: 27200 },
    { date: '2023-07-03', price: 30600 },
    { date: '2023-08-01', price: 29200 },
    { date: '2023-09-01', price: 25900 },
    { date: '2023-10-02', price: 27000 },
    { date: '2023-11-01', price: 34700 },
    { date: '2023-12-01', price: 37700 },
    { date: '2024-01-02', price: 44200 },
    { date: '2024-02-01', price: 43000 },
    { date: '2024-03-01', price: 62400 },
    { date: '2024-04-01', price: 71300 },
    { date: '2024-05-01', price: 60600 },
    { date: '2024-06-03', price: 67500 },
    { date: '2024-07-01', price: 62700 },
    { date: '2024-08-01', price: 64600 },
    { date: '2024-09-03', price: 59000 },
    { date: '2024-10-01', price: 63300 },
    { date: '2024-11-01', price: 72300 },
    { date: '2024-12-02', price: 96400 },
    { date: '2025-01-02', price: 94800 },
    { date: '2025-02-03', price: 98000 },
    { date: '2025-03-03', price: 86500 },
    { date: '2025-04-01', price: 83200 },
    { date: '2025-05-01', price: 95400 },
    { date: '2025-06-02', price: 107000 },
    { date: '2025-07-01', price: 98900 },
    { date: '2025-08-01', price: 95500 },
    { date: '2025-09-02', price: 92000 },
    { date: '2025-10-01', price: 89500 },
    { date: '2025-11-03', price: 87400 },
    { date: '2025-12-01', price: 91200 },
    { date: '2026-01-02', price: 93600 },
    { date: '2026-02-02', price: 96100 },
    { date: '2026-03-01', price: 97500 }
  ],
  VNQ: [
    { date: '2022-01-03', price: 109.5 },
    { date: '2022-02-01', price: 105.2 },
    { date: '2022-03-01', price: 104.8 },
    { date: '2022-04-01', price: 101.3 },
    { date: '2022-05-02', price: 93.2 },
    { date: '2022-06-01', price: 91.5 },
    { date: '2022-07-01', price: 85.8 },
    { date: '2022-08-01', price: 92.1 },
    { date: '2022-09-01', price: 86.4 },
    { date: '2022-10-03', price: 78.3 },
    { date: '2022-11-01', price: 82.0 },
    { date: '2022-12-01', price: 83.5 },
    { date: '2023-01-03', price: 81.2 },
    { date: '2023-02-01', price: 84.5 },
    { date: '2023-03-01', price: 81.8 },
    { date: '2023-04-03', price: 81.0 },
    { date: '2023-05-01', price: 78.5 },
    { date: '2023-06-01', price: 80.3 },
    { date: '2023-07-03', price: 83.8 },
    { date: '2023-08-01', price: 81.2 },
    { date: '2023-09-01', price: 78.0 },
    { date: '2023-10-02', price: 74.5 },
    { date: '2023-11-01', price: 78.2 },
    { date: '2023-12-01', price: 83.5 },
    { date: '2024-01-02', price: 84.2 },
    { date: '2024-02-01', price: 82.5 },
    { date: '2024-03-01', price: 86.3 },
    { date: '2024-04-01', price: 83.8 },
    { date: '2024-05-01', price: 85.0 },
    { date: '2024-06-03', price: 87.2 },
    { date: '2024-07-01', price: 89.5 },
    { date: '2024-08-01', price: 90.8 },
    { date: '2024-09-03', price: 93.2 },
    { date: '2024-10-01', price: 89.5 },
    { date: '2024-11-01', price: 88.3 },
    { date: '2024-12-02', price: 85.2 },
    { date: '2025-01-02', price: 84.5 },
    { date: '2025-02-03', price: 86.0 },
    { date: '2025-03-03', price: 85.5 },
    { date: '2025-04-01', price: 84.0 },
    { date: '2025-05-01', price: 86.5 },
    { date: '2025-06-02', price: 88.0 },
    { date: '2025-07-01', price: 87.5 },
    { date: '2025-08-01', price: 86.0 },
    { date: '2025-09-02', price: 85.0 },
    { date: '2025-10-01', price: 86.5 },
    { date: '2025-11-03', price: 87.0 },
    { date: '2025-12-01', price: 88.0 },
    { date: '2026-01-02', price: 87.5 },
    { date: '2026-02-02', price: 88.5 },
    { date: '2026-03-01', price: 89.0 }
  ],
  VOO: [
    { date: '2022-01-03', price: 430.0 },
    { date: '2022-04-01', price: 394.0 },
    { date: '2022-07-01', price: 352.0 },
    { date: '2022-10-03', price: 326.0 },
    { date: '2023-01-03', price: 353.0 },
    { date: '2023-04-03', price: 382.0 },
    { date: '2023-07-03', price: 413.0 },
    { date: '2023-10-02', price: 392.0 },
    { date: '2024-01-02', price: 437.0 },
    { date: '2024-04-01', price: 487.0 },
    { date: '2024-07-01', price: 513.0 },
    { date: '2024-10-01', price: 521.0 },
    { date: '2025-01-02', price: 546.0 },
    { date: '2025-04-01', price: 498.0 },
    { date: '2025-07-01', price: 532.0 },
    { date: '2025-10-01', price: 545.0 },
    { date: '2026-01-02', price: 538.0 },
    { date: '2026-03-01', price: 524.0 }
  ],
  AAPL: [
    { date: '2022-01-03', price: 182.0 },
    { date: '2022-04-01', price: 178.0 },
    { date: '2022-07-01', price: 138.0 },
    { date: '2022-10-03', price: 138.0 },
    { date: '2023-01-03', price: 126.0 },
    { date: '2023-04-03', price: 165.0 },
    { date: '2023-07-03', price: 192.0 },
    { date: '2023-10-02', price: 174.0 },
    { date: '2024-01-02', price: 186.0 },
    { date: '2024-04-01', price: 171.0 },
    { date: '2024-07-01', price: 220.0 },
    { date: '2024-10-01', price: 226.0 },
    { date: '2025-01-02', price: 243.0 },
    { date: '2025-04-01', price: 203.0 },
    { date: '2025-07-01', price: 215.0 },
    { date: '2025-10-01', price: 228.0 },
    { date: '2026-01-02', price: 237.0 },
    { date: '2026-03-01', price: 241.0 }
  ],
  MSFT: [
    { date: '2022-01-03', price: 336.0 },
    { date: '2022-04-01', price: 308.0 },
    { date: '2022-07-01', price: 258.0 },
    { date: '2022-10-03', price: 232.0 },
    { date: '2023-01-03', price: 240.0 },
    { date: '2023-04-03', price: 288.0 },
    { date: '2023-07-03', price: 340.0 },
    { date: '2023-10-02', price: 315.0 },
    { date: '2024-01-02', price: 374.0 },
    { date: '2024-04-01', price: 420.0 },
    { date: '2024-07-01', price: 446.0 },
    { date: '2024-10-01', price: 430.0 },
    { date: '2025-01-02', price: 422.0 },
    { date: '2025-04-01', price: 388.0 },
    { date: '2025-07-01', price: 410.0 },
    { date: '2025-10-01', price: 435.0 },
    { date: '2026-01-02', price: 442.0 },
    { date: '2026-03-01', price: 398.0 }
  ],
  NVDA: [
    { date: '2022-01-03', price: 294.0 },
    { date: '2022-04-01', price: 240.0 },
    { date: '2022-07-01', price: 155.0 },
    { date: '2022-10-03', price: 112.0 },
    { date: '2023-01-03', price: 146.0 },
    { date: '2023-04-03', price: 277.0 },
    { date: '2023-07-03', price: 432.0 },
    { date: '2023-10-02', price: 435.0 },
    { date: '2024-01-02', price: 495.0 },
    { date: '2024-04-01', price: 880.0 },
    { date: '2024-07-01', price: 1208.0 },
    { date: '2024-10-01', price: 121.0 }, // post 10:1 split
    { date: '2025-01-02', price: 138.0 },
    { date: '2025-04-01', price: 88.0 },
    { date: '2025-07-01', price: 118.0 },
    { date: '2025-10-01', price: 132.0 },
    { date: '2026-01-02', price: 128.0 },
    { date: '2026-03-01', price: 115.0 }
  ],
  AMZN: [
    { date: '2022-01-03', price: 170.0 },
    { date: '2022-04-01', price: 155.0 },
    { date: '2022-07-01', price: 107.0 },
    { date: '2022-10-03', price: 113.0 },
    { date: '2023-01-03', price: 85.0 },
    { date: '2023-04-03', price: 104.0 },
    { date: '2023-07-03', price: 131.0 },
    { date: '2023-10-02', price: 127.0 },
    { date: '2024-01-02', price: 153.0 },
    { date: '2024-04-01', price: 182.0 },
    { date: '2024-07-01', price: 193.0 },
    { date: '2024-10-01', price: 196.0 },
    { date: '2025-01-02', price: 224.0 },
    { date: '2025-04-01', price: 188.0 },
    { date: '2025-07-01', price: 202.0 },
    { date: '2025-10-01', price: 212.0 },
    { date: '2026-01-02', price: 218.0 },
    { date: '2026-03-01', price: 210.0 }
  ],
  JPM: [
    { date: '2022-01-03', price: 166.0 },
    { date: '2022-04-01', price: 130.0 },
    { date: '2022-07-01', price: 114.0 },
    { date: '2022-10-03', price: 112.0 },
    { date: '2023-01-03', price: 134.0 },
    { date: '2023-04-03', price: 130.0 },
    { date: '2023-07-03', price: 152.0 },
    { date: '2023-10-02', price: 145.0 },
    { date: '2024-01-02', price: 170.0 },
    { date: '2024-04-01', price: 199.0 },
    { date: '2024-07-01', price: 210.0 },
    { date: '2024-10-01', price: 223.0 },
    { date: '2025-01-02', price: 246.0 },
    { date: '2025-04-01', price: 228.0 },
    { date: '2025-07-01', price: 242.0 },
    { date: '2025-10-01', price: 255.0 },
    { date: '2026-01-02', price: 258.0 },
    { date: '2026-03-01', price: 248.0 }
  ],
  BND: [
    { date: '2022-01-03', price: 77.0 },
    { date: '2022-04-01', price: 73.5 },
    { date: '2022-07-01', price: 71.0 },
    { date: '2022-10-03', price: 68.5 },
    { date: '2023-01-03', price: 73.0 },
    { date: '2023-04-03', price: 74.0 },
    { date: '2023-07-03', price: 72.5 },
    { date: '2023-10-02', price: 70.0 },
    { date: '2024-01-02', price: 73.5 },
    { date: '2024-04-01', price: 71.0 },
    { date: '2024-07-01', price: 74.5 },
    { date: '2024-10-01', price: 73.0 },
    { date: '2025-01-02', price: 74.5 },
    { date: '2025-04-01', price: 76.0 },
    { date: '2025-07-01', price: 75.5 },
    { date: '2025-10-01', price: 74.8 },
    { date: '2026-01-02', price: 75.2 },
    { date: '2026-03-01', price: 75.8 }
  ],
  VEA: [
    { date: '2022-01-03', price: 48.5 },
    { date: '2022-04-01', price: 44.8 },
    { date: '2022-07-01', price: 39.5 },
    { date: '2022-10-03', price: 37.2 },
    { date: '2023-01-03', price: 43.5 },
    { date: '2023-04-03', price: 46.8 },
    { date: '2023-07-03', price: 48.2 },
    { date: '2023-10-02', price: 44.5 },
    { date: '2024-01-02', price: 47.8 },
    { date: '2024-04-01', price: 50.2 },
    { date: '2024-07-01', price: 51.5 },
    { date: '2024-10-01', price: 48.8 },
    { date: '2025-01-02', price: 50.5 },
    { date: '2025-04-01', price: 54.2 },
    { date: '2025-07-01', price: 55.8 },
    { date: '2025-10-01', price: 54.5 },
    { date: '2026-01-02', price: 55.2 },
    { date: '2026-03-01', price: 56.0 }
  ],
  // Vanguard Balanced Index Fund — 60% stocks / 40% bonds (the classic 60/40 benchmark)
  VBINX: [
    { date: '2022-01-03', price: 43.5 },
    { date: '2022-04-01', price: 40.2 },
    { date: '2022-07-01', price: 35.8 },
    { date: '2022-10-03', price: 33.5 },
    { date: '2023-01-03', price: 36.8 },
    { date: '2023-04-03', price: 39.5 },
    { date: '2023-07-03', price: 41.8 },
    { date: '2023-10-02', price: 39.2 },
    { date: '2024-01-02', price: 43.5 },
    { date: '2024-04-01', price: 46.2 },
    { date: '2024-07-01', price: 48.5 },
    { date: '2024-10-01', price: 47.8 },
    { date: '2025-01-02', price: 50.2 },
    { date: '2025-04-01', price: 46.8 },
    { date: '2025-07-01', price: 49.5 },
    { date: '2025-10-01', price: 51.2 },
    { date: '2026-01-02', price: 50.8 },
    { date: '2026-03-01', price: 49.5 }
  ]
};

/**
 * Interpolate daily prices between monthly anchor points.
 * Adds ±0.5% noise to make the series look realistic.
 */
function interpolateDailyPrices(
  anchors: { date: string; price: number }[],
  start: Date,
  end: Date
): { date: Date; price: number }[] {
  const sorted = [...anchors].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const result: { date: Date; price: number }[] = [];
  const current = new Date(start);

  while (current <= end) {
    // Skip weekends (markets closed)
    const dow = current.getDay();

    if (dow === 0 || dow === 6) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    const currentTime = current.getTime();
    let before = sorted[0];
    let after = sorted[sorted.length - 1];

    for (let i = 0; i < sorted.length - 1; i++) {
      const aTime = new Date(sorted[i].date).getTime();
      const bTime = new Date(sorted[i + 1].date).getTime();

      if (currentTime >= aTime && currentTime <= bTime) {
        before = sorted[i];
        after = sorted[i + 1];
        break;
      }
    }

    const beforeTime = new Date(before.date).getTime();
    const afterTime = new Date(after.date).getTime();
    let price: number;

    if (afterTime === beforeTime) {
      price = before.price;
    } else {
      const t = (currentTime - beforeTime) / (afterTime - beforeTime);
      price = before.price + t * (after.price - before.price);
    }

    // ±0.5% daily noise for realism
    const noise = 1 + (Math.random() - 0.5) * 0.01;
    price = Math.round(price * noise * 100) / 100;

    result.push({ date: new Date(current), price });
    current.setDate(current.getDate() + 1);
  }

  return result;
}

async function needsBackfill(symbol: string): Promise<boolean> {
  const count = await prisma.marketData.count({
    where: { symbol, dataSource: DATA_SOURCE }
  });
  // Require at least 500 rows (~2 years of trading days) — re-seed if short
  return count < 500;
}

async function main() {
  console.log('📈 Market data seed starting...\n');

  // Status check
  for (const symbol of ALL_DEMO_SYMBOLS) {
    const count = await prisma.marketData.count({
      where: { symbol, dataSource: DATA_SOURCE }
    });
    const earliest = await prisma.marketData.findFirst({
      where: { symbol, dataSource: DATA_SOURCE },
      orderBy: { date: 'asc' },
      select: { date: true }
    });
    const latest = await prisma.marketData.findFirst({
      where: { symbol, dataSource: DATA_SOURCE },
      orderBy: { date: 'desc' },
      select: { date: true }
    });
    const status = count >= 500 ? '✅' : '⚠️ ';
    console.log(
      `${status} ${symbol.padEnd(8)} ${String(count).padStart(5)} rows  ` +
        `${earliest?.date?.toISOString()?.split('T')[0] ?? 'none'} → ` +
        `${latest?.date?.toISOString()?.split('T')[0] ?? 'none'}`
    );
  }

  // Backfill any symbol below the threshold
  let seeded = 0;

  for (const symbol of SYMBOLS_TO_BACKFILL) {
    if (!(await needsBackfill(symbol))) {
      console.log(`\n⏭️  ${symbol} already has sufficient data, skipping`);
      continue;
    }

    const anchors = PRICE_SERIES[symbol];

    if (!anchors) {
      console.warn(`\n⚠️  No price anchors defined for ${symbol}, skipping`);
      continue;
    }

    console.log(`\n🔄 Seeding ${symbol}...`);
    const rows = interpolateDailyPrices(anchors, START_DATE, END_DATE);
    console.log(`   Inserting ${rows.length} rows...`);

    for (const row of rows) {
      await prisma.marketData.upsert({
        where: {
          dataSource_date_symbol: {
            dataSource: DATA_SOURCE,
            date: row.date,
            symbol
          }
        },
        update: { marketPrice: row.price },
        create: {
          dataSource: DATA_SOURCE,
          date: row.date,
          marketPrice: row.price,
          symbol
        }
      });
    }

    console.log(`   ✅ ${symbol} done (${rows.length} rows)`);
    seeded++;
  }

  if (seeded === 0) {
    console.log(
      '\n✅ All symbols already have sufficient data. Nothing to do.'
    );
  } else {
    console.log(`\n✅ Seeded ${seeded} symbol(s).`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
