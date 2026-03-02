# AgentForge — AI Cost Analysis

**Author:** Henry DeGrasse
**Date:** March 2026
**Model:** `gpt-4.1` (production), `gpt-4.1-mini` (eval runs)

---

## Model Pricing

Pricing is tracked per-model with split input/output rates in [`openai-client.service.ts`](../apps/api/src/app/endpoints/ai/llm/openai-client.service.ts):

| Model          | Input (per 1K tokens) | Output (per 1K tokens) |
| -------------- | --------------------- | ---------------------- |
| `gpt-4.1`      | $0.002                | $0.008                 |
| `gpt-4.1-mini` | $0.0004               | $0.0016                |

Cost is computed separately for prompt tokens, completion tokens, and cached prompt tokens on every agent run and surfaced in structured telemetry logs and Langfuse traces.

---

## Measured Cost Per Request

| Metric               | Value                   |
| -------------------- | ----------------------- |
| **Average cost/req** | **$0.00483**            |
| Median cost/req      | ~$0.010                 |
| p95 cost/req         | ~$0.030                 |
| Max cost/req (cap)   | $0.250 (hard guardrail) |

> The average is pulled below the median by scope-gate rejections (cost $0.001–$0.002 — one LLM call,
> no tools) and single-tool queries with short responses. The p95 reflects 3+ tool multi-step chains.

### Typical Request Breakdown (gpt-4.1, single-tool query)

| Component                 | Tokens      | Cost        |
| ------------------------- | ----------- | ----------- |
| System prompt (dynamic)   | ~800 input  | $0.0016     |
| User message + history    | ~200 input  | $0.0004     |
| Tool schema definitions   | ~400 input  | $0.0008     |
| LLM response (tool call)  | ~150 output | $0.0012     |
| Tool result injected back | ~300 input  | $0.0006     |
| Final LLM response        | ~250 output | $0.0020     |
| **Total (single-tool)**   | **~2,100**  | **~$0.007** |

### Multi-Tool Request (3 tools, parallel execution)

| Component                            | Tokens       | Cost        |
| ------------------------------------ | ------------ | ----------- |
| System prompt + message + schemas    | ~1,400 input | $0.0028     |
| LLM response (3 parallel tool calls) | ~200 output  | $0.0016     |
| 3 tool results injected              | ~900 input   | $0.0018     |
| Final LLM response (longer)          | ~400 output  | $0.0032     |
| **Total (3-tool parallel)**          | **~2,900**   | **~$0.009** |

---

## Development & Testing Costs

### Dev Spend (7-day sprint, Feb 23 – Mar 2 2026)

| Activity                                  | Est. Calls | Est. Cost   |
| ----------------------------------------- | ---------- | ----------- |
| MVP build & manual testing (Day 1–2)      | ~200       | ~$1.40      |
| Tool expansion + live eval runs (Day 3–4) | ~500       | ~$3.50      |
| Golden set live evals × CI runs (Day 5)   | ~800       | ~$5.60      |
| GPT-4.1 upgrade + golden set rewrite      | ~400       | ~$2.80      |
| Observability wiring + feedback testing   | ~150       | ~$1.05      |
| UI testing + final polish (Day 6)         | ~200       | ~$1.40      |
| **Total estimated dev spend**             | **~2,250** | **~$15.75** |

> Actual spend was bounded by the $0.25/request cost guardrail and `gpt-4.1-mini` being used
> for most eval runs (10× cheaper than `gpt-4.1`). Production app uses `gpt-4.1`.

### Eval Suite Cost

| Tier            | Cases | Est. Cost/Run | Frequency       | Monthly est.   |
| --------------- | ----- | ------------- | --------------- | -------------- |
| Fast (mocked)   | 58    | $0.00         | Every commit    | $0.00          |
| Replay          | 58    | $0.00         | Every commit    | $0.00          |
| Live (gpt-4.1)  | 50    | ~$0.35        | On push to main | ~$3.50         |
| Nightly labeled | 31    | ~$0.25        | Nightly         | ~$7.50         |
| **Total eval**  |       |               |                 | **~$11.00/mo** |

---

## Production Cost Projections

### Assumptions

