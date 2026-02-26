# AgentForge Bounty Add-on Plan: Portfolio-Aware Insider Monitoring for Ghostfolio

This document is an implementation plan you can commit to the repo to start building the $500 AgentForge bounty add-on.

**Bounty hard requirements (mapped):**

- **New relevant data source** (insider transactions) integrated into Ghostfolio’s problem space.
- **Agent accesses the data source through the app’s API** (new `/api/v1/insider/*` endpoints + agent tools).
- **Stateful data stored in the app + CRUD operations used by the agent** (cached transactions + user monitoring rules).
- **Reliable agent** with **evals, observability, verification** (fast-tier deterministic evals, run logs, optional tracing dashboard).  
  (See `AgentForge_Bounty.pdf` for rubric.)

---

## 1) Customer niche and why Ghostfolio fits

### Target niche (explicit persona)

**Active, alpha-seeking retail investors** (and small “solo RIA” analysts) who:

- Track their real holdings and allocation in Ghostfolio.
- Regularly check insider buying/selling as a sentiment signal.
- Currently context-switch to external sites (SEC/EDGAR, OpenInsider, etc.) and manually match filings to their holdings.

### Pain

- “Did executives just dump my top holdings?”
- “Is the CEO buying meaningfully, or is it noise?”
- “How do insider trades relate to my portfolio concentration risk?”

### Why this is native to Ghostfolio

Ghostfolio already knows:

- Your holdings, weights, exposure, currency context.
- Your portfolio concentration and “top holdings” list.
  So the app can translate _insider activity_ into _portfolio-relevant_ insight without tab-switching.

---

## 2) Feature summary (“obviously working” in a demo)

### Rename “Alerts” → **Monitoring Rules + Session Briefing**

Avoid “dead alerts” that require a cron + notification channel.

**Deterministic execution:**

- Monitoring rules are evaluated automatically when a chat session starts (or on first chat message in a conversation).
- If anything triggers, the agent begins with a short **Monitoring Briefing** before answering the user’s question.
- No background jobs required to prove end-to-end value.

**State updates make it real:**

- Rules track `lastCheckedAt`, `lastNotifiedAt`, and `agentNotes` so the system has visible lifecycle state.

---

## 3) Data source strategy (credible + low risk)

### Provider abstraction

EDGAR Form 4 XML parsing is a time trap. Implement a provider interface so the core system is stable regardless of source.

```ts
export interface InsiderDataProvider {
  name: 'sec_api' | 'finnhub';
  fetchInsiderTransactions(params: {
    symbols: string[];
    from: string; // YYYY-MM-DD
    to: string; // YYYY-MM-DD
  }): Promise<NormalizedInsiderTx[]>;
}
```

### “Source of truth” credibility without XML pain

**Primary provider (recommended):** **SEC API (sec-api.io)** Form 4 endpoints that return JSON (EDGAR-derived).

- This directly answers “judge credibility” concerns: EDGAR is the source; you’re using an EDGAR-derived JSON provider.
- Avoids building a bespoke XML parser.

**Fallback provider:** **Finnhub** insider transactions endpoint (JSON, easy, free-ish).

- Useful for local dev + backup when sec-api is unavailable.

### Normalized transaction schema (what you store + return)

Store a stable, minimal representation and attach warnings when fields are missing.

```ts
export interface NormalizedInsiderTx {
  sourceKey: string; // provider-stable or computed hash
  symbol: string;
  txDate: string; // YYYY-MM-DD
  insiderName: string;
  insiderRelation?: 'officer' | 'director' | 'ten_percent_owner' | 'unknown';
  side: 'buy' | 'sell' | 'other';
  shares?: number | null;
  price?: number | null;
  valueUsd?: number | null; // shares * price when both present, else null
  sourceUrl?: string | null;
  sourceProvider: 'sec_api' | 'finnhub';
  warnings: string[]; // e.g. ['missing_price_or_shares']
}
```

Computation rule:

- `valueUsd = shares * price` **only if** both present.
- Else `valueUsd = null` and add `missing_price_or_shares`.

---

## 4) Stateful storage (Prisma models)

### 4.1 Cached transactions (repeatable + fast + supports demos/evals)

```prisma
model InsiderTransaction {
  id             String   @id @default(uuid())
  sourceKey       String   @unique
  symbol          String
  txDate          DateTime
  side            String    // 'buy'|'sell'|'other'
  insiderName     String
  insiderRelation String?
  shares          Float?
  price           Float?
  valueUsd        Float?
  sourceProvider  String
  sourceUrl       String?
  raw             Json?
  createdAt       DateTime @default(now())

  @@index([symbol, txDate])
}
```

### 4.2 User monitoring rules (agent CRUD + lifecycle)

