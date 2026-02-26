# Ghostfolio AgentForge Bounty: Portfolio-Aware Insider Monitoring

## Customer niche

**Active, alpha-seeking retail investors** (and small independent analysts) using Ghostfolio to track their portfolios. They want insider buying/selling signals on their actual holdings without leaving the app.

## Problem

Users context-switch to external websites to answer:

- "Are insiders selling my top holdings?"
- "Is management buying enough to matter, or is it noise?"
- "Which of my holdings have recent insider activity above $X?"

## Solution

Add an **Insider Monitoring** capability to Ghostfolio:

- Integrate a real insider transactions data source into the app.
- Cache and normalize transactions for repeatable, fast querying.
- Let the AI agent **fetch insider activity and manage monitoring rules** via tools.
- Run monitoring rules deterministically at chat start and show a visible **Monitoring Briefing** (no cron/email required).

## Features implemented

### 1. Insider Activity Lookup (Portfolio-aware)

- `get_insider_activity` tool fetches insider buys/sells for specific symbols or the user's top N holdings
- Returns insider name, relation, side (buy/sell), value, date, and source URL
- Data normalized via `NormalizedInsiderTx` interface across providers
- Cached in `InsiderTransaction` table by `sourceKey` for repeatable demos and fast re-queries
- Provider auto-selected: SEC API if `SEC_API_KEY` is set, stub data otherwise

### 2. Monitoring Rules (Agent CRUD + stateful lifecycle)

Agent tools for full rule management:

| Tool | Purpose |
|------|---------|
| `create_insider_monitoring_rule` | Create rules (scope: `all_holdings`, `symbols`, `top_n`) |
| `list_insider_monitoring_rules` | List user's rules with lifecycle state |
| `update_insider_monitoring_rule` | Modify rule config or activate/deactivate |
| `delete_insider_monitoring_rule` | Remove a rule |

Rules support:
- **Scope:** `all_holdings`, `symbols` (specific list), `top_n` (dynamic from portfolio)
- **Side:** `buy`, `sell`, `any`
- **Threshold:** `minValueUsd` filter
- **Lifecycle:** `lastCheckedAt`, `lastNotifiedAt`, `agentNotes` — prevents briefing loops

### 3. Deterministic Session Briefing

- On every `POST /ai/chat` (new conversation), active rules are evaluated synchronously
- Triggers are injected as a markdown table into the system prompt — no background jobs, no email
- Agent proactively opens with: `## Monitoring Briefing` + top 3 triggers
- Rules updated after briefing: `lastCheckedAt = now()`, `lastNotifiedAt = now()`, `agentNotes` set
- Re-notifies only on new activity after `lastNotifiedAt` — no duplicate briefings

## Data source

- **Primary:** `SecApiInsiderDataProvider` — sec-api.io Form 4 JSON endpoints
- **Fallback/stub:** `StubInsiderDataProvider` — realistic stub data for 5 symbols (NVDA, AMD, AAPL, MSFT, AMZN)
- **Selection:** automatic via `SEC_API_KEY` env var presence
- **Interface:** `InsiderDataProvider` — swap providers without changing any business logic

### Required env vars

```bash
# Optional — stub data used if not set
SEC_API_KEY=<your sec-api.io key>
```

See `.env.example` for full list.

## App API integration

New REST endpoints (all JWT-guarded, user-scoped):

```
GET  /api/v1/insider/activity?symbols=NVDA,AAPL&days=30
GET  /api/v1/insider/activity/portfolio?days=30&topN=10
POST /api/v1/insider/rules
GET  /api/v1/insider/rules
PATCH /api/v1/insider/rules/:id
DELETE /api/v1/insider/rules/:id
POST /api/v1/insider/sync?symbols=NVDA&days=30   (dev/debug)
```

## Stateful storage

Three Prisma models added:

- `InsiderTransaction` — cached, deduplicated insider filings (indexed on `[symbol, txDate]`)
- `InsiderMonitoringRule` — user-scoped rules with full lifecycle fields
- `AiRunLog` — observability table: tool names, cost, latency, guardrails per run

## Reliability: evals, observability, verification

### Evals (fast-tier, deterministic)

5 new golden-set cases in `apps/api/test/ai/golden-sets.json`:

| ID | Category | What it tests |
|----|----------|--------------|
| `insider-activity-query` | single-tool | Agent calls `get_insider_activity` for a symbol |
| `insider-unknown-symbol` | edge-case | Unknown symbol → partial result + warning |
| `insider-rule-crud` | single-tool | Agent creates a rule via tool |
| `insider-list-rules` | single-tool | Agent lists rules via tool |
| `insider-scope-gate` | scope-gate | Insider question passes scope gate, tool invoked |

### Observability

Every chat request logs to `AiRunLog`: invoked tools, estimated cost, elapsed ms, guardrail, warnings.

Admin endpoint: `GET /ai/observability/runs?limit=50`

## Impact

- Eliminates tab-switching for insider checks on active holdings
- Stateful rules + session briefing = zero-friction monitoring without email/cron infrastructure
- Provider abstraction makes it easy to swap data sources as needs evolve

## Demo flow (60 seconds)

1. "Create a monitoring rule: alert me if insiders sell > $100k in my top 3 holdings."
2. Agent creates rule via `create_insider_monitoring_rule`, confirms.
3. Start a new conversation → agent opens with **Monitoring Briefing** table (top 3 triggers).
4. "Show me details for NVDA and link the source."
5. Agent calls `get_insider_activity`, returns structured list + source URL(s).

## File inventory

```
prisma/schema.prisma                              # 3 new models

apps/api/src/app/endpoints/insider/
  insider.module.ts
  insider.controller.ts
  insider.service.ts
  insider-cache.service.ts
  providers/
    insider-data-provider.interface.ts
    sec-api.provider.ts
    stub.provider.ts

apps/api/src/app/endpoints/ai/tools/
  get-insider-activity.tool.ts
  create-insider-rule.tool.ts
  list-insider-rules.tool.ts
  update-insider-rule.tool.ts
  delete-insider-rule.tool.ts
  schemas/
    insider-activity.schema.ts
    insider-rules.schema.ts

apps/api/src/app/endpoints/ai/
  agent/agent.constants.ts     # 5 new tool names + updated system prompt
  ai.module.ts                 # tools + InsiderModule registered
  ai.service.ts                # briefing injection, observability logging, scope gate
  ai.controller.ts             # GET /ai/observability/runs

apps/api/test/ai/golden-sets.json   # 5 new insider eval cases
.env.example                        # SEC_API_KEY documented
```
