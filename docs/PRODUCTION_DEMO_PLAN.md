# Production Demo Plan

> Step-by-step guide to deploy, test, and demo AgentForge on Railway.

## Current State

- Local `main` is **6 commits ahead** of `agentforge/main` (GitHub)
- Railway auto-deploys from GitHub `main` branch
- Key unpushed changes: demo seed script, `DEMO_ACCESS_TOKEN` support,
  `DEMO_USER_ID` property for one-click "Live Demo" button

---

## Phase 1 — Push & Deploy (5 min)

### 1.1 Push to GitHub

```bash
git push agentforge main
```

Railway auto-triggers a build from the `main` branch.

### 1.2 Set Railway Environment Variables

In Railway dashboard → App service → **Variables**, add:

| Variable            | Value                                         |
| ------------------- | --------------------------------------------- |
| `DEMO_ACCESS_TOKEN` | `agentforge-demo-2026` (or any stable string) |

> All other vars (`DATABASE_URL`, `REDIS_URL`, `ACCESS_TOKEN_SALT`,
> `JWT_SECRET_KEY`, `OPENAI_API_KEY`, etc.) should already be set from the
> MVP deploy.

### 1.3 Watch the Build

Railway dashboard → App service → **Deployments** tab.

- Build takes ~5–10 min (Docker multi-stage)
- Entrypoint runs: migrations → base seed → **demo seed** → server start
- Look for `✅ Demo account registered` in deploy logs
- Healthcheck at `/api/v1/health` goes green → deploy complete

---

## Phase 2 — Verify Everything Works (5 min)

Run these checks in order. Replace `$URL` with your Railway app URL
(e.g. `https://agentforge-production.up.railway.app`).

### 2.1 Health Check

```bash
curl $URL/api/v1/health
# Expected: {"status":"OK"}
```

### 2.2 Info Endpoint (confirms demo account is wired)

```bash
curl -s $URL/api/v1/info | jq '.demoAuthToken'
# Expected: a JWT string (not null)
```

If this returns `null`, the demo seed didn't set `DEMO_USER_ID`.
Check deploy logs for errors.

### 2.3 Landing Page (confirms "Live Demo" button)

Open `$URL` in a browser.

- [x] Landing page loads
- [x] **"Live Demo"** button is visible next to "Get Started"

### 2.4 One-Click Demo Login

1. Click **"Live Demo"**
2. Should redirect to the portfolio dashboard
3. Verify you see:
   - [x] Holdings list (AAPL, MSFT, GOOGL, AMZN, NVDA, VOO, BND, VWO, GLD, BTC-USD)
   - [x] Total portfolio value > $0
   - [x] 2 accounts (Brokerage, Retirement IRA)

### 2.5 AI Chat (the main event)

Navigate to the AI chat (sidebar or `/ai/chat` route). Test these prompts:

| #   | Prompt                                     | Expected behavior                               |
| --- | ------------------------------------------ | ----------------------------------------------- |
| 1   | "What's in my portfolio?"                  | Calls `get_portfolio_summary`, lists holdings   |
| 2   | "Show my recent transactions"              | Calls `get_transaction_history`, shows trades   |
| 3   | "What are the risk flags in my portfolio?" | Calls `analyze_risk`, identifies concentrations |
| 4   | "Am I too concentrated in tech?"           | Uses tools + gives allocation analysis          |

### 2.6 Smoke Test Script (automated)

```bash
./scripts/smoke-test.sh $URL/api/v1
# Expected: 6/6 smoke tests passed ✓
```

---

## Phase 3 — Demo Walkthrough Script (for presenting)

Use this flow when demoing to an audience:

### Opening (30 sec)

> "AgentForge is an AI-powered financial advisor built on top of Ghostfolio,
> an open-source portfolio tracker. Let me show you."

### Step 1: One-Click Access (15 sec)

1. Open the app URL in browser
2. Click **"Live Demo"**
3. Show the portfolio dashboard — "This is a demo portfolio with 10 real
   tickers across stocks, bonds, crypto, and international funds."

### Step 2: AI Chat — Portfolio Overview (30 sec)

1. Open the AI chat
2. Type: **"Summarize my portfolio"**
3. Point out: "The AI called the `get_portfolio_summary` tool — it reads
   real portfolio data from the database, does the math in code, then
   explains it in natural language."

### Step 3: AI Chat — Risk Analysis (30 sec)

1. Type: **"What are the biggest risks in my portfolio?"**
2. Point out: "It called `analyze_risk` — notice it flagged tech
   concentration and single-stock risk. The numbers are computed
   deterministically, not hallucinated."

### Step 4: AI Chat — Transaction History (20 sec)

1. Type: **"Show my buy and sell activity from 2024"**
2. Point out: "It filtered transactions by date and type. This is a
   real database query, not a generated list."

### Step 5: Architecture Callout (20 sec)

> "Under the hood: custom ReAct agent loop, tools are NestJS injectables
> with typed schemas, all math is in code not the LLM, and every response
> is verified. The AI never sees raw credentials — it's scoped to the
> authenticated user."

### Closing (15 sec)

> "Five more tools are coming — market data lookup, performance comparison,
> tax estimation, compliance checks, and rebalancing suggestions.
> All open source."

---

## Troubleshooting

| Problem                          | Fix                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| No "Live Demo" button            | Check deploy logs for `✅ Demo account registered`. Verify `DEMO_ACCESS_TOKEN` env var is set in Railway.                    |
| "Live Demo" click → error        | Check `/api/v1/info` returns non-null `demoAuthToken`. JWT_SECRET_KEY may be missing.                                        |
| AI chat returns errors           | Check `OPENAI_API_KEY` is set and has credits. Check deploy logs for startup errors.                                         |
| Portfolio shows $0 / no holdings | Demo seed may have failed. Check deploy logs for seed output. Re-deploy to re-run seed.                                      |
| Build fails (OOM)                | Railway trial has limited build memory. See `docs/deploy-mvp.md` "If build fails" section for local Docker build workaround. |
| Healthcheck timeout              | DB migrations may be slow on first run. Increase `healthcheckTimeout` in `railway.toml` (currently 300s).                    |

---

## Quick Reference

| Item                 | Value                                                           |
| -------------------- | --------------------------------------------------------------- |
| GitHub remote        | `agentforge` → `git@github.com:HenryDeGrasse/AgentForge.git`    |
| Railway trigger      | Auto-deploy on push to `main`                                   |
| Demo user ID         | `d6e4f1a0-b8c3-4e7f-9a2d-1c5e8f3b7d40`                          |
| Demo portfolio       | 10 symbols, 35+ transactions, 2 accounts                        |
| Entry point          | `docker/entrypoint.sh` → migrations → seed → demo seed → server |
| Smoke test           | `./scripts/smoke-test.sh $URL/api/v1`                           |
| Local dev equivalent | `./dev.sh seed && ./dev.sh up` then visit `localhost:3333`      |
