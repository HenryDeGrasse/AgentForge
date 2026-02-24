# AgentForge MVP — Railway Deployment Guide

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Railway Project                                │
│                                                 │
│  ┌───────────────┐  ┌──────────┐  ┌──────────┐ │
│  │  App Service   │  │ Postgres │  │  Redis   │ │
│  │  (Dockerfile)  │──│ (plugin) │  │ (plugin) │ │
│  │  port $PORT    │  │  :5432   │  │  :6379   │ │
│  └───────────────┘  └──────────┘  └──────────┘ │
│         │                                       │
└─────────│───────────────────────────────────────┘
          │ public URL
          ▼
   https://<app>.up.railway.app
```

Three Railway services:

- **App** — Ghostfolio + AgentForge AI module (from Dockerfile)
- **Postgres** — Railway managed PostgreSQL plugin
- **Redis** — Railway managed Redis plugin

---

## Prerequisites

- Railway account (trial or paid)
- GitHub repo `HenryDeGrasse/AgentForge` linked to Railway
- OpenAI API key

---

## Step 1: Create Railway Project

1. Go to [railway.app/dashboard](https://railway.app/dashboard)
2. Click **New Project**
3. Select **Deploy from GitHub repo** → choose `HenryDeGrasse/AgentForge`
4. Railway will detect the repo — **do not deploy yet**, cancel the auto-deploy

## Step 2: Add Database Services

1. In the project canvas, click **+ New** → **Database** → **Add PostgreSQL**
2. Click **+ New** → **Database** → **Add Redis**
3. Wait for both to provision (takes ~30 seconds)

## Step 3: Configure the App Service

1. Click the app service (the GitHub-linked one)
2. Go to **Settings** tab:
   - **Root Directory**: set to `ghostfolio`
   - **Build Command**: leave empty (Dockerfile handles it)
   - **Watch Paths**: leave default
3. Go to **Variables** tab and add all variables listed below

## Step 4: Environment Variables

### Auto-wired from Railway plugins

| Variable         | Value                        |
| ---------------- | ---------------------------- |
| `DATABASE_URL`   | `${{Postgres.DATABASE_URL}}` |
| `REDIS_HOST`     | `${{Redis.REDISHOST}}`       |
| `REDIS_PORT`     | `${{Redis.REDISPORT}}`       |
| `REDIS_PASSWORD` | `${{Redis.REDISPASSWORD}}`   |

### Manual secrets (generate random strings for salts)

| Variable            | Value                      |
| ------------------- | -------------------------- |
| `ACCESS_TOKEN_SALT` | `<random 32+ char string>` |
| `JWT_SECRET_KEY`    | `<random 32+ char string>` |
| `HOST`              | `0.0.0.0`                  |
| `OPENAI_API_KEY`    | `sk-...` (your key)        |
| `OPENAI_MODEL`      | `gpt-4.1-mini`             |

### Optional

| Variable                        | Default | Description                                                                 |
| ------------------------------- | ------- | --------------------------------------------------------------------------- |
| `OPENAI_COST_PER_1K_TOKENS_USD` | `0.002` | Cost tracking accuracy                                                      |
| `ROOT_URL`                      | —       | Set to `https://<app>.up.railway.app` after first deploy for OIDC/callbacks |

> **Tip:** Generate random strings with: `openssl rand -hex 32`

## Step 5: Deploy

1. Set the branch to `MVP` in service settings
2. Click **Deploy** or push to the MVP branch
3. Watch the build logs — expect ~5-10 minutes for first build
4. Railway runs the healthcheck at `/api/v1/health` automatically
5. Once healthy, Railway provides a public URL

### If build fails (out of memory)

Fall back to local Docker build:

```bash
cd ghostfolio

# Build locally
docker build -t ghcr.io/henrydegrasse/agentforge:mvp .

# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u henrydegrasse --password-stdin

# Push
docker push ghcr.io/henrydegrasse/agentforge:mvp
```

Then in Railway: delete the GitHub service, click **+ New** → **Docker Image** → enter `ghcr.io/henrydegrasse/agentforge:mvp`. Re-add the same environment variables.

> **Note:** Build and deploy settings are managed via `railway.toml` (config-as-code) in the repo root. Railway reads this automatically.

---

## Step 6: Verify Deployment

### Quick health check

```bash
curl https://<app>.up.railway.app/api/v1/health
# Expected: {"status":"OK"}
```

### Full smoke test

```bash
./scripts/smoke-test.sh https://<app>.up.railway.app/api/v1
```

Expected output: 6/6 smoke tests passed.

---

## Smoke Test Checklist

| #   | Test                | Command                | Expected                             |
| --- | ------------------- | ---------------------- | ------------------------------------ |
| 1   | Health              | `GET /api/v1/health`   | `{"status":"OK"}`                    |
| 2   | Create user         | `POST /api/v1/user`    | Returns `authToken`                  |
| 3   | Import holdings     | `POST /api/v1/import`  | Returns `activities` array           |
| 4   | Portfolio summary   | `POST /api/v1/ai/chat` | `status: completed`, `toolCalls ≥ 1` |
| 5   | Transaction history | `POST /api/v1/ai/chat` | `status: completed`, `toolCalls ≥ 1` |
| 6   | Risk analysis       | `POST /api/v1/ai/chat` | `status: completed`, `toolCalls ≥ 1` |

---

## Rollback

Railway keeps every deployment as an immutable snapshot.

1. Go to the app service → **Deployments** tab
2. Find the last working deployment
3. Click **⋯** → **Rollback**
4. The previous image is restored in ~30 seconds

---

## Known Limitations (MVP)

- **No persistent user accounts** — demo users are anonymous; data lives in the DB but there's no login/password flow
- **Single instance** — no horizontal scaling; Railway runs one container
- **Cold starts** — if the container sleeps (trial plan), first request may take 10-20s
- **No HTTPS certificate customization** — Railway provides `*.up.railway.app` with auto-TLS
- **OpenAI cost** — each chat request costs ~$0.001-0.006; no billing cap beyond the agent's built-in guardrails ($0.50/request)
- **Market data for MANUAL assets** — imported MANUAL holdings use fixed `unitPrice`; no live price updates

---

## Cost Estimate (Trial)

| Resource   | Est. monthly usage | Est. cost     |
| ---------- | ------------------ | ------------- |
| App (idle) | ~720h @ 256MB      | ~$2.50        |
| Postgres   | 1GB storage        | ~$0.50        |
| Redis      | minimal            | ~$0.25        |
| **Total**  |                    | **~$3.25/mo** |

Trial gives $5 credit — sufficient for ~6 weeks of light demo usage.
