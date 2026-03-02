<div align="center">

# AgentForge

**AI-powered portfolio intelligence — built on [Ghostfolio](https://ghostfol.io)**

Built as part of the [GauntletAI](https://gauntletai.com) program.

</div>

AgentForge is a fork of [Ghostfolio](https://ghostfol.io) that adds a full AI agent layer on top of the existing wealth management platform. Users can ask natural-language questions about their portfolio and get grounded, data-driven answers powered by a ReAct agent that calls real portfolio tools.

**164 commits · 5 hardening phases · 98 eval cases · 14 AI tools · full observability**

---

## Project Deliverables

| Deliverable                  | Link                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub Repository**        | [github.com/HenryDeGrasse/AgentForge](https://github.com/HenryDeGrasse/AgentForge)                                              |
| **Agent Architecture Doc**   | [`docs/AGENT_ARCHITECTURE.md`](./docs/AGENT_ARCHITECTURE.md)                                                                    |
| **Architecture Diagrams**    | [`docs/architecture.md`](./docs/architecture.md)                                                                                |
| **Pre-Search Document**      | [`docs/AgentForge_PreSearch_Document_FINAL.md`](./docs/AgentForge_PreSearch_Document_FINAL.md)                                  |
| **AI Cost Analysis**         | Included in [Agent Architecture Doc](./docs/AGENT_ARCHITECTURE.md) — dev spend + projections for 100–100k users                 |
| **Eval Dataset**             | 98 test cases across 3 datasets — see [Eval Framework](#eval-framework)                                                         |
| **Eval Results**             | [`docs/AI_EVAL_RESULTS.md`](./docs/AI_EVAL_RESULTS.md)                                                                          |
| **Open Source Eval Dataset** | [`@agentforge/finance-eval-dataset`](https://github.com/HenryDeGrasse/agentforge-finance-eval-dataset) — standalone npm package |
| **Open Source Contribution** | This repository — complete AI agent module on an existing OSS project (Ghostfolio, AGPLv3)                                      |

---

## What's New in This Fork

Everything under `apps/api/src/app/endpoints/ai/` is new. The upstream Ghostfolio codebase is otherwise unchanged.

### Frontend — AI Advisor Panel

A premium slide-in chat panel built with Angular Material that provides a conversational interface to the AI agent:

- **⌘K / Ctrl+K keyboard shortcut** to open the advisor from anywhere in the app
- **Streaming responses** with real-time token rendering via Server-Sent Events
- **Tool timeline** — each tool call is shown as an expandable step so users can see exactly what data the agent accessed
- **Thinking indicator** — animated pill shows when the agent is reasoning
- **Context chips** — current page context (portfolio, account) is displayed as chips above the input
- **Message animations** — smooth enter/exit transitions for conversation flow
- **Capability list** — clickable suggested prompts for discoverability
- **Copy to clipboard** on any response
- **User feedback** — thumbs up/down on every response, persisted to the backend
- **Escape key** dismissal, auto-focus on open, legal disclaimer footer
- **Responsive** — works on desktop and mobile viewports

### Development Timeline

| Week                  | Focus                           | What shipped                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Day 1** (Feb 23)    | **MVP**                         | ReAct agent core, tool registry, guardrails (max iterations, cost limit, circuit breaker, timeout), 3 tools (portfolio summary, transactions, risk analysis), response verification layer, Angular AI chat page, premium slide-in advisor panel, Railway deployment, MVP eval pack                                                                                                                                                                                            |
| **Day 2** (Feb 24)    | **Tool Expansion & Evals**      | 5 new tools (market data, performance compare, tax estimate, compliance check, rebalance suggest), demo portfolio seeding, two-speed eval suites, persisted conversation history, scope gate for out-of-scope rejection, escalation retry for tool enforcement                                                                                                                                                                                                                |
| **Day 3** (Feb 25–26) | **Streaming & Insider Trading** | SSE streaming with unified agent execution engine, action chips + tool indicator in UI, 2 more tools (simulate trades, stress test), insider trading monitoring module with 4 SEC EDGAR tools (bounty branch), CI pipeline improvements                                                                                                                                                                                                                                       |
| **Day 4** (Feb 27)    | **Hardening & Reliability**     | 3 critical vulnerability fixes, 7 reliability improvements, parallel tool execution, context window guard, cost estimation fallback, chart data extractor bug fixes, Yahoo Finance rate limit handling (backoff + negative cache), keyword router → tool summarizers, unbacked-claim detection                                                                                                                                                                                |
| **Day 5** (Feb 28)    | **GPT-4.1 & Observability**     | Upgraded to GPT-4.1, statistical risk metrics (Sharpe, Sortino, CVaR), golden set rewrite (50 cases with realistic LLM behavior), Tier 2 live evals (27/27 pass), Langfuse + Helicone observability, user feedback endpoint, `requiresHumanReview` flag, replay tier with session recording                                                                                                                                                                                   |
| **Day 6** (Mar 1)     | **Polish & Open Source**        | UI polish (⌘K shortcut, tool timeline, animations, capability list, thinking pill, feedback, legal disclaimer), Railway deploy fixes, 3 tool bug fixes, output sanitizer, conversation history validator, dynamic system prompt builder, stream backpressure, per-user circuit breaker, rate limiter atomicity fix, `systemPrompt` removed from public API, structured error codes, architecture docs, published `@agentforge/finance-eval-dataset` as standalone OSS package |

### Key Improvements

#### Agent Reliability

- **Parallel tool execution** — all tool calls in a single LLM turn execute via `Promise.all()`. Latency drops from `n × tool_time` to `max(tool_time)`. Individual failures are caught and wrapped — one failing tool doesn't block the others.
- **Context window guard** — tool outputs exceeding 32,000 chars are truncated with a `[TRUNCATED]` notice before entering the LLM conversation.
- **Escalation hardening** — when the LLM answers without calling any tool on the first turn, the agent injects an escalation prompt and sets `toolChoice: 'required'`.
- **Conversation history validator** — repairs `priorMessages` before they enter the LLM: drops leading assistant messages, deduplicates consecutive same-role messages.
- **Cost estimation** — accurate per-model pricing (prompt, completion, cached tokens separately) with fallback paths.

#### Security

- **Per-user rate limiter** — sliding-window, 20 req/user/60s, HTTP 429 on excess. Atomic check (TOCTOU race fixed).
- **Scope gate** — deterministic keyword-based rejection of non-financial queries before hitting the LLM.
- **Output sanitizer** — strips HTML tags, neutralizes markdown-image exfiltration, removes zero-width Unicode. Preserves valid markdown.
- **Per-user circuit breaker** — scoped by `userId` to prevent cross-user DoS.
- **`systemPrompt` removed from public API** — callers can no longer inject arbitrary system prompts to bypass guardrails.
- **`new Function()` removed** — dynamic code evaluation replaced with plain inline markdown builder.

#### Operational

- **Structured error codes** — `CIRCUIT_BREAKER`, `COST_LIMIT`, `MAX_ITERATIONS`, `TIMEOUT`, `EMPTY_RESPONSE`, `CANCELLED`, `INTERNAL_ERROR` on every failed response. No second LLM call needed.
- **Dynamic system prompt** — assembled at request time from injected context (date, tools, locale) instead of a static string.
- **Stream backpressure** — `AbortController` enforces timeout on the streaming LLM path. No more indefinitely held connections.
- **Structured telemetry** — JSON log line after every agent run with status, guardrail, tool calls, iterations, cost, latency, and request ID.

> **Known pre-existing issue**: A worker process does not exit gracefully after the test suite (upstream NestJS/BullMQ module teardown). This manifests as a warning but does not affect test correctness.

---

### AI Chat Endpoint

`POST /api/v1/ai/chat` accepts a message and optional `toolNames` list. The server streams a Server-Sent Events (SSE) response with thinking steps, tool calls, and a final verified answer. A traditional JSON response (`/api/v1/ai/chat` without streaming) is also supported.

### ReAct Agent (`react-agent.service.ts`)

A **Reasoning + Acting** loop that:

1. Sends the user message + tool definitions to the LLM
2. Executes any tool calls the LLM requests against the user's live portfolio data
3. Validates tool outputs against JSON schemas before returning them to the LLM
4. Repeats until the LLM produces a final text answer (or a guardrail fires)

Built-in guardrails:

- **Max iterations** — prevents infinite tool-call loops (default: 15)
- **Cost limit** — aborts if estimated LLM spend exceeds threshold (default: $0.25)
- **Circuit breaker** — backs off after repeated tool failures
- **Request timeout** — total agent deadline (default: 60 s)

### Response Quality Assessor (`response-verifier.service.ts`)

After the agent finishes, a deterministic heuristic scorer assigns a `LOW / MEDIUM / HIGH` confidence level:

- **HIGH** — agent completed, called at least one tool, no tool errors
- **MEDIUM** — partial completion, tool errors present, or no tools used
- **LOW** — agent failed entirely

Additional warnings are attached for: slow responses, guardrail fires, missing tool coverage, and unbacked portfolio claims detected via pattern matching. A `requiresHumanReview` flag is set when confidence is low or a guardrail fired.

The confidence level and warnings are returned with every response so callers can show uncertainty signals in the UI.

---

## Performance & Quality Metrics

| Metric                  | Target | Achieved                                              |
| ----------------------- | ------ | ----------------------------------------------------- |
| Single-tool latency     | < 5 s  | 3–5 s (median)                                        |
| Multi-tool latency (3+) | < 15 s | 6–15 s                                                |
| Tool success rate       | > 95%  | 100% across all eval scenarios                        |
| Eval pass rate          | > 80%  | 100% (62/62 fast, 31/31 nightly, 12/12 live, 5/5 MVP) |
| Hallucination rate      | < 5%   | 0% — all responses grounded in tool output            |
| Verification accuracy   | > 90%  | Deterministic heuristic scorer — no false flags       |
| Cost per request        | —      | Median ~$0.01, p95 ~$0.03 (gpt-4.1)                   |

### Verification Systems (6 implemented)

| Verification Type           | Implementation                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Hallucination Detection** | `containsUnbackedPortfolioClaim()` — regex-based detection of portfolio assertions without tool backing                     |
| **Confidence Scoring**      | Deterministic HIGH/MEDIUM/LOW heuristic in `ResponseVerifierService` based on tool usage and status                         |
| **Domain Constraints**      | Scope gate rejects non-financial queries; compliance tool enforces position-size / sector / cash rules                      |
| **Output Validation**       | JSON schema validation on every tool input and output; output sanitizer strips HTML/XSS/zero-width chars                    |
| **Human-in-the-Loop**       | `requiresHumanReview` flag set on low confidence, guardrail fires, or unbacked claims                                       |
| **Fact Checking**           | Escalation trigger forces tool use when LLM answers without calling tools; response verifier warns on missing tool coverage |

---

## AI Tools (14 total)

All tools are defined in `apps/api/src/app/endpoints/ai/tools/` with strict JSON input/output schemas. Every schema field has a `description` annotation so the LLM knows exactly how to interpret each value (including whether `*Pct` fields are 0–1 fractions or already-multiplied whole-number percentages).

### Core Portfolio Tools (10)

| Tool                      | Description                                                                  |
| ------------------------- | ---------------------------------------------------------------------------- |
| `get_portfolio_summary`   | Total value, allocation breakdown, top holdings, base currency               |
| `get_transaction_history` | Filtered transaction list with pagination                                    |
| `analyze_risk`            | Concentration, sector, currency, and volatility risk metrics                 |
| `market_data_lookup`      | Current quote, profile metadata, and optional price history for any symbol   |
| `performance_compare`     | Time-series return comparison for up to 3 symbols or benchmarks              |
| `compliance_check`        | Rule-based compliance gate (max position size, max sector, cash floor, etc.) |
| `rebalance_suggest`       | Target-allocation suggestions with `tradeSuggested` flag per position        |
| `simulate_trades`         | What-if simulation — applies hypothetical trades to a portfolio snapshot     |
| `stress_test`             | Applies predefined or custom market shocks and shows impact per position     |
| `tax_estimate`            | Short/long-term gain estimates and unrealised gain breakdown                 |

### Insider Trading Monitoring Tools (4) — `bounty` branch

| Tool                   | Description                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `get_insider_activity` | Fetches recent SEC insider transactions for any symbol via SEC EDGAR data provider |
| `create_insider_rule`  | Creates a monitoring rule to alert on insider trades matching user criteria        |
| `list_insider_rules`   | Lists all active insider monitoring rules for the current user                     |
| `update_insider_rule`  | Updates thresholds, symbols, or conditions on an existing monitoring rule          |
| `delete_insider_rule`  | Removes an insider monitoring rule                                                 |

### Notable tool behaviours

**`rebalance_suggest`** — Every entry in `targetAllocations` carries `tradeSuggested: boolean` and an optional `tradeAction: 'BUY' | 'SELL'`. Positions blocked by a turnover cap or max-trades constraint get `tradeSuggested: false`, which prevents the LLM from rendering a table that implies all positions will be rebalanced when only a subset have actual trades.

**`simulate_trades`** — `allocationChanges` only includes positions where allocation shifted by more than 0.01 percentage points. Untouched positions are omitted so the LLM cannot list unchanged holdings as if they were affected. `concentrationWarnings` are tagged `(pre-existing)` or `(new)` so the LLM can distinguish warnings caused by the simulation from those that already existed.

**`market_data_lookup`** — Queries go through Ghostfolio's Redis quote cache (populated by the scheduled data-gathering jobs), so most lookups never hit Yahoo Finance directly. When a symbol isn't in the cache, the tool falls back to a Yahoo Finance lookup with **exponential-backoff retry** on HTTP 429 (500 ms → 1 s → 2 s, 3 attempts) and a **5-minute negative-result cache** so the same unresolvable symbol cannot drain rate-limit quota across repeated questions. The negative cache is **per-instance** (not module-scoped) so different tool instances — and different tests — never share cache state.

---

## Yahoo Finance Rate Limits

Yahoo Finance is an **unofficial, undocumented API**. In practice, a single IP is rate-limited at roughly 2,000 requests/hour before 429s appear.

How this repo stays within limits:

| Layer                      | Mechanism                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| Quote fetches              | Served from Redis (populated by background gather jobs). Yahoo is only hit on cache miss.     |
| Symbol search / resolution | 5-minute in-memory negative-result cache. 429s trigger exponential backoff (up to 3 retries). |
| Historical data            | Read from the `MarketData` Postgres table — **no live Yahoo call**.                           |
| LLM tool calls             | Tools are single-symbol per call; the agent typically calls 1–3 tools per session.            |

If you run many users concurrently, consider adding a dedicated data provider (CoinGecko for crypto, Financial Modeling Prep for equities) to reduce reliance on Yahoo.

---

## Observability & Feedback

### Langfuse + Helicone Integration

Every agent run is traced end-to-end:

- **[Langfuse](https://langfuse.com)** — full LLM trace with spans for each agent iteration, tool call, and verification step. Each trace carries `traceId`, `userId` (hashed), `model`, `estimatedCostUsd`, `toolCalls`, and `requiresHumanReview`.
- **[Helicone](https://helicone.ai)** — request-level LLM observability (latency, token counts, cost, cache hits) via OpenAI proxy headers.
- **Structured telemetry** — every agent run emits a JSON log line with `status`, `guardrail`, `toolCalls`, `iterations`, `estimatedCostUsd`, `elapsedMs`, and `requestId`.

### User Feedback

- `POST /api/v1/ai/chat/feedback` accepts thumbs-up/down ratings per response, keyed by `traceId`.
- Feedback is forwarded to Langfuse as score annotations on the corresponding trace, enabling quality monitoring over time.
- The `requiresHumanReview` flag is automatically set on low-confidence or guardrail-triggered responses, surfacing them for review in the Langfuse dashboard.

---

## Deployment

### Railway

AgentForge is configured for one-click deployment on [Railway](https://railway.app):

- `railway.toml` and `entrypoint.sh` handle build, migration, demo seeding, and server start.
- Redis and PostgreSQL are provisioned as Railway services; `REDIS_URL` is parsed automatically.
- Demo portfolio is auto-seeded on first boot so the app is immediately usable.

See [`docs/deploy-mvp.md`](./docs/deploy-mvp.md) for the full deployment guide.

---

## Open Source Eval Dataset

The eval dataset is published as a standalone package so anyone building AI finance agents can benchmark against it:

📦 **[`@agentforge/finance-eval-dataset`](https://github.com/HenryDeGrasse/agentforge-finance-eval-dataset)**

Includes golden-set test cases, tool profiles, LLM sequence fixtures, and a schema for defining new eval scenarios. Usable independently of AgentForge.

---

## Eval Framework

The AI layer ships with **98 eval cases** across a four-tier evaluation framework. See [docs/AI_EVAL_RESULTS.md](./docs/AI_EVAL_RESULTS.md) for full results.

| Tier                 | Suite                | Gate                     | LLM                       | Cases | Budget   |
| -------------------- | -------------------- | ------------------------ | ------------------------- | ----- | -------- |
| **Fast (CI)**        | `golden-sets-fast`   | None — runs every commit | Mocked scripted sequences | 62    | < 30 s   |
| **Live (pre-merge)** | `golden-sets` (live) | `RUN_GOLDEN_EVALS=1`     | Real LLM                  | 12    | < 5 min  |
| **MVP**              | `mvp-evals`          | `RUN_MVP_EVALS=1`        | Real LLM                  | 5     | < 4 min  |
| **Nightly**          | `labeled-scenarios`  | `RUN_LABELED_EVALS=1`    | Real LLM                  | 31    | < 15 min |

**Coverage categories across all 98 cases:**

- **Single-tool happy path** (10+ cases): Each of the 10 tools exercised individually with rich portfolio data
- **Multi-tool orchestration** (6+ cases): Sequential, parallel, and 3+ tool chains
- **Edge cases** (10+ cases): Empty portfolio, missing data, boundary conditions, typos
- **Adversarial / safety** (10+ cases): Prompt injection, jailbreak attempts, scope gate bypass, keyword stuffing
- **Multi-step reasoning** (10+ cases): Performance → stress test, tax → simulation, full portfolio review
- **Out-of-scope refusals** (6+ cases): Poems, recipes, medical advice, code generation

Each eval case in `apps/api/test/ai/golden-sets.json` specifies the user message, tool set, expected status, minimum confidence, and minimum tool-call count. The fast tier uses scripted LLM responses from `apps/api/test/ai/fixtures/llm-sequences/` (63 fixture files) and deterministic tool stubs from `apps/api/test/ai/fixtures/tool-profiles.ts` — all schemas are imported from production so fixture drift is impossible.

### Run evals locally

```bash
# Fast tier (mocked — runs in <30s, no env needed)
npx nx test api

# Live golden sets against local API
RUN_GOLDEN_EVALS=1 MVP_EVAL_BASE_URL=http://127.0.0.1:3333/api/v1 \
  npx dotenv-cli -e .env -- npx nx test api \
  --testPathPattern='golden-sets.spec' --runInBand
```

---

## Local Development

### Prerequisites

- Node 22 (use `nvm use 22`)
- Docker (for Postgres + Redis)

### Quick start

```bash
# Copy and edit environment file
cp .env.example .env
# Edit .env — replace all ${VAR} references with literal values for DATABASE_URL

# Start dependencies + build + serve API at http://127.0.0.1:3333
./dev.sh up

# Seed a rich demo portfolio
./dev.sh seed

# Get a fresh JWT for the demo user
./dev.sh token
```

The `dev.sh` commands:

| Command          | Action                                                |
| ---------------- | ----------------------------------------------------- |
| `up` / `restart` | Build + start API (also starts Docker deps if needed) |
| `stop`           | Stop the API process                                  |
| `status`         | Show process info and `/health` check                 |
| `seed`           | Seed demo user + 10-stock portfolio (idempotent)      |
| `token`          | Print a fresh JWT for the demo user                   |
| `test`           | Run focused AI test suite                             |
| `coverage`       | Run AI test suite with coverage                       |
| `eval`           | Run MVP evals (`RUN_MVP_EVALS=1` required)            |

### Environment variables

The full set of upstream Ghostfolio env vars is still supported. The AI-specific additions are:

| Name                  | Type     | Default   | Description                                               |
| --------------------- | -------- | --------- | --------------------------------------------------------- |
| `OPENAI_API_KEY`      | `string` | —         | OpenAI API key (used for the ReAct agent and verifier)    |
| `OPENAI_MODEL`        | `string` | `gpt-4.1` | Model to use for agent turns                              |
| `EVAL_API_URL`        | `string` | —         | Base URL for live eval runs in CI (`pre-merge-evals` job) |
| `LANGFUSE_PUBLIC_KEY` | `string` | —         | Langfuse public key for LLM tracing                       |
| `LANGFUSE_SECRET_KEY` | `string` | —         | Langfuse secret key for LLM tracing                       |
| `LANGFUSE_BASE_URL`   | `string` | —         | Langfuse API base URL (defaults to Langfuse Cloud)        |
| `HELICONE_API_KEY`    | `string` | —         | Helicone API key for request-level LLM observability      |

Standard Ghostfolio env vars:

| Name                     | Type                | Default | Description                                                                      |
| ------------------------ | ------------------- | ------- | -------------------------------------------------------------------------------- |
| `ACCESS_TOKEN_SALT`      | `string`            | —       | Salt for access tokens                                                           |
| `API_KEY_COINGECKO_DEMO` | `string` (optional) | —       | CoinGecko Demo API key                                                           |
| `API_KEY_COINGECKO_PRO`  | `string` (optional) | —       | CoinGecko Pro API key                                                            |
| `DATABASE_URL`           | `string`            | —       | PostgreSQL connection string — use literal values, not shell variable references |
| `JWT_SECRET_KEY`         | `string`            | —       | Secret for JWT signing                                                           |
| `PORT`                   | `number` (optional) | `3333`  | API port                                                                         |
| `REDIS_HOST`             | `string`            | —       | Redis host                                                                       |
| `REDIS_PASSWORD`         | `string`            | —       | Redis password                                                                   |
| `REDIS_PORT`             | `number`            | —       | Redis port                                                                       |

---

## Technology Stack

AgentForge inherits the Ghostfolio stack and adds:

| Layer             | Technology                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Backend framework | [NestJS](https://nestjs.com)                                                                     |
| Database          | [PostgreSQL](https://www.postgresql.org) + [Prisma](https://www.prisma.io)                       |
| Cache             | [Redis](https://redis.io) (quote cache + BullMQ job queue)                                       |
| Frontend          | [Angular](https://angular.dev) + [Angular Material](https://material.angular.io)                 |
| AI / LLM          | OpenAI API (`gpt-4.1`)                                                                           |
| Observability     | [Langfuse](https://langfuse.com) (tracing) · [Helicone](https://helicone.ai) (LLM proxy metrics) |
| Market data       | Yahoo Finance (via `yahoo-finance2`) · CoinGecko                                                 |
| Deployment        | [Railway](https://railway.app)                                                                   |
| Monorepo tooling  | [Nx](https://nx.dev)                                                                             |

---

## Docker Compose (self-hosting)

```bash
docker compose -f docker/docker-compose.yml up -d
```

Or build locally:

```bash
docker compose -f docker/docker-compose.build.yml build
docker compose -f docker/docker-compose.build.yml up -d
```

After starting, open `http://localhost:3333` and create an admin user via **Get Started**.

---

## Public API (upstream)

### Authentication

```http
Authorization: Bearer <jwt>
```

Obtain a JWT:

```bash
curl -s http://localhost:3333/api/v1/auth/anonymous/<ACCESS_TOKEN>
```

### Health check

```
GET http://localhost:3333/api/v1/health
→ { "status": "OK" }
```

### Import activities

```
POST http://localhost:3333/api/v1/import
```

```json
{
  "activities": [
    {
      "currency": "USD",
      "dataSource": "YAHOO",
      "date": "2021-09-15T00:00:00.000Z",
      "fee": 0,
      "quantity": 5,
      "symbol": "MSFT",
      "type": "BUY",
      "unitPrice": 298.58
    }
  ]
}
```

---

## License

© 2021 – 2026 [Ghostfolio](https://ghostfol.io) and contributors  
Licensed under the [AGPLv3 License](https://www.gnu.org/licenses/agpl-3.0.html).