```prisma
model InsiderMonitoringRule {
  id             String   @id @default(uuid())
  userId         String
  isActive       Boolean  @default(true)

  scope          String   // 'all_holdings' | 'symbols' | 'top_n'
  symbols        Json?    // string[]
  topN           Int?

  side           String   // 'sell' | 'buy' | 'any'
  minValueUsd    Float?
  lookbackDays   Int      @default(30)

  lastCheckedAt  DateTime?
  lastNotifiedAt DateTime?
  agentNotes     String?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([userId, updatedAt])
}
```

**Deep Ghostfolio integration (important):**

- For `scope = top_n` and `scope = all_holdings`, resolve symbols from the user’s _actual_ current portfolio (via existing portfolio service / holdings query), not just stored arrays.

---

## 5) App API surface (explicit integration point)

Even though the agent runs server-side, add explicit REST endpoints so judges can see the data source integrated into the app API.

### 5.1 Insider activity endpoints

- `GET /api/v1/insider/activity?symbols=NVDA,AAPL&days=30`
- `GET /api/v1/insider/activity/portfolio?days=30&topN=10`

Optional debug endpoint (admin/dev only):

- `POST /api/v1/insider/sync?symbols=NVDA,AAPL&days=30`

### 5.2 Monitoring rules endpoints (user-scoped CRUD)

- `POST /api/v1/insider/rules`
- `GET /api/v1/insider/rules`
- `PATCH /api/v1/insider/rules/:id`
- `DELETE /api/v1/insider/rules/:id`

---

## 6) Agent tools (schemas + “no hallucinations” policy)

### 6.1 Tools to add

Minimum set (meets rubric strongly):

1. `get_insider_activity`
2. `create_insider_monitoring_rule`
3. `list_insider_monitoring_rules`
4. `update_insider_monitoring_rule`
5. `delete_insider_monitoring_rule`

**Optional differentiator tool (recommended):** 6. `summarize_insider_signal` (deterministic “insight engine” based on heuristics)

This transforms the agent from a “data fetcher” into an “analyst” without needing extra LLM calls.

### 6.2 Tool invocation reliability (system prompt rule)

For insider questions:

- **MUST call** `get_insider_activity`.
- Do not answer from general knowledge.
- If provider returns `warnings`, surface them and include source link when present.

### 6.3 Tool schemas

Create schema constants under:

- `apps/api/src/app/endpoints/ai/tools/schemas/insider-activity.schema.ts`
- `apps/api/src/app/endpoints/ai/tools/schemas/insider-rules.schema.ts`
- export from `schemas/index.ts`

Follow the same “schema constants” pattern you adopted for existing tools to prevent drift.

---

## 7) Session briefing execution (solves the “alert execution gap”)

### 7.1 When it runs

On every `POST /ai/chat` (and `/ai/chat/stream` if streaming is enabled), before calling the agent:

1. Load active rules for user.
2. Resolve rule scope → symbols (portfolio-aware).
3. Fetch recent insider txns (prefer cache; fetch provider if cache is stale/missing).
4. Determine triggers since `lastNotifiedAt` (or within lookback window if never notified).
5. Construct a small “Monitoring Briefing” payload:
   - Top 3 triggers only
   - Summary counts (e.g., “2 sells above $100k across your top holdings”)
   - Markdown table

### 7.2 How it’s injected into the agent

Inject as a **system-side briefing message**, not user content:

- Add `sessionBriefing?: string` to `ReactAgentRunInput` (or reuse `priorMessages` but with a `system` role).
- In `ReactAgentService.run(...)`, insert a system message after the base system prompt.

Example briefing message:

```md
## Monitoring update (since your last session)

| Symbol | Insider | Side | Est. Value | Days ago |
| ------ | ------- | ---: | ---------: | -------: |
| NVDA   | CEO     | Sell |      $1.2M |        2 |
| AAPL   | CFO     |  Buy |      $180k |        4 |

If you want, ask: “Show me the details for NVDA” or “Create a rule for sells over $250k.”
```

### 7.3 Rule lifecycle state updates

After the agent completes successfully (and after chat persistence succeeds):

- Always set `lastCheckedAt = now()` for evaluated rules.
- If triggers were injected, set `lastNotifiedAt = now()` and write `agentNotes` (short summary of what was briefed).

This prevents “briefing loops” and makes state progression visible.

---

## 8) Observability (explicit, judge-friendly)

### 8.1 Always-on internal observability (no SaaS)

Add an `AiRunLog` table capturing:

- `runId`, `userId`, `conversationId`
- `invokedToolNames`
- `providerName`, `providerLatencyMs`, `cacheHitCount`, `cacheMissCount`
- `estimatedCostUsd`, `elapsedMs`
- `warnings[]`, `guardrail?`

Expose an admin/dev endpoint:

- `GET /api/v1/ai/observability/runs?limit=50`

