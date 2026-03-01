#!/usr/bin/env bash
# Railway start script — runs DB migrations, seeds demo data and market
# prices, then starts the API server.
# Set as the Railway service start command:
#   bash scripts/railway-start.sh
set -euo pipefail

echo "🚀 Railway start — running migrations..."
npx prisma migrate deploy

echo "🌱 Seeding demo portfolio (idempotent)..."
npx tsx prisma/seed-demo.mts || echo "⚠️  Demo seed skipped (may already exist)"

echo "📈 Seeding market data (idempotent)..."
npx tsx prisma/seed-market-data.mts || echo "⚠️  Market data seed skipped"

echo "▶️  Starting API server..."
exec node dist/apps/api/main.js