| Parameter                       | Value     | Notes                                         |
| ------------------------------- | --------- | --------------------------------------------- |
| Queries per active user per day | 5         | Conservative — finance app, not a chatbot     |
| Avg cost per request            | $0.00483  | Measured across all request types             |
| Scope-gate rejection rate       | ~15%      | Rejected before any tool call — cost ~$0.001  |
| Single-tool query rate          | ~55%      | ~$0.007/req                                   |
| Multi-tool query rate           | ~30%      | ~$0.015/req                                   |
| Out-of-scope refusal rate       | ~15%      | ~$0.001/req (one LLM call, no tools)          |
| Active user ratio               | 40%       | Not all registered users query on a given day |
| Langfuse (observability)        | Free tier | Up to 50k traces/month free                   |
| Helicone (proxy)                | Free tier | Up to 10k requests/month free                 |

### Monthly Cost by Scale

| Scale             | Daily active users | Queries/day | LLM cost/mo   | Infra (est.) | **Total/mo** |
| ----------------- | ------------------ | ----------- | ------------- | ------------ | ------------ |
| **100 users**     | 40                 | 200         | **$2.90**     | $10          | **~$13**     |
| **1,000 users**   | 400                | 2,000       | **$29.00**    | $30          | **~$59**     |
| **10,000 users**  | 4,000              | 20,000      | **$290.00**   | $100         | **~$390**    |
| **100,000 users** | 40,000             | 200,000     | **$2,900.00** | $500         | **~$3,400**  |

> LLM cost = `daily queries × $0.00483 × 30 days`
> Infra = Railway (PostgreSQL + Redis + API server) estimated at each scale tier

### Cost at Scale: Optimization Levers

| Lever                                                | Savings potential | Implementation                                                |
| ---------------------------------------------------- | ----------------- | ------------------------------------------------------------- |
| Prompt caching (gpt-4.1)                             | 25–40%            | System prompt is static per user locale — cache eligible      |
| Downgrade to `gpt-4.1-mini`                          | ~80%              | Accuracy tradeoff — acceptable for simple single-tool queries |
| Hybrid routing (mini for simple, 4.1 for multi-tool) | ~50%              | Route by complexity before LLM call                           |
| Response caching (Redis)                             | 10–20%            | Cache portfolio summary responses for 5 min TTL               |
| Rate limiting (already built)                        | Prevents abuse    | 20 req/user/60s sliding window already enforced               |

#### Hybrid routing projection (10,000 users)

| Traffic segment       | Share | Model        | Cost/req | Monthly cost |
| --------------------- | ----- | ------------ | -------- | ------------ |
| Scope-gate rejections | 15%   | gpt-4.1      | $0.001   | $13          |
| Single-tool (simple)  | 55%   | gpt-4.1-mini | $0.0015  | $49          |
| Multi-tool (complex)  | 30%   | gpt-4.1      | $0.015   | $270         |
| **Total**             |       |              |          | **~$332/mo** |

That's a **~55% reduction** vs uniform gpt-4.1 at the 10k user scale.

---

## Observability Tool Costs

| Tool     | Plan      | Cost   | Limit                                      |
| -------- | --------- | ------ | ------------------------------------------ |
| Langfuse | Free tier | $0     | 50k traces/month — sufficient to ~1k users |
| Langfuse | Team      | $59/mo | Unlimited traces                           |
| Helicone | Free tier | $0     | 10k requests/month                         |
| Helicone | Pro       | $80/mo | Unlimited requests                         |

At 100 users (200 queries/day = ~6,000/month) both tools stay on free tier.
At 1,000 users (~60,000/month) Langfuse Team + Helicone Pro = ~$140/month additional.

---

## Cost Guardrails (Built Into the Agent)

The agent has hard cost controls that prevent runaway spend regardless of query complexity:

| Guardrail          | Value           | Mechanism                                                        |
| ------------------ | --------------- | ---------------------------------------------------------------- |
| Per-request cap    | $0.25           | Agent aborts mid-run if estimated cost exceeds threshold         |
| Rate limiter       | 20 req/min/user | Sliding-window guard, HTTP 429 on excess — prevents cost abuse   |
| Max iterations     | 15              | Prevents infinite tool-call loops inflating token counts         |
| Request timeout    | 60s             | `AbortController` kills stalled streams — no runaway LLM charges |
| Context truncation | 32k chars       | Tool outputs are truncated before injection — caps prompt tokens |

These guardrails mean the p99 cost per request is bounded at $0.25, and typical abuse attempts (prompt injection, infinite loops) are caught before they become expensive.
