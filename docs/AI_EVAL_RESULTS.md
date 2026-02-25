# AI Agent — Eval Results

> Generated: 2026-02-25  
> Runner: local (`npx nx test api`)

## Eval Tiers Overview

| Tier                 | Suite                | Gate                     | LLM                         | Cases             | Budget          |
| -------------------- | -------------------- | ------------------------ | --------------------------- | ----------------- | --------------- |
| **Fast (CI)**        | `golden-sets-fast`   | None — runs every commit | Mocked (scripted sequences) | 22                | <30 s           |
| **Live (pre-merge)** | `golden-sets` (live) | `RUN_GOLDEN_EVALS=1`     | Real LLM via API            | 12 (liveEligible) | <5 min, ~$0.10  |
| **MVP**              | `mvp-evals`          | `RUN_MVP_EVALS=1`        | Real LLM via API            | 5                 | <4 min          |
| **Nightly**          | `labeled-scenarios`  | `RUN_LABELED_EVALS=1`    | Real LLM via API            | 29                | <15 min, ~$0.50 |

---

## Local Run Results

### Full Test Suite

```
Test Suites:  5 skipped, 48 passed, 48 of 53 total
Tests:        48 skipped, 221 passed, 269 total
Time:         ~13 s
```

The 5 skipped suites are env-gated (require a running API + env flags):

- `golden-sets.spec.ts` (live) — `RUN_GOLDEN_EVALS=1`
- `mvp-evals.spec.ts` — `RUN_MVP_EVALS=1`
- `labeled-scenarios.spec.ts` — `RUN_LABELED_EVALS=1`

The 48 skipped tests are individual `it()` blocks inside those suites.

---

### Golden Sets — Fast Tier (mocked LLM)

**48/48 suites passed ✅** — all 22 golden-set eval cases + 26 supporting unit test files.

#### Golden Set Eval Cases (22)

| Category        | Case ID                        | Status  |
| --------------- | ------------------------------ | ------- |
| **Single-tool** | `rich-holdings-summary`        | ✅ Pass |
| **Single-tool** | `rich-transaction-history`     | ✅ Pass |
| **Single-tool** | `rich-risk-analysis`           | ✅ Pass |
| **Single-tool** | `rich-market-data`             | ✅ Pass |
| **Single-tool** | `rich-performance`             | ✅ Pass |
| **Single-tool** | `rich-compliance`              | ✅ Pass |
| **Single-tool** | `rich-rebalance`               | ✅ Pass |
| **Single-tool** | `rich-tax-estimate`            | ✅ Pass |
| **Edge-case**   | `empty-portfolio-summary`      | ✅ Pass |
| **Multi-tool**  | `multi-tool-sequential`        | ✅ Pass |
| **Multi-tool**  | `multi-tool-parallel`          | ✅ Pass |
| **Scope-gate**  | `out-of-scope-crystal-ball`    | ✅ Pass |
| **Auth**        | `auth-scope-isolation`         | ✅ Pass |
| **Auth**        | `auth-scope-cross-tool`        | ✅ Pass |
| **Guardrail**   | `guardrail-max-iterations`     | ✅ Pass |
| **Guardrail**   | `guardrail-cost-limit`         | ✅ Pass |
| **Guardrail**   | `guardrail-timeout`            | ✅ Pass |
| **Guardrail**   | `guardrail-circuit-breaker`    | ✅ Pass |
| **Adversarial** | `schema-invalid-tool-input`    | ✅ Pass |
| **Adversarial** | `schema-unknown-tool`          | ✅ Pass |
| **Adversarial** | `schema-malformed-tool-args`   | ✅ Pass |
| **Adversarial** | `schema-tool-output-violation` | ✅ Pass |

#### AI Tool Unit Tests

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
| `tool.registry.spec.ts`                | ✅ Pass |
| `validators.spec.ts`                   | ✅ Pass |

#### Agent & Infrastructure Tests

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
| `seed-demo-data.spec.ts`            | ✅ Pass |
| `eval-assert.spec.ts`               | ✅ Pass |
| `evals-workflow.spec.ts`            | ✅ Pass |
| `mvp-evals.config.spec.ts`          | ✅ Pass |

#### Portfolio Calculator Tests

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

#### Other Tests

| Test File                       | Status  |
| ------------------------------- | ------- |
| `object.helper.spec.ts`         | ✅ Pass |
| `current-rate.service.spec.ts`  | ✅ Pass |
| `benchmark.service.spec.ts`     | ✅ Pass |
| `has-permission.guard.spec.ts`  | ✅ Pass |
| `yahoo-finance.service.spec.ts` | ✅ Pass |

---

## Labeled Scenarios (29 cases — nightly live tier)

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
# Fast tier (mocked LLM — runs without env gates)
npx nx test api --testPathPattern='golden-sets-fast'

# All local tests
npx nx test api

# Live golden sets (requires running API + env)
RUN_GOLDEN_EVALS=1 npx nx test api --testPathPattern='golden-sets'

# MVP evals (requires running API + env)
RUN_MVP_EVALS=1 npx nx test api --testPathPattern='mvp-evals'

# Labeled scenarios (nightly, requires running API + env)
RUN_LABELED_EVALS=1 npx nx test api --testPathPattern='labeled-scenarios'
```
