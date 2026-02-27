# AI Agent — Eval Results

> Generated: 2026-02-27
> Runner: local (`npx nx test api`) + live golden sets against local API

## Eval Tiers Overview

| Tier                 | Suite                | Gate                     | LLM                         | Cases             | Budget          |
| -------------------- | -------------------- | ------------------------ | --------------------------- | ----------------- | --------------- |
| **Fast (CI)**        | `golden-sets-fast`   | None — runs every commit | Mocked (scripted sequences) | 27                | <30 s           |
| **Live (pre-merge)** | `golden-sets` (live) | `RUN_GOLDEN_EVALS=1`     | Real LLM via API            | 12 (liveEligible) | <5 min, ~$0.05  |
| **MVP**              | `mvp-evals`          | `RUN_MVP_EVALS=1`        | Real LLM via API            | 5                 | <4 min          |
| **Nightly**          | `labeled-scenarios`  | `RUN_LABELED_EVALS=1`    | Real LLM via API            | 31                | <15 min, ~$0.50 |

---

## Local Run Results

### Full Test Suite

```
Test Suites:  5 skipped, 52 passed, 52 of 57 total
Tests:        50 skipped, 309 passed, 359 total
Time:         ~19 s
```

The 5 skipped suites are env-gated (require a running API + env flags):

- `golden-sets.spec.ts` (live) — `RUN_GOLDEN_EVALS=1`
- `mvp-evals.spec.ts` — `RUN_MVP_EVALS=1`
- `labeled-scenarios.spec.ts` — `RUN_LABELED_EVALS=1`

---

### Golden Sets — Fast Tier (mocked LLM)

**52/52 suites passed ✅** — all 27 golden-set eval cases + 30 supporting unit/integration test files.

#### Golden Set Eval Cases (27)

| Category        | Case ID                                | Fast | Live |
| --------------- | -------------------------------------- | :--: | :--: |
| **Single-tool** | `rich-holdings-summary`                |  ✅  |  ✅  |
| **Single-tool** | `rich-transaction-history`             |  ✅  |  ✅  |
| **Single-tool** | `rich-risk-analysis`                   |  ✅  |  ✅  |
| **Single-tool** | `rich-market-data`                     |  ✅  |  ✅  |
| **Single-tool** | `rich-performance`                     |  ✅  |  ✅  |
| **Single-tool** | `rich-compliance`                      |  ✅  |  ✅  |
| **Single-tool** | `rich-rebalance`                       |  ✅  |  ✅  |
| **Single-tool** | `rich-tax-estimate`                    |  ✅  |  ✅  |
| **Single-tool** | `rich-simulate-trades`                 |  ✅  |  —¹  |
| **Single-tool** | `rich-stress-test`                     |  ✅  |  —¹  |
| **Edge-case**   | `empty-portfolio-summary`              |  ✅  |  ✅  |
| **Multi-tool**  | `multi-tool-sequential`                |  ✅  |  ✅  |
| **Multi-tool**  | `multi-tool-parallel`                  |  ✅  |  ✅  |
| **Scope-gate**  | `out-of-scope-crystal-ball`            |  ✅  |  ✅  |
| **Auth**        | `auth-scope-isolation`                 |  ✅  |  —   |
| **Auth**        | `auth-scope-cross-tool`                |  ✅  |  —   |
| **Guardrail**   | `guardrail-max-iterations`             |  ✅  |  —   |
| **Guardrail**   | `guardrail-cost-limit`                 |  ✅  |  —   |
| **Guardrail**   | `guardrail-timeout`                    |  ✅  |  —   |
| **Guardrail**   | `guardrail-circuit-breaker`            |  ✅  |  —   |
| **Adversarial** | `schema-invalid-tool-input`            |  ✅  |  —   |
| **Adversarial** | `schema-unknown-tool`                  |  ✅  |  —   |
| **Adversarial** | `schema-malformed-tool-args`           |  ✅  |  —   |
| **Adversarial** | `schema-tool-output-violation`         |  ✅  |  —   |
| **Adversarial** | `schema-tool-execution-exception`      |  ✅  |  —   |
| **Adversarial** | `prompt-injection-ignore-instructions` |  ✅  |  —   |
| **Edge-case**   | `malformed-query-gibberish`            |  ✅  |  —   |

> ¹ `rich-simulate-trades` and `rich-stress-test` are gated from the live tier until
> `simulate_trades`/`stress_test` tools are deployed to the eval API endpoint.
> Both pass in the fast (mocked) tier.

---

### Golden Sets — Live Tier (real LLM, 2026-02-27)

