<div align="center">

# AgentForge

**AI-powered portfolio intelligence — built on [Ghostfolio](https://ghostfol.io)**

</div>

AgentForge is a fork of [Ghostfolio](https://ghostfol.io) that adds a full AI agent layer on top of the existing wealth management platform. Users can ask natural-language questions about their portfolio and get grounded, data-driven answers powered by a ReAct agent that calls real portfolio tools.

> 📄 **[Agent Architecture Document](./docs/AGENT_ARCHITECTURE.md)** — Domain rationale, architecture decisions, verification strategy, eval results, and observability setup.

---

## What's New in This Fork

Everything under `apps/api/src/app/endpoints/ai/` is new. The upstream Ghostfolio codebase is otherwise unchanged.

### Improvement Log

| Phase       | Description                                                                                              | Status  |
| ----------- | -------------------------------------------------------------------------------------------------------- | ------- |
| **Phase 1** | Bug fixes — chart data extraction, benchmark comparison, memory leak                                     | ✅ Done |
| **Phase 2** | Agent reliability — parallel tool calls, context guard, escalation, cost estimation                      | ✅ Done |
| **Phase 3** | Eval coverage expansion — chart extractor tests, multi-turn evals, injection evals                       | ✅ Done |
| **Phase 4** | Security hardening — rate limiting, scope gate, output sanitization, guardrail bypass prevention         | ✅ Done |
| **Phase 5** | Operational improvements — structured error codes, dynamic system prompt, stream backpressure, telemetry | ✅ Done |

#### Phase 1 Bug Fixes

1. **`ChartDataExtractorService` — 5 silent chart bugs fixed** (`chart-data-extractor.service.ts`):
   - `analyze_risk`: asset-class and sector exposure charts now read from `data.exposures.*` instead of non-existent top-level fields. Previously, no risk charts were ever generated.
   - `market_data_lookup`: line-chart values now use `marketPrice` (the actual field name) instead of `close`/`price`. Previously all data points were 0.
   - `rebalance_suggest`: table columns now use `currentPct`/`targetPct`/`driftPct`. Previously all percentage cells were empty strings.
   - `tax_estimate`: table cells now show `netInBaseCurrency` numeric values instead of `[object Object]`.
   - `compliance_check`: rule names now read from `ruleName` instead of `name`. Previously all rule rows had blank first columns.
   - Added `chart-data-extractor.service.spec.ts` with 38 tests covering all 10 tool extractors.

2. **`performance_compare` — benchmark comparison made honest** (`performance-compare.tool.ts`):
   - Comparison now requires the portfolio to have **positive** net returns to classify as "outperforming". Previously a portfolio at -5% could appear to "outperform" a benchmark at -10% from ATH — these are different metrics being compared.
   - Assumption text updated to explain the limitation (ATH drawdown vs period return).

3. **`lookupNegativeCache` — memory leak fixed** (`market-data-lookup.tool.ts`):
   - Expired entries are now deleted on access instead of just skipped. Previously, the in-memory `Map` grew indefinitely in long-running server processes.

#### Phase 2 Agent Reliability

1. **Parallel tool execution** (`react-agent.service.ts`):
   - All tool calls returned in a single LLM turn are now executed with `Promise.all()` instead of sequentially. Worst-case latency drops from `n × tool_time` to `max(tool_time)`.
   - Individual tool failures are caught and wrapped in error envelopes — one failing tool no longer blocks the others.

2. **Context window guard** (`react-agent.service.ts` + `agent.constants.ts`):
   - Tool outputs exceeding `AGENT_TOOL_OUTPUT_MAX_CHARS` (32,000 chars ≈ 8k tokens) are truncated with a visible `[TRUNCATED]` notice before being injected into the LLM conversation. Previously a large tool response could silently overflow the context window.

3. **Escalation hardening** (`react-agent.service.ts`):
   - When tools are available but the LLM answers directly on the first turn without calling any tool (and the answer isn't a clear refusal), the agent injects an escalation prompt and sets `toolChoice: 'required'` for the next turn. This was already present but tests were added to pin the behaviour.

4. **Cost estimation fallback** (`react-agent.service.ts`):
   - When `estimatedCostUsd` is absent from the LLM response, cost is estimated from `totalTokens` (or `promptTokens + completionTokens`) and `fallbackCostPer1kTokensUsd`. Tests were added to pin all three fallback paths.

#### Phase 3 Eval Coverage

New test file: `apps/api/test/ai/phase3-evals.spec.ts`

1. **Multi-turn conversation rehydration** (3 tests):
   - Verifies `priorMessages` are injected into the LLM conversation in the correct order (prior user → prior assistant → new user prompt).
   - Verifies cold start (no `priorMessages`) works identically to the explicit empty-array case.
   - Regression guard for conversation history ordering.

2. **Indirect prompt injection via tool output** (3 tests):
   - Verifies the agent passes tool output (including attacker-controlled fields) to the LLM without pre-sanitising it — the LLM must see the injection text to decide how to handle it.
   - Verifies the final `response` does not echo injection text when the LLM correctly ignores it.
   - Verifies the context-window guard truncates oversized injection payloads before they enter the LLM context.

#### Phase 4 Security Hardening

1. **Per-user rate limiter** (`ai-rate-limiter.guard.ts`):
   - `AiRateLimiterGuard` implements a sliding-window rate limit: 20 requests per user per 60-second window.
   - Applied to both `POST /ai/chat` and `POST /ai/chat/stream`. Excess requests receive HTTP 429.
   - Guard is `@Injectable()` and registered in `AiModule`; stale timestamps are evicted lazily on each access to prevent unbounded memory growth.
   - **Note:** This is an in-memory guard — it does not share state across multiple server instances. For multi-instance deployments a Redis-backed throttler should replace it.
   - 8 tests cover: single request, at-limit, over-limit, HTTP 429 status, per-user isolation, window expiry, stale eviction, unauthenticated pass-through.

2. **Scope gate keyword-stuffing tests** (`ai.service.spec.ts`):
   - Added 3 regression tests to pin the out-of-scope-before-financial-relevance ordering:
     - "write a poem about my stock portfolio" → rejected ("write a poem" matches before "stock")
     - "predict the future price of my ETF" → rejected ("predict the future" matches before "ETF")
     - "use my portfolio returns to buy lottery tickets" → rejected ("lottery" matches before "portfolio")

3. **Output sanitization** (`utils/output-sanitizer.ts`):
   - LLM responses are sanitized before reaching the frontend: HTML tags stripped, markdown-image exfiltration links neutralized, zero-width Unicode characters removed.
   - Preserves all valid markdown (bold, italic, tables, lists, code blocks).
   - Applied in `ResponseVerifierService.verify()` before building the final response envelope.

4. **Atomic rate limiter** (`ai-rate-limiter.guard.ts`):
   - Fixed a TOCTOU race: the request counter is now incremented _before_ the limit check and rolled back only if the request is rejected. Previously a burst of concurrent requests could all read the same counter value and all be let through.

5. **`new Function()` removed** (`system-prompt-builder.ts`):
   - Dynamic code evaluation replaced with a plain inline markdown builder. Eliminates a CSP violation and a potential sandbox-escape vector if the system prompt template was ever sourced from user-controlled input.

6. **Per-user circuit breaker** (`react-agent.service.ts`):
   - The circuit breaker state is now keyed by `userId` instead of being global. Previously a single user's repeated tool failures could trip the circuit breaker for all other users (cross-user DoS).

7. **`systemPrompt` removed from public API** (`chat.dto.ts` / `ai.controller.ts`):
   - The `systemPrompt` field was removed from the `ChatDto` request body. Callers can no longer inject an arbitrary system prompt to override safety instructions or escalation guardrails.

#### Phase 5 Operational Improvements

1. **Structured error codes** (`contracts/final-response.schema.ts`):
   - Every `VerifiedResponse` now carries an optional `errorCode` field (`AgentErrorCode`) when the agent does not complete cleanly: `CIRCUIT_BREAKER`, `COST_LIMIT`, `MAX_ITERATIONS`, `TIMEOUT`, `EMPTY_RESPONSE`, `CANCELLED`, `INTERNAL_ERROR`.
   - Derived deterministically in `ResponseVerifierService.deriveErrorCode()` — no second LLM call.
   - Enables the frontend to display specific, actionable error states instead of a generic failure message.

2. **Dynamic system prompt builder** (`agent/system-prompt-builder.ts`):
   - `SystemPromptBuilderService` assembles the system prompt at request time from injected context (current date, available tools, user locale). Previously the prompt was a static string defined at module load.
   - Eliminates the `systemPrompt` override vulnerability (see Phase 4, item 7) and allows per-request prompt tuning without restarting the server.
   - Fully unit-tested (`system-prompt-builder.spec.ts`, 10 tests).

3. **Accurate cost model** (`react-agent.service.ts`):
   - Cost estimation now accounts for prompt tokens, completion tokens, and cached prompt tokens separately using per-model pricing from `agent.constants.ts`. Previously all tokens were billed at a single flat rate, underestimating cost on cache-heavy workloads.

4. **Stream backpressure** (`ai.service.ts` / `openai-client.service.ts`):
   - The streaming path now enforces a request timeout via `AbortController` threaded through to the OpenAI client. Previously a stalled stream would hold the connection open indefinitely until the proxy timed out, with no server-side cancellation.

5. **Conversation history validator** (`utils/conversation-history-validator.ts`):
   - `validateConversationHistory()` repairs the `priorMessages` array before it enters the LLM conversation: leading assistant messages are dropped (LLMs require user-first turn ordering), and consecutive same-role messages are deduplicated (keeping the newer one).
   - Handles persistence inconsistencies where a user message was saved but the assistant reply was lost.
   - Logs a `WARN` when repair is applied; never throws. 20 tests cover all repair rules.

6. **Keyword router removed** (`routing/tool-router.service.ts`):
   - The keyword-scoring pre-filter that mapped user messages to a subset of tools was replaced with a pass-through that sends all available tools to the LLM. The LLM is significantly better at tool selection than substring matching — the keyword router caused real misrouting (e.g. "history of Apple stock" → `get_transaction_history` instead of `market_data_lookup`; "risky question" → `analyze_risk`). Token cost of the full tool list is negligible on a 128 k context window.
   - `callerOverrideTools` is still honoured unchanged.

7. **Portfolio claim detector extracted** (`utils/portfolio-claim-detector.ts`):
   - `containsUnbackedPortfolioClaim()` is now a shared utility used by both `ReactAgentService` (escalation trigger) and `ResponseVerifierService` (warning generation). Previously each had its own regex — they had already drifted, producing inconsistent escalation vs. warning behaviour.

8. **Precision numerical regression tests** (`tools/utils/statistical-helpers.spec.ts`):
   - Four hand-calculated test cases with tight tolerance (±0.005) guard against formula changes: Sharpe ratio, Sortino > Sharpe when upside dominates, CVaR(95%), and annualized return identity at exactly one year.

9. **Structured telemetry** (`react-agent.service.ts`):
   - `emitTelemetry()` emits a JSON-structured `Logger.log` line after every agent run.
   - Fields: `status`, `guardrail`, `toolCalls`, `iterations`, `estimatedCostUsd`, `elapsedMs`, `requestId`. `userId` is intentionally omitted to avoid PII in logs.

10. **Heartbeat interval extracted to `agent.constants.ts`**:
    - `AGENT_HEARTBEAT_INTERVAL_MS = 15_000` replaces the inline magic number in `ai.service.ts`.
    - Documented: 15 s chosen to stay below typical 30–60 s proxy idle timeouts.

> **Known pre-existing issue**: A worker process does not exit gracefully after the test suite (upstream NestJS/BullMQ module teardown). This manifests as a warning but does not affect test correctness. Fixing it requires closing Redis/BullMQ connections in `afterAll` hooks for the modules that import `RedisCacheModule` / `PortfolioSnapshotQueueModule`.

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

## AI Tools (10 total)

All tools are defined in `apps/api/src/app/endpoints/ai/tools/` with strict JSON input/output schemas. Every schema field has a `description` annotation so the LLM knows exactly how to interpret each value (including whether `*Pct` fields are 0–1 fractions or already-multiplied whole-number percentages).

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

## Eval Framework

The AI layer ships with a four-tier evaluation framework. See [docs/AI_EVAL_RESULTS.md](./docs/AI_EVAL_RESULTS.md) for full results.

| Tier                 | Suite                | Gate                     | LLM                       | Cases | Budget   |
| -------------------- | -------------------- | ------------------------ | ------------------------- | ----- | -------- |
| **Fast (CI)**        | `golden-sets-fast`   | None — runs every commit | Mocked scripted sequences | 27    | < 30 s   |
| **Live (pre-merge)** | `golden-sets` (live) | `RUN_GOLDEN_EVALS=1`     | Real LLM                  | 12    | < 5 min  |
| **MVP**              | `mvp-evals`          | `RUN_MVP_EVALS=1`        | Real LLM                  | 5     | < 4 min  |
| **Nightly**          | `labeled-scenarios`  | `RUN_LABELED_EVALS=1`    | Real LLM                  | 31    | < 15 min |

Each eval case in `apps/api/test/ai/golden-sets.json` specifies the user message, tool set, expected status, minimum confidence, and minimum tool-call count. The fast tier uses scripted LLM responses from `apps/api/test/ai/fixtures/llm-sequences/` and deterministic tool stubs from `apps/api/test/ai/fixtures/tool-profiles.ts` — all schemas are imported from production so fixture drift is impossible.

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

| Name             | Type     | Default   | Description                                               |
| ---------------- | -------- | --------- | --------------------------------------------------------- |
| `OPENAI_API_KEY` | `string` | —         | OpenAI API key (used for the ReAct agent and verifier)    |
| `OPENAI_MODEL`   | `string` | `gpt-4.1` | Model to use for agent turns                              |
| `EVAL_API_URL`   | `string` | —         | Base URL for live eval runs in CI (`pre-merge-evals` job) |

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

| Layer             | Technology                                                                       |
| ----------------- | -------------------------------------------------------------------------------- |
| Backend framework | [NestJS](https://nestjs.com)                                                     |
| Database          | [PostgreSQL](https://www.postgresql.org) + [Prisma](https://www.prisma.io)       |
| Cache             | [Redis](https://redis.io) (quote cache + BullMQ job queue)                       |
| Frontend          | [Angular](https://angular.dev) + [Angular Material](https://material.angular.io) |
| AI / LLM          | OpenAI API (`gpt-4.1`)                                                           |
| Market data       | Yahoo Finance (via `yahoo-finance2`) · CoinGecko                                 |
| Monorepo tooling  | [Nx](https://nx.dev)                                                             |

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
