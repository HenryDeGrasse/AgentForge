# Epic: AgentForge MVP (Embedded AI Advisor for Ghostfolio)

## Goal

Deliver a production-shaped MVP of an embedded, read-only AI financial assistant inside Ghostfolio that can answer portfolio questions using real user data and deterministic tool outputs.

## Why this matters

- Proves end-to-end integration (NestJS + Prisma + Angular + LLM)
- Produces a real feature contribution path for a Ghostfolio fork
- Establishes the reliability baseline for higher-risk features (tax/compliance/rebalancing) later

## Scope (MVP)

- Embedded NestJS AI module (no separate microservice)
- Custom ReAct loop with 4 guardrails:
  - `MAX_ITERATIONS`
  - `TIMEOUT`
  - `COST_LIMIT`
  - `CIRCUIT_BREAKER`
- 3 read-only tools:
  - `get_portfolio_summary`
  - `get_transaction_history`
  - `analyze_risk`
- `POST /api/v1/ai/chat` endpoint with authenticated user scoping
- Simple Angular chat UI in Ghostfolio
- Verification baseline:
  - final response schema validation
  - confidence score + reasons
  - basic domain constraints (e.g. concentration/stale data warnings)
- MVP eval pack (5-8 cases)
- Railway deployment + smoke test

## Non-Goals (MVP)

- Executing trades or writing to portfolio data
- Tax estimator, compliance checker, or rebalancing planner
- Full conversation persistence across restarts
- Anthropic/provider migration
- Full production observability hardening (Langfuse/Helicone can be staged right after MVP)

## Definition of Done

- User can ask allocation/risk/transaction questions in the Ghostfolio UI and receive a structured, safe response
- All tool queries are scoped to authenticated `userId`
- Agent guardrails trigger correctly under failure conditions
- MVP eval cases pass and deployment is reachable on Railway

---

## Implementation Tasks

### 1) Bootstrap local dev and baseline checks

- **Description:** Get Ghostfolio fork running with sample data and confirm API + UI health.
- **Files:** `README.md` (or local setup notes), optional `docs/local-dev.md`
- **Verify:**
  - `docker compose up -d`
  - app is reachable and sample portfolio data exists
- **Depends on:** none

### 2) Scaffold AI module in API

- **Description:** Add NestJS module/controller/service shell for AI endpoints.
- **Files:** `apps/api/src/app/ai/ai.module.ts`, `apps/api/src/app/ai/ai.controller.ts`, `apps/api/src/app/ai/ai.service.ts`
- **Verify:** `GET /api/v1/ai/health` returns 200
- **Depends on:** task 1

### 3) Add model client adapter layer

- **Description:** Wrap OpenAI SDK behind an internal adapter interface for future provider swap.
- **Files:** `apps/api/src/app/ai/llm/llm-client.interface.ts`, `apps/api/src/app/ai/llm/openai-client.service.ts`
- **Verify:** unit test with mocked model response
- **Depends on:** task 2

### 4) Implement ReAct loop with guardrails

- **Description:** Build agent loop with tool-calling orchestration and all 4 guardrails.
- **Files:** `apps/api/src/app/ai/agent/react-agent.service.ts`, `apps/api/src/app/ai/agent/agent.constants.ts`, tests
- **Verify:** tests cover timeout, max-iteration exit, cost limit, circuit breaker
- **Depends on:** task 3

### 5) Build tool contract + registry

- **Description:** Add strict schemas/validators, typed tool results, and registry wiring.
- **Files:** `apps/api/src/app/ai/tools/tool.types.ts`, `apps/api/src/app/ai/tools/tool.registry.ts`, `apps/api/src/app/ai/tools/validators.ts`
- **Verify:** invalid tool input returns structured validation error
- **Depends on:** task 4

### 6) Implement `get_portfolio_summary`

- **Description:** Prisma query for holdings/allocation totals and top positions.
- **Files:** `apps/api/src/app/ai/tools/get-portfolio-summary.tool.ts` (+ tests)
- **Verify:** output totals and allocation match seeded DB values
- **Depends on:** task 5

### 7) Implement `get_transaction_history`

- **Description:** Filtered + paginated transactions with summary stats.
- **Files:** `apps/api/src/app/ai/tools/get-transaction-history.tool.ts` (+ tests)
- **Verify:** pagination, date filtering, and row limits enforced
- **Depends on:** task 5

### 8) Implement `analyze_risk`

- **Description:** Deterministic risk flags (concentration/sector/volatility proxy).
- **Files:** `apps/api/src/app/ai/tools/analyze-risk.tool.ts` (+ tests)
- **Verify:** controlled fixture triggers expected risk warnings
- **Depends on:** task 5

### 9) Add chat endpoint and auth-safe user scoping

- **Description:** Wire endpoint to agent; inject `userId` from request context only.
- **Files:** `apps/api/src/app/ai/ai.controller.ts`, `apps/api/src/app/ai/ai.service.ts`, integration test
- **Verify:** cross-user data access test fails as expected (no leak)
- **Depends on:** tasks 6, 7, 8

### 10) Add final response verification layer

- **Description:** Enforce response schema, confidence fields, and domain constraints before return.
- **Files:** `apps/api/src/app/ai/verification/response-verifier.service.ts`, `apps/api/src/app/ai/contracts/final-response.schema.ts`
- **Verify:** malformed response is rejected/repaired into safe error envelope
- **Depends on:** task 9

### 11) Build minimal Angular chat UI

- **Description:** Add basic chat panel with message list, input, loading/error states, and warnings display.
- **Files:** `apps/client/src/app/pages/ai-chat/*`, route/menu integration files
- **Verify:** user can send prompt and render structured response end-to-end
- **Depends on:** task 9

### 12) Create MVP eval pack (5-8 cases)

- **Description:** Add test prompts for happy path, empty data, stale data, and adversarial injection.
- **Files:** `apps/api/test/ai/mvp-evals.json`, `apps/api/test/ai/mvp-evals.spec.ts`
- **Verify:** eval script passes all MVP cases at temperature 0
- **Depends on:** tasks 10, 11

### 13) Deploy to Railway and run smoke tests

- **Description:** Configure env vars/secrets and validate deployed app behavior.
- **Files:** `railway.json` or deployment docs, `docs/deploy-mvp.md`
- **Verify:** deployed endpoint handles 3 canonical prompts successfully
- **Depends on:** task 12

---

## Parallel Execution Plan

### Phase 1 (sequential foundation)

1 → 2 → 3 → 4 → 5

### Phase 2 (parallel tool development)

6, 7, 8 can run in parallel after task 5

### Phase 3 (integration)

9 → 10 and 11 in parallel

### Phase 4 (validation + release)

12 → 13

---

## Acceptance Criteria

- [ ] `/api/v1/ai/chat` returns structured responses for allocation, transactions, and risk queries
- [ ] All 3 MVP tools are read-only and scoped to authenticated user
- [ ] Guardrails demonstrably stop runaway loops/failures
- [ ] Angular chat UI can complete one full question/response flow
- [ ] MVP eval pack (5-8) passes
- [ ] Railway deployment smoke tests pass

## Risks / Notes

- Ghostfolio schema drift may require tool query adjustments
- Large transaction histories can hurt latency without strict pagination
- Keep deterministic math in tool/services, not in LLM prose
- Defer high-liability features (tax/compliance/rebalance) until verification depth is stronger
