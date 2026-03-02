# Bounty Summary

Branch: `claude/sleepy-northcutt`

## What Was Done
- Implemented portfolio-aware insider monitoring (SEC provider, cache, rules CRUD endpoints, and AI tools).
- Added insider tool schemas plus AI eval fixtures, golden sets, and tool stubs for test coverage.
- Integrated insider monitoring into the AI agent (allowed tool list, scope gate, and session briefing injection).
- Updated AgentForge system prompt builder to include insider activity guidance and disclaimers.
- Merged `origin/main` and resolved conflicts to keep the branch current.

## Verification
- `npm run affected:lint -- --base=main --head=HEAD --parallel=2 --quiet`
- `npm run format:check`
