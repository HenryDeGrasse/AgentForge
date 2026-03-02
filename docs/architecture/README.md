# AgentForge Architecture

> For an interactive walkthrough, run `presenterm docs/presentation/slides.md` from the repo root.

## Contents

| Document                                | Description                                                 |
| --------------------------------------- | ----------------------------------------------------------- |
| [Overview](./overview.md)               | What AgentForge is, fork boundary, tech stack               |
| [AI Agent Layer](./ai-agent.md)         | ReAct loop, tools, guardrails, system prompt                |
| [Security & Guardrails](./security.md)  | Rate limiter, output sanitizer, scope gate, circuit breaker |
| [Evaluation Framework](./evaluation.md) | Four-tier eval strategy, fixture design, CI integration     |
| [Deployment](./deployment.md)           | Docker Compose, environment variables, dev.sh               |

## The Fork Boundary

Everything under `apps/api/src/app/endpoints/ai/` is new. The upstream Ghostfolio codebase is otherwise unchanged. The AI module calls into existing services (`PortfolioService`, `OrderService`, `ExchangeRateDataService`) — no new data-access logic was introduced.

```
apps/api/src/app/endpoints/ai/
├── agent/                  # ReAct loop + dynamic system prompt builder
│   ├── react-agent.service.ts
│   ├── system-prompt-builder.ts
│   └── agent.constants.ts
├── tools/                  # 10 portfolio tools + schemas + validators
│   ├── get-portfolio-summary.tool.ts
│   ├── analyze-risk.tool.ts
│   ├── market-data-lookup.tool.ts
│   ├── ... (7 more)
│   ├── schemas/
│   ├── utils/
│   └── tool.registry.ts
├── verification/           # Response confidence scoring + error codes
├── routing/                # Tool router (pass-through to LLM)
├── llm/                    # OpenAI client abstraction
├── observability/          # Langfuse tracing
├── utils/                  # Output sanitizer, conversation validator, claim detector
├── contracts/              # Structured error codes (AgentErrorCode)
├── ai.controller.ts        # HTTP endpoints
├── ai.service.ts           # Orchestration + streaming
└── ai.module.ts            # NestJS module wiring
```

## Development Phases

| Phase | Focus                                                                                        | Status  |
| ----- | -------------------------------------------------------------------------------------------- | ------- |
| **1** | Bug fixes — chart extraction, benchmark comparison, memory leak                              | ✅ Done |
| **2** | Agent reliability — parallel tool calls, context guard, escalation, cost estimation          | ✅ Done |
| **3** | Eval coverage — multi-turn tests, prompt injection tests                                     | ✅ Done |
| **4** | Security hardening — rate limiting, scope gate, output sanitization                          | ✅ Done |
| **5** | Operational improvements — structured errors, dynamic prompt, stream backpressure, telemetry | ✅ Done |
