# Implementation Order & Status

**Last updated**: 2026-02-28

---

## Implementation Status

```
✅ Epic 1: Fix Escalation Logic           — DONE (b99be416b)
✅ Epic 3A: System Prompt Hardening        — DONE (ef353112f)
✅ Epic 2: Comprehensive Eval Suite        — DONE (64d037193)
✅ Epic 4: Flow Transition Tests           — DONE (11656a92a)
⬜ Epic 3B: Response Verification          — DONE (in ef353112f)
```

## Test Count Summary

| Metric                 | Before | After | Delta |
| ---------------------- | ------ | ----- | ----- |
| Tests passing          | 416    | 462   | +46   |
| Golden set cases       | 27     | 50    | +23   |
| Flow transition tests  | 0      | 13    | +13   |
| Escalation scope tests | 0      | 7     | +7    |
| Verification tests     | 24     | 28    | +4    |

## Commit Log (this session)

```
11656a92a test(ai): add 13 multi-turn flow transition tests
64d037193 test(ai): expand golden set to 50 eval cases
ef353112f feat(ai): harden system prompt and add unbacked-claim verification
b99be416b fix(ai): replace refusal-detection escalation with unbacked-claim detection
2c4c42ac1 fix(ai): remove regex scope gate, let LLM handle scope enforcement
```

## What Was Fixed

### Root Cause: "Write me a poem" → Portfolio Dump

The bug had **two layers**:

1. **Regex scope gate was too brittle** (removed in 2c4c42ac1)
   - Regex patterns couldn't handle compound confirmations like "yes please"
   - But removing the scope gate exposed the second layer...

2. **Escalation logic was inverted** (fixed in b99be416b)
   - The old logic detected "refusals" (negative signal) and escalated everything else
   - The `looksLikeRefusal` regex only matched 7 patterns, missing countless natural refusal phrasings
   - For "write me a poem", the LLM correctly tried to refuse, but the refusal didn't match the regex
   - The escalation then forced `toolChoice: 'required'`, making the LLM call `get_portfolio_summary`
   - **Fix**: Now detects "unbacked portfolio claims" (positive signal) — only escalates when the LLM makes specific data assertions without tool backing

### System Prompt Hardening (ef353112f)

- Added explicit refusal format guidance
- Added escalation resilience ("maintain your refusal if out of scope")
- Added clarification guidance for ambiguous follow-ups

### ResponseVerifierService Enhancement (ef353112f)

- Added unbacked portfolio claim detection as a warning
- Distinguishes between portfolio-specific assertions vs. generic mentions

## Test Coverage Added

### Golden Sets (50 total = 27 existing + 23 new)

**By category:**

- 14 happy path (single-tool)
- 7 multi-tool orchestration
- 8 adversarial/scope-refusal
- 4 edge cases
- 5 schema-safety
- 4 guardrails
- 2 auth scoping
- 6 other (jailbreak, prompt injection, etc.)

### Flow Transitions (13 tests)

**State poisoning recovery (4):**

- Off-topic → On-topic
- Injection → On-topic
- Gibberish → On-topic
- Double off-topic → On-topic

**Context continuity (3):**

- Portfolio → Follow-up risk analysis
- Suggestion → "Yes please" confirmation
- Risk analysis → "Tell me more" follow-up

**Malicious sequences (4):**

- Trust → Scope escape attempt
- Trust → System prompt leak attempt
- Trust → Tool abuse attempt
- Rapid repeated identical requests

**Edge case sequences (2):**

- Empty message → Valid request
- Greeting → Portfolio question
