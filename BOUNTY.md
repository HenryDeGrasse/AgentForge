# Portfolio-Aware Insider Monitoring Bounty

## Summary

This branch implements a complete **Portfolio-Aware Insider Monitoring** feature for AgentForge, enabling users to track SEC Form 4 insider trading filings for their portfolio holdings and receive automated briefings when their monitoring rules are triggered.

## Features Implemented

### 1. Insider Data Infrastructure

- **InsiderModule** with provider abstraction pattern:
  - `StubInsiderDataProvider`: Mock data for development/testing (NVDA, AMD, AAPL, MSFT, AMZN executives)
  - `SecApiInsiderDataProvider`: Live SEC Form 4 data via [sec-api.io](https://sec-api.io)
- **InsiderCacheService**: Database-backed cache with upsert-by-sourceKey deduplication
- **InsiderService**: Core service with activity queries, portfolio symbol resolution, and rule CRUD

### 2. REST API Endpoints

All endpoints under `/insider` with JWT authentication:

| Method | Endpoint                      | Description                              |
| ------ | ----------------------------- | ---------------------------------------- |
| GET    | `/insider/activity`           | Fetch insider activity for given symbols |
| GET    | `/insider/activity/portfolio` | Fetch activity for user's top N holdings |
| POST   | `/insider/rules`              | Create a monitoring rule                 |
| GET    | `/insider/rules`              | List user's monitoring rules             |
| PATCH  | `/insider/rules/:id`          | Update a monitoring rule                 |
| DELETE | `/insider/rules/:id`          | Delete a monitoring rule                 |
| POST   | `/insider/sync`               | Trigger activity sync                    |

### 3. AI Agent Tools

Five new tools integrated into the AI assistant:

| Tool                             | Description                                        |
| -------------------------------- | -------------------------------------------------- |
| `get_insider_activity`           | Fetch recent insider buy/sell activity for symbols |
| `create_insider_monitoring_rule` | Create an alert rule for insider activity          |
| `list_insider_monitoring_rules`  | List all configured monitoring rules               |
| `update_insider_monitoring_rule` | Modify an existing rule                            |
| `delete_insider_monitoring_rule` | Remove a monitoring rule                           |

### 4. Session Briefing System

- Active monitoring rules are evaluated at the start of each new conversation
- Triggered alerts are injected into the AI system prompt as a markdown table
- Users are proactively notified about matching insider activity
- Rules track `lastCheckedAt` and `lastNotifiedAt` to avoid duplicate notifications

### 5. Database Schema

New Prisma models:

- `InsiderTransaction`: Cached Form 4 filing data
- `InsiderMonitoringRule`: User-defined alert rules with scope, filters, and notification tracking
- `AiRunLog`: Observability logging for AI agent runs

## Monitoring Rule Configuration

Rules support flexible scoping:

| Scope          | Description                     |
| -------------- | ------------------------------- |
| `all_holdings` | Monitor all portfolio positions |
| `top_n`        | Monitor top N holdings by value |
| `symbols`      | Monitor specific ticker symbols |

Filters:

- **side**: `buy`, `sell`, or `any`
- **minValueUsd**: Minimum transaction value threshold
- **lookbackDays**: How far back to check (max 90 days)

## Integration with Main Branch

This branch has been synchronized with `origin/main` and includes:

- LangfuseService observability integration
- Simplified tool routing architecture
- Security improvements (rate limiting, timeout enforcement)
- New system prompt builder with structured guidance
- Comprehensive eval test suite expansion

## Testing

- Golden set eval cases for all insider tool scenarios
- LLM sequence fixtures for deterministic replay testing
- Tool stubs integrated into rich profile test fixtures

## Configuration

Set `SEC_API_KEY` in `.env` to enable live SEC Form 4 data. Without it, the stub provider returns mock data for testing.

```env
# INSIDER MONITORING (optional — stub data used if not set)
SEC_API_KEY=<your-sec-api-key>
```

---

**Branch**: `claude/sleepy-northcutt`
**Target**: `main`
**PR**: [#4](https://github.com/HenryDeGrasse/AgentForge/pull/4)
