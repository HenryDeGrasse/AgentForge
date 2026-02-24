# AgentForge — Local Development Setup

## Prerequisites

- **Docker Desktop** (with Docker Compose v2)
- **Node.js ≥ 22.18.0** (use `nvm` to manage versions)
- **Git**

## Quick Start

### 1. Clone the Ghostfolio fork

```bash
cd /path/to/AgentForge
git clone --depth 1 https://github.com/ghostfolio/ghostfolio.git ghostfolio
cd ghostfolio
```

### 2. Create `.env` from template

```bash
cp .env.dev .env
```

Edit `.env` and replace all placeholder values:

| Placeholder                                  | Replace with           |
| -------------------------------------------- | ---------------------- |
| `<INSERT_REDIS_PASSWORD>`                    | `openssl rand -hex 16` |
| `<INSERT_POSTGRES_PASSWORD>`                 | `openssl rand -hex 16` |
| `<INSERT_RANDOM_STRING>` (ACCESS_TOKEN_SALT) | `openssl rand -hex 32` |
| `<INSERT_RANDOM_STRING>` (JWT_SECRET_KEY)    | `openssl rand -hex 32` |

> **Important:** The `DATABASE_URL` uses `${POSTGRES_USER}` and `${POSTGRES_PASSWORD}` variable interpolation — make sure `POSTGRES_PASSWORD` is set above it in the file.

### 3. Start PostgreSQL + Redis

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

Verify both are healthy:

```bash
docker ps --filter "name=gf-" --format "table {{.Names}}\t{{.Status}}"
```

Expected:

```
NAMES             STATUS
gf-postgres-dev   Up X seconds (healthy)
gf-redis-dev      Up X seconds (healthy)
```

### 4. Install dependencies

```bash
nvm use 22    # Ghostfolio requires Node ≥ 22.18.0
npm install
```

### 5. Initialize the database

```bash
npm run database:setup   # pushes Prisma schema + seeds default tags
```

This creates all tables and seeds 2 default tags (`EMERGENCY_FUND`, `EXCLUDE_FROM_ANALYSIS`).

### 6. Build and start the API server

```bash
# Build once
npx nx run api:copy-assets
npx nx run api:build

# Start
node dist/apps/api/main.js
```

Or for watch-mode development:

```bash
npm run start:server
```

### 7. Verify health

```bash
curl http://localhost:3333/api/v1/health
# → {"status":"OK"}
```

### 8. Seed the demo portfolio

```bash
./dev.sh seed
```

This runs `prisma/seed-demo.mts` which creates:

- **1 demo user** (ADMIN) with 2 accounts (Brokerage + Retirement IRA)
- **10 symbol profiles** with sectors, countries, and asset class metadata:
  - Equities: AAPL, MSFT, NVDA, AMZN, JPM
  - ETFs: VOO (S&P 500), BND (bonds), VNQ (real estate), VEA (international)
  - Crypto: BTC-USD
- **35+ transactions** spanning 2023–2025 (BUY, SELL, DIVIDEND)
- **Benchmark**: VOO configured as S&P 500 benchmark

The seed is **idempotent** — safe to re-run.

> **Manual alternative:** If you prefer to create a user via the API instead,
> use `curl -X POST http://localhost:3333/api/v1/user` and save the returned
> `authToken` for authenticated requests.

### 9. (Optional) Start the Angular client

```bash
npm run start:client
```

Open https://localhost:4200/en in your browser.

---

## Troubleshooting

### `HTMLTemplateMiddleware` error on server start

This is **expected** when running the API without building the client. The API still works fine — this error just means the Angular SPA files aren't present in `dist/apps/client/`.

### `yahoo-finance2 Unsupported environment` warning

Harmless if you're on Node 22+. If you see this, check that `nvm use 22` is active in the current shell.

### Port conflicts

- PostgreSQL: `5432` — change via `POSTGRES_PORT` env var
- Redis: `6379` — change via `REDIS_PORT` env var
- API: `3333` — change via `PORT` env var

### Database GUI

```bash
npm run database:gui   # opens Prisma Studio on http://localhost:5555
```

### Reset everything

```bash
docker compose -f docker/docker-compose.dev.yml down -v   # destroys DB volume
docker compose -f docker/docker-compose.dev.yml up -d
npm run database:setup
```

---

## Key Endpoints

| Endpoint                     | Method | Auth   | Description                 |
| ---------------------------- | ------ | ------ | --------------------------- |
| `/api/v1/health`             | GET    | No     | Health check                |
| `/api/v1/user`               | POST   | No     | Create user (first = ADMIN) |
| `/api/v1/auth/anonymous`     | POST   | No     | Get JWT from access token   |
| `/api/v1/import`             | POST   | Bearer | Import activities           |
| `/api/v1/portfolio/holdings` | GET    | Bearer | List holdings               |
| `/api/v1/portfolio/details`  | GET    | Bearer | Portfolio details           |
| `/api/v1/order`              | GET    | Bearer | List orders/transactions    |

## Stack Summary

| Component | Technology          | Port |
| --------- | ------------------- | ---- |
| API       | NestJS (TypeScript) | 3333 |
| Database  | PostgreSQL 15       | 5432 |
| Cache     | Redis Alpine        | 6379 |
| Client    | Angular (dev)       | 4200 |
| ORM       | Prisma              | —    |
| Monorepo  | Nx                  | —    |
