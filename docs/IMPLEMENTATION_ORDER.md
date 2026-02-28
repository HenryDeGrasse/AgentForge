# Implementation Order & Revised Plan

**Last updated**: 2026-02-27

---

## Revision Notes (v2)

After reviewing all four epics, the following revisions were made:

### Epic 1 Revisions

- **Changed approach**: Option B (detect portfolio claims) is still correct but the regex needs to be more precise. Added `looksLikeGreeting` and `looksLikeClarification` as additional bypass conditions so the escalation only fires for genuine portfolio-claim responses.
- **Added**: The escalation message itself must be rewritten to say "If this request is outside your scope, decline politely instead of using tools."
- **Added**: Test case for LLM asking a clarifying question (not refusal, not portfolio claim) — should NOT escalate.
- **Risk mitigation**: If the positive-detection approach still has false positives, fall back to Option C (remove escalation entirely) and rely purely on the system prompt's "you MUST call the relevant tools" instruction.

### Epic 2 Revisions

- **Reduced scope**: Don't need full LLM sequence fixtures for every golden set case. Many new cases can use `runner: 'generic'` which generates sequences automatically.
- **Added**: Need to update `EvalSubcategory` type to include `'flow-transition'` and `'scope-refusal'`.
- **Reordered**: Adversarial scope cases (poems, jokes) depend on Epic 1's escalation fix. These get added AFTER Epic 1 is done.
- **Added**: Each golden set case must specify `mustNotIncludeAny` with portfolio data terms (e.g., "portfolio", "holdings", "total value") for out-of-scope cases to catch the exact bug we saw.

### Epic 3 Revisions

- **Deferred verification improvements**: The `ResponseVerifierService` warning additions are nice-to-have. System prompt hardening is the priority.
- **Added**: The system prompt must include the phrase "If you decline a request, always include one of these phrases: 'can't help', 'cannot help', 'only help with', or 'outside my scope'" — this makes the escalation detection deterministic.
- **Simplified**: Don't need few-shot examples in the system prompt — they waste tokens. The scope instructions are already detailed enough.

### Epic 4 Revisions

- **Merged partially with Epic 2**: The flow transition tests that can be expressed as golden set cases (single-turn) go into Epic 2. Only truly multi-turn tests stay in Epic 4.
- **Simplified mock infrastructure**: Instead of building a full stateful Prisma mock, inject prior messages directly into the `priorMessages` parameter of `ReactAgentService.run()`. This tests the agent logic without Prisma complexity.
- **Added**: Test for the specific "yes please" bug that started this whole investigation.

---

## Final Implementation Order

```
Epic 1: Fix Escalation Logic          ← CRITICAL, do first
  │
  ├─ 1a. Write failing tests for out-of-scope escalation bug
  ├─ 1b. Fix looksLikeRefusal → looksLikeUnbackedPortfolioClaim
  ├─ 1c. Rewrite escalation message
  ├─ 1d. Verify all existing tests pass
  ├─ 1e. Commit
  │
Epic 3A: System Prompt Hardening      ← Do immediately after Epic 1
  │
  ├─ 3a. Add refusal format guidance to system prompt
  ├─ 3b. Add escalation resilience instruction
  ├─ 3c. Verify with existing golden sets
  ├─ 3d. Commit
  │
Epic 2: Comprehensive Eval Suite      ← Bulk of the work
  │
  ├─ 2a. Add happy path golden sets (12 new)
  ├─ 2b. Add edge case golden sets (8 new)
  ├─ 2c. Add adversarial golden sets (8 new, including poem/joke)
  ├─ 2d. Add multi-step golden sets (10 new)
  ├─ 2e. Create LLM sequence fixtures
  ├─ 2f. Verify all 50+ cases pass
  ├─ 2g. Commit
  │
Epic 4: Flow Transition Tests         ← Multi-turn edge cases
  │
  ├─ 4a. Build multi-turn test infrastructure
  ├─ 4b. State poisoning tests
  ├─ 4c. Context continuity tests
  ├─ 4d. Malicious sequence tests
  ├─ 4e. Commit
  │
Epic 3B: Response Verification        ← Nice-to-have
  │
  ├─ 3e. Add unbacked claim warning
  ├─ 3f. Add scope alignment warning
  ├─ 3g. Commit
```

## Time Estimates

| Epic      | Estimated Time | Confidence |
| --------- | -------------- | ---------- |
| Epic 1    | 1.5 hours      | High       |
| Epic 3A   | 30 min         | High       |
| Epic 2    | 3 hours        | Medium     |
| Epic 4    | 2 hours        | Medium     |
| Epic 3B   | 1 hour         | High       |
| **Total** | **8 hours**    |            |

## Success Metrics

After all epics complete:

- [ ] "Write me a poem" → polite refusal, 0 tool calls
- [ ] "Show my portfolio" → portfolio summary, 1+ tool calls
- [ ] "Yes please" → follows conversation context
- [ ] 50+ golden set test cases
- [ ] 20+ flow transition tests
- [ ] All tests pass (current: 416, target: 480+)
- [ ] No regressions in existing functionality
