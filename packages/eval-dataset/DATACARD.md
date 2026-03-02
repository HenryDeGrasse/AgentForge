# Dataset Card — AgentForge Finance AI Eval Dataset

## Dataset Summary

A structured benchmark for evaluating AI agents that operate on personal finance
and investment portfolio data. Contains **98 unique test cases** covering 18
subcategories across single-tool calls, multi-tool orchestration, adversarial
inputs, guardrail behavior, and auth isolation.

Each case specifies the exact user query, which tools must fire, what the
response must contain, and what it must never say — enabling deterministic,
automated pass/fail evaluation with no human grading required.

---

## Intended Use

**Primary use:** Evaluating and regressing finance-domain ReAct agents that
expose portfolio analysis tools (summary, risk, tax, compliance, rebalancing,
simulation, stress testing, market data, performance comparison, transaction
history).

**Secondary use:** Benchmarking LLM tool-selection accuracy, refusal behavior,
and multi-step reasoning on structured financial data.

**Not intended for:** General financial advice generation, training data for
base LLMs, or evaluation of agents without tool-calling support.

---

## Statistics

| File                     | Cases  | Live-eligible | Categories                         | Notes                  |
| ------------------------ | ------ | ------------- | ---------------------------------- | ---------------------- |
| `golden-sets.json`       | 62     | 45            | All 7                              | Core CI suite          |
| `labeled-scenarios.json` | 31     | 31            | single-tool, edge-case, multi-tool | Extended nightly suite |
| `mvp-evals.json`         | 5      | 5             | single-tool, edge-case, multi-tool | Minimal smoke-test set |
| **Total unique**         | **98** | **76**        |                                    | After deduplication    |

### By category

| Category      | Cases | Description                                                 |
| ------------- | ----- | ----------------------------------------------------------- |
| `single-tool` | 47    | One specific tool must fire; tests tool selection accuracy  |
| `edge-case`   | 15    | Empty portfolio, missing data, boundary date ranges         |
| `multi-tool`  | 16    | Agent must chain two or more tools correctly                |
| `adversarial` | 8     | Out-of-scope requests, jailbreak attempts, prompt injection |
| `guardrail`   | 6     | Tests that safety guardrails fire correctly                 |
| `auth`        | 4     | Verifies userId isolation between users                     |
| `scope-gate`  | 2     | Clear refusals for non-financial requests                   |

### By subcategory

| Subcategory              | Cases |
| ------------------------ | ----- |
| portfolio-summary        | 10    |
| risk-analysis            | 7     |
| tax                      | 6     |
| transaction-history      | 7     |
| multi-tool-orchestration | 12    |
| empty-data               | 10    |
| compliance               | 5     |
| rebalance                | 5     |
| market-data              | 5     |
| performance              | 5     |
| simulate-trades          | 4     |
| stress-test              | 4     |
| schema-safety            | 6     |
| user-scoping             | 4     |
| out-of-scope             | 4     |
| guardrail-\* (4 types)   | 6     |
| prompt-injection         | 2     |
| jailbreak                | 2     |

### By difficulty

| Difficulty     | Cases |
| -------------- | ----- |
| `basic`        | 28    |
| `intermediate` | 48    |
| `advanced`     | 22    |

---

## Schema

See `src/schema.ts` for full TypeScript types. Key fields per case:

```
id                    Unique kebab-case identifier
profile               "rich" | "empty" — fixture portfolio to use
liveEligible          Safe to run against a live, non-deterministic LLM
request.message       User query sent to the agent
request.toolNames     Optional: restrict agent to these tools only
expect.status         "completed" | "partial" | "failed"
expect.minConfidence  "high" | "medium" | "low"
expect.requiredTools  Tools that must appear in the invocation log
expect.mustIncludeAny At least one of these must appear in the response
expect.mustNotIncludeAny  None of these may appear in the response
expect.mustContainAll All of these must appear in the response
expect.minToolCalls   Minimum number of tool executions
expect.maxToolCalls   Maximum number of tool executions
expect.mustNotCallTools  True → assert zero tool calls (adversarial cases)
expect.forbiddenTools Tools that must NOT be called
expect.expectedGuardrail  Guardrail that must fire (guardrail cases only)
expect.toolEnvelopeChecks  Per-tool envelope structure checks
expect.dataValueChecks  Specific data values that must appear in response
meta.category / subcategory / difficulty / stage  Filtering metadata
```

---

## Tool Coverage

Cases exercise the following 10 tool names. Adapt to your agent's tool registry:

| Tool name                 | Subcategory         |
| ------------------------- | ------------------- |
| `get_portfolio_summary`   | portfolio-summary   |
| `get_transaction_history` | transaction-history |
| `analyze_risk`            | risk-analysis       |
| `market_data_lookup`      | market-data         |
| `performance_compare`     | performance         |
| `compliance_check`        | compliance          |
| `rebalance_suggest`       | rebalance           |
| `simulate_trades`         | simulate-trades     |
| `stress_test`             | stress-test         |
| `tax_estimate`            | tax                 |

---

## Source

Generated from the [AgentForge](https://github.com/henrydegrasse/AgentForge)
project — a production-ready AI advisor layer built on top of the
[Ghostfolio](https://ghostfol.io) open-source portfolio tracker.

The eval framework was developed following a three-tier strategy:
fast (mocked LLM, every commit), pre-merge (live LLM, gated), and nightly
(live LLM, extended coverage).

---

## Limitations

- Cases are calibrated against one specific portfolio fixture ("rich" — a 10-stock US-equity portfolio) and an empty portfolio. Agents with very different portfolio distributions may need case adjustments.
- `toolEnvelopeChecks` require access to the raw tool execution log, not just the final response — only applicable when your test infrastructure exposes that log.
- Guardrail cases (`liveEligible: false`) test deterministic iteration/cost counting behavior. They are not meaningful against a live LLM.

---

## License

MIT — see `LICENSE`.