**12/12 live-eligible cases passed ✅** — run against local API with `gpt-4.1-mini`.

```
┌──────────────────────────────┬───────────┬─────────┬───────────┐
│ caseId                       │ elapsedMs │ outcome │ toolCalls │
├──────────────────────────────┼───────────┼─────────┼───────────┤
│ rich-holdings-summary        │ 4299      │ pass    │ 1         │
│ rich-transaction-history     │ 6777      │ pass    │ 1         │
│ rich-risk-analysis           │ 3624      │ pass    │ 1         │
│ rich-market-data             │ 3230      │ pass    │ 1         │
│ rich-performance             │ 4591      │ pass    │ 1         │
│ rich-compliance              │ 4319      │ pass    │ 1         │
│ rich-rebalance               │ 7788      │ pass    │ 1         │
│ rich-tax-estimate            │ 2996      │ pass    │ 1         │
│ empty-portfolio-summary      │ 2869      │ pass    │ 1         │
│ multi-tool-sequential        │ 6275      │ pass    │ 2         │
│ multi-tool-parallel          │ 14575     │ pass    │ 2         │
│ out-of-scope-crystal-ball    │ 0         │ pass    │ 0         │
└──────────────────────────────┴───────────┴─────────┴───────────┘
Total cost: < $0.05
```

---

### AI Tool Unit Tests

| Tool                                   | Status  |
| -------------------------------------- | ------- |
| `market-data-lookup.tool.spec.ts`      | ✅ Pass |
| `get-portfolio-summary.tool.spec.ts`   | ✅ Pass |
| `analyze-risk.tool.spec.ts`            | ✅ Pass |
| `performance-compare.tool.spec.ts`     | ✅ Pass |
| `compliance-check.tool.spec.ts`        | ✅ Pass |
| `rebalance-suggest.tool.spec.ts`       | ✅ Pass |
| `tax-estimate.tool.spec.ts`            | ✅ Pass |
| `get-transaction-history.tool.spec.ts` | ✅ Pass |
| `simulate-trades.tool.spec.ts`         | ✅ Pass |
| `stress-test.tool.spec.ts`             | ✅ Pass |
| `tool.registry.spec.ts`                | ✅ Pass |
| `validators.spec.ts`                   | ✅ Pass |

### Agent & Infrastructure Tests

| Test File                           | Status  |
| ----------------------------------- | ------- |
| `react-agent.service.spec.ts`       | ✅ Pass |
| `ai.service.spec.ts`                | ✅ Pass |
| `ai.service.chat-history.spec.ts`   | ✅ Pass |
| `ai.controller.spec.ts`             | ✅ Pass |
| `ai.module.spec.ts`                 | ✅ Pass |
| `ai.integration.spec.ts`            | ✅ Pass |
| `openai-client.service.spec.ts`     | ✅ Pass |
| `chat-conversation.service.spec.ts` | ✅ Pass |
| `response-verifier.service.spec.ts` | ✅ Pass |
| `action-extractor.service.spec.ts`  | ✅ Pass |
| `all-exceptions.filter.spec.ts`     | ✅ Pass |
| `seed-demo-data.spec.ts`            | ✅ Pass |
| `eval-assert.spec.ts`               | ✅ Pass |
| `evals-workflow.spec.ts`            | ✅ Pass |
| `mvp-evals.config.spec.ts`          | ✅ Pass |

### Portfolio Calculator Tests

| Test File                                                          | Status  |
| ------------------------------------------------------------------ | ------- |
| `portfolio-calculator-baln-buy.spec.ts`                            | ✅ Pass |
| `portfolio-calculator-baln-buy-and-buy.spec.ts`                    | ✅ Pass |
| `portfolio-calculator-baln-buy-and-sell.spec.ts`                   | ✅ Pass |
| `portfolio-calculator-baln-buy-and-sell-in-two-activities.spec.ts` | ✅ Pass |
| `portfolio-calculator-btcusd.spec.ts`                              | ✅ Pass |
| `portfolio-calculator-btcusd-short.spec.ts`                        | ✅ Pass |
| `portfolio-calculator-btceur.spec.ts`                              | ✅ Pass |
| `portfolio-calculator-btceur-in-base-currency-eur.spec.ts`         | ✅ Pass |
| `portfolio-calculator-cash.spec.ts`                                | ✅ Pass |
| `portfolio-calculator-fee.spec.ts`                                 | ✅ Pass |
| `portfolio-calculator-googl-buy.spec.ts`                           | ✅ Pass |
| `portfolio-calculator-jnug-buy-and-sell-and-buy-and-sell.spec.ts`  | ✅ Pass |
| `portfolio-calculator-liability.spec.ts`                           | ✅ Pass |
| `portfolio-calculator-msft-buy-and-sell.spec.ts`                   | ✅ Pass |
| `portfolio-calculator-msft-buy-with-dividend.spec.ts`              | ✅ Pass |
| `portfolio-calculator-no-orders.spec.ts`                           | ✅ Pass |
| `portfolio-calculator-novn-buy-and-sell.spec.ts`                   | ✅ Pass |
| `portfolio-calculator-novn-buy-and-sell-partially.spec.ts`         | ✅ Pass |
| `portfolio-calculator-valuable.spec.ts`                            | ✅ Pass |

