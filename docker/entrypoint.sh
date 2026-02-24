#!/bin/sh

set -ex

# ── Parse REDIS_URL into individual vars if needed ──────────────────────────
# Railway provides a single REDIS_URL (redis://default:pass@host:port).
# Ghostfolio expects REDIS_HOST, REDIS_PORT, REDIS_PASSWORD separately.
if [ -n "$REDIS_URL" ] && [ -z "$REDIS_HOST" ]; then
  echo "Parsing REDIS_URL into REDIS_HOST, REDIS_PORT, REDIS_PASSWORD"
  export REDIS_PASSWORD=$(echo "$REDIS_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
  export REDIS_HOST=$(echo "$REDIS_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
  export REDIS_PORT=$(echo "$REDIS_URL" | sed -n 's|.*:\([0-9]*\)$|\1|p')
fi

echo "Running database migrations"
npx prisma migrate deploy

echo "Seeding the database"
npx prisma db seed

# Seed demo portfolio if DEMO_ACCESS_TOKEN is configured
if [ -n "$DEMO_ACCESS_TOKEN" ]; then
  echo "Seeding demo portfolio..."
  npx tsx prisma/seed-demo.mts
else
  echo "Skipping demo seed (DEMO_ACCESS_TOKEN not set)"
fi

echo "Starting the server"
exec node main
