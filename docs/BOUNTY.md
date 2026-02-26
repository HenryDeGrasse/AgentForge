# Ghostfolio AgentForge Bounty: Portfolio-Aware Insider Monitoring

## Customer niche

**Active, alpha-seeking retail investors** (and small independent analysts) using Ghostfolio to track their portfolios. They want insider buying/selling signals on their actual holdings without leaving the app.

## Problem

Users context-switch to external websites to answer:

- “Are insiders selling my top holdings?”
- “Is management buying enough to matter, or is it noise?”
- “Which of my holdings have recent insider activity above $X?”

## Solution

Add an **Insider Monitoring** capability to Ghostfolio:

- Integrate a real insider transactions data source into the app.
- Cache and normalize transactions for repeatable, fast querying.
- Let the AI agent **fetch insider activity and manage monitoring rules** via tools.
- Run monitoring rules deterministically at chat start and show a visible **Monitoring Briefing** (no cron/email required).

## Features

1. **Insider Activity Lookup (Portfolio-aware)**
   - Query insider buys/sells for a list of symbols or the user’s top holdings.
2. **Monitoring Rules (Agent CRUD + stateful lifecycle)**
   - Agent can create/list/update/delete rules like:
     - “Notify me if any insider sells > $100k in my top 3 holdings.”
   - Rules track `lastCheckedAt`, `lastNotifiedAt`, and `agentNotes`.
3. **Deterministic Session Briefing**
   - On chat start, rules are evaluated; if triggers exist, the agent opens with a short briefing.

## Data source

- Primary: **EDGAR-derived JSON provider** (e.g., sec-api.io Form 4 endpoints).
- Fallback: Finnhub insider transactions (JSON).
- Each record is normalized and cached in `InsiderTransaction` to reduce rate-limit risk and keep demos repeatable.

## App API integration

New endpoints:

- `GET /api/v1/insider/activity`
- `GET /api/v1/insider/activity/portfolio`
- `POST /api/v1/insider/rules`
- `GET /api/v1/insider/rules`
- `PATCH /api/v1/insider/rules/:id`
- `DELETE /api/v1/insider/rules/:id`

## Stateful storage + agent CRUD

Prisma models:

- `InsiderTransaction` (cached events)
- `InsiderMonitoringRule` (user-scoped rules with lifecycle fields)
  Agent tools:
- `get_insider_activity`
- `create_insider_monitoring_rule`
- `list_insider_monitoring_rules`
- `update_insider_monitoring_rule`
- `delete_insider_monitoring_rule`

## Reliability: evals, observability, verification

- **Evals:** deterministic fast-tier cases for insider activity, unknown tickers, CRUD flow, briefing injection.
- **Observability:** run logs capture tool usage, provider latency, cache hit/miss, and guardrails; optional tracing dashboard screenshot below.

### Observability screenshots

- _(Add screenshot of trace dashboard / run logs here)_

## Impact

- Eliminates tab-switching for insider checks.
- Turns insider activity into portfolio-relevant insight.
- Makes Ghostfolio more “actionable” for active investors.

## Demo flow (60 seconds)

1. “Create a monitoring rule: alert me if insiders sell > $100k in my top 3 holdings.”
2. Agent creates rule (tool CRUD).
3. Start a new conversation → agent opens with Monitoring Briefing.
4. “Show me details for NVDA and link the source.”
5. Agent calls `get_insider_activity`, returns list + links.