### 8.2 Bonus: tracing dashboard screenshot

Add OpenTelemetry spans (or Helicone/LangSmith if already aligned):

- `ai.chat`
- `tool.get_insider_activity`
- `provider.fetch_insider_transactions`
- `db.insider_cache_upsert`

Ship a `docker-compose` for Jaeger (or a simple local collector) and include a screenshot in `BOUNTY.md`.

---

## 9) Evals and verification (reuse your eval system plan)

### 9.1 Fast tier (deterministic, CI-safe)

- Stub `InsiderDataProvider` returning fixed transactions.
- Add new Stage 1 golden cases in `golden-sets.json`:
  - Insider activity query (tool required)
  - Unknown symbol → partial + warning
  - Rule create/list/update/delete (user-scoped)
  - Session briefing injection shows up in response
  - “Nonsense” prompt remains rejected (scope gate still works with more tools)

### 9.2 Live tier (optional nightly, tolerant)

- If running live provider calls:
  - Assert only response shape + non-crash + warning handling.
  - Do not assert exact tx counts.

---

## 10) Demo script (60 seconds, judge-proof)

1. User: “Create a monitoring rule: alert me if any insider sells > $100k in my top 3 holdings.”
2. Agent: creates rule via CRUD tool, confirms.
3. Start a new conversation (or new first message):
   - Agent opens with “Monitoring update” (table with top 3 triggers).
4. User: “Show me details for NVDA and link the source.”
5. Agent calls `get_insider_activity`, returns structured list + source URL(s).
6. (Optional differentiator) User: “Should I worry about this?”
   - Agent calls `summarize_insider_signal` (deterministic heuristics) + explains.

---

## 11) Implementation sequence (practical)

1. **Provider interface + one provider** (`sec_api`), plus a stub provider for tests.
2. **Cache service** (upsert by `sourceKey`, query by symbol/date).
3. **Prisma migration** (transactions + monitoring rules).
4. **REST endpoints** (`/insider/activity`, `/insider/rules`).
5. **Agent tools** (schemas + ToolDefinition implementations).
6. **Session briefing injection** + rule lifecycle updates.
7. **Observability** (`AiRunLog` + endpoint; optional tracing).
8. **Evals** (fast-tier new goldens).
9. **BOUNTY.md** final write-up + screenshots + GIF.

---

## 12) File inventory (suggested)

### Backend

```
apps/api/src/app/endpoints/insider/
  insider.module.ts
  insider.controller.ts
  insider.service.ts
  providers/
    insider-data-provider.interface.ts
    sec-api.provider.ts
    finnhub.provider.ts
    stub.provider.ts   # tests only
  insider-cache.service.ts

apps/api/src/app/endpoints/ai/tools/
  get-insider-activity.tool.ts
  manage-insider-rules.tool.ts      # or split into 4 tools
  summarize-insider-signal.tool.ts  # optional

apps/api/src/app/endpoints/ai/tools/schemas/
  insider-activity.schema.ts
  insider-rules.schema.ts

apps/api/src/app/endpoints/ai/
  ai.service.ts                     # briefing injection + tool allow-list updates
  agent/agent.constants.ts          # tool allow-list + prompt rules
  observability/ai-run-log.*        # table/service/controller
```

### Prisma

```
prisma/schema.prisma
prisma/migrations/*_add_insider_monitoring/*
```

### Tests / Evals

```
apps/api/test/ai/golden-sets.json                # add insider cases
apps/api/test/ai/fixtures/tool-profiles.ts       # include insider tools if needed
apps/api/test/ai/fixtures/llm-sequences/*        # fast-tier fixtures
```

---

## 13) Acceptance criteria checklist

- [ ] New insider provider integrated and documented in `env.example`.
- [ ] Cached transactions stored in DB and served through `/api/v1/insider/activity`.
- [ ] Monitoring rules stored in DB, CRUD endpoints exist, user-scoped auth enforced.
- [ ] Agent tools use the app’s API/service layer; agent can CRUD rules.
- [ ] Session briefing reliably appears on chat start when triggers exist.
- [ ] Rule lifecycle state updates: `lastCheckedAt`, `lastNotifiedAt`, `agentNotes`.
- [ ] Observability endpoint returns recent runs with tool + provider + cache metrics.
- [ ] Deterministic fast-tier evals cover: tool enforcement, unknown symbol, CRUD, briefing.
- [ ] `BOUNTY.md` includes: customer, features, data source, impact, evals/observability screenshots/GIF.

---

## 14) Notes on scope and safety

- Insider activity is informational; include disclaimer: “Not investment advice.”
- Be explicit about data limitations (e.g., potential provider delay). Encourage verification via `sourceUrl` when available.
- Keep tool schemas strict; reject invalid symbols and unreasonable `days` inputs.