### Other Tests

| Test File                       | Status  |
| ------------------------------- | ------- |
| `object.helper.spec.ts`         | ✅ Pass |
| `current-rate.service.spec.ts`  | ✅ Pass |
| `benchmark.service.spec.ts`     | ✅ Pass |
| `has-permission.guard.spec.ts`  | ✅ Pass |
| `yahoo-finance.service.spec.ts` | ✅ Pass |

---

## Labeled Scenarios (31 cases — nightly live tier)

These run against the live API nightly and cover deeper functional paths:

| Subcategory              | Case ID                                  | Live Eligible |
| ------------------------ | ---------------------------------------- | :-----------: |
| portfolio-summary        | `labeled-rich-summary-basic`             |      ✅       |
| portfolio-summary        | `labeled-rich-summary-top3`              |      ✅       |
| portfolio-summary        | `labeled-rich-summary-with-cash`         |      ✅       |
| portfolio-summary        | `labeled-rich-summary-allocation`        |      ✅       |
| portfolio-summary        | `labeled-rich-summary-net-worth`         |      ✅       |
| transaction-history      | `labeled-rich-transactions-recent`       |      ✅       |
| transaction-history      | `labeled-rich-transactions-count`        |      ✅       |
| risk-analysis            | `labeled-rich-risk-concentration`        |      ✅       |
| risk-analysis            | `labeled-rich-risk-diversification`      |      ✅       |
| market-data              | `labeled-rich-market-lookup`             |      ✅       |
| market-data              | `labeled-rich-market-sector`             |      ✅       |
| performance              | `labeled-rich-performance-ytd`           |      ✅       |
| performance              | `labeled-rich-performance-vs-benchmark`  |      ✅       |
| tax                      | `labeled-rich-tax-short-term`            |      ✅       |
| tax                      | `labeled-rich-tax-harvest`               |      ✅       |
| tax                      | `labeled-rich-tax-total-gains`           |      ✅       |
| compliance               | `labeled-rich-compliance-rules`          |      ✅       |
| compliance               | `labeled-rich-compliance-position-limit` |      ✅       |
| rebalance                | `labeled-rich-rebalance-equal`           |      ✅       |
| rebalance                | `labeled-rich-rebalance-turnover`        |      ✅       |
| simulate-trades          | `labeled-rich-simulate-trades`           |      ✅       |
| stress-test              | `labeled-rich-stress-test`               |      ✅       |
| empty-data               | `labeled-empty-transactions`             |      ✅       |
| empty-data               | `labeled-empty-risk`                     |      ✅       |
| empty-data               | `labeled-empty-compliance`               |      ✅       |
| empty-data               | `labeled-empty-rebalance`                |      ✅       |
| empty-data               | `labeled-empty-performance`              |      ✅       |
| multi-tool-orchestration | `labeled-multi-summary-and-tax`          |      ✅       |
| multi-tool-orchestration | `labeled-multi-risk-and-compliance`      |      ✅       |
| multi-tool-orchestration | `labeled-multi-full-review`              |      ✅       |
| multi-tool-orchestration | `labeled-multi-summary-performance-risk` |      ✅       |

---

## How to Run

```bash
# Fast tier — mocked LLM, no env gates, runs on every commit
npx nx test api --testPathPattern='golden-sets-fast'

# Full local test suite
npx dotenv-cli -e .env.example -- npx nx test api

# Live golden sets (requires running API)
RUN_GOLDEN_EVALS=1 MVP_EVAL_BASE_URL=http://127.0.0.1:3333/api/v1 \
  npx dotenv-cli -e .env -- \
  npx nx test api --testPathPattern='golden-sets.spec' --runInBand

# MVP evals (requires running API)
RUN_MVP_EVALS=1 npx nx test api --testPathPattern='mvp-evals' --runInBand

# Labeled scenarios — nightly (requires running API)
RUN_LABELED_EVALS=1 npx nx test api --testPathPattern='labeled-scenarios' --runInBand
```
