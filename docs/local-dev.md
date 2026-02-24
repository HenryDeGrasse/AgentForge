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

### 8. Create the first user (ADMIN)

```bash
curl -X POST http://localhost:3333/api/v1/user
```

Save the returned `authToken` — you'll need it for authenticated requests.

### 9. Import sample portfolio data

```bash
AUTH_TOKEN="<paste authToken from step 8>"

curl -X POST http://localhost:3333/api/v1/import \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "activities": [
      {"currency":"USD","dataSource":"YAHOO","date":"2023-01-15T00:00:00.000Z","fee":0,"quantity":10,"symbol":"AAPL","type":"BUY","unitPrice":150.00},
      {"currency":"USD","dataSource":"YAHOO","date":"2023-02-20T00:00:00.000Z","fee":0,"quantity":5,"symbol":"MSFT","type":"BUY","unitPrice":260.00},
      {"currency":"USD","dataSource":"YAHOO","date":"2023-03-10T00:00:00.000Z","fee":0,"quantity":20,"symbol":"VOO","type":"BUY","unitPrice":370.00},
      {"currency":"USD","dataSource":"YAHOO","date":"2023-06-01T00:00:00.000Z","fee":0,"quantity":3,"symbol":"MSFT","type":"BUY","unitPrice":335.00},
      {"currency":"USD","dataSource":"YAHOO","date":"2023-09-15T00:00:00.000Z","fee":0,"quantity":15,"symbol":"VOO","type":"BUY","unitPrice":400.00},
      {"currency":"USD","dataSource":"YAHOO","date":"2024-01-10T00:00:00.000Z","fee":0,"quantity":8,"symbol":"AAPL","type":"BUY","unitPrice":185.00},
      {"currency":"USD","dataSource":"YAHOO","date":"2024-03-01T00:00:00.000Z","fee":4.95,"quantity":2,"symbol":"AAPL","type":"SELL","unitPrice":178.00}
    ]
  }'
```

This creates a portfolio with:

- **AAPL** — 16 shares bought, 2 sold (net 16 shares across 3 txns)
- **MSFT** — 8 shares (2 buys)
- **VOO** — 35 shares (2 buys)

### 10. (Optional) Start the Angular client

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
