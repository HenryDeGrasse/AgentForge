# Epic 1: Fix Escalation Logic (Critical Bug)

**Priority**: P0 — Blocks all other work
**Estimated effort**: 2-3 hours
**Files touched**: 3
**Tests added**: ~15

---

## Problem Statement

The `ReactAgentService` escalation logic forces the LLM to call tools even when it correctly refuses an out-of-scope request. This causes "write me a poem" to return portfolio data.

The escalation was designed to prevent the LLM from answering portfolio questions without calling tools (e.g., making up data). But it backfires on out-of-scope requests where the LLM correctly tries to decline.

## Root Cause

In `react-agent.service.ts`, lines ~406-430:

```typescript
if (
  toolDefinitions.length > 0 &&
  toolCallsCount === 0 &&
  !escalationAttempted &&
  !looksLikeRefusal
) {
  escalationAttempted = true;
  escalationPending = true;
  // Sets toolChoice = 'required' on next iteration
}
```

`looksLikeRefusal` is too narrow — only matches 7 patterns. The LLM can refuse in hundreds of ways.

## Design

### Option A: Broaden refusal detection (rejected)

Adding more regex patterns is the same brittle approach we just removed from the scope gate. The LLM will always find new ways to phrase things.

### Option B: Flip the logic — detect portfolio-intent instead (selected)

Instead of detecting refusals (negative), detect whether the LLM's response looks like it's **trying to answer a portfolio question** without tools (positive). Only escalate if the response contains portfolio-specific claims without tool backing.

```typescript
const looksLikeUnbackedPortfolioClaim =
  /\b(?:your portfolio|your holdings|total value|net worth|allocated|positions?|performance|return(?:s|ed)|risk (?:score|level|rating)|compliant|non-compliant|tax (?:liability|estimate)|rebalance|stress test)\b/i.test(
    responseText
  ) && toolCallsCount === 0;

if (
  toolDefinitions.length > 0 &&
  looksLikeUnbackedPortfolioClaim &&
  !escalationAttempted
) {
  // Escalate — LLM is making portfolio claims without tool data
}
```

This way:

- "Write me a poem" → LLM says "I can't help with that" → no portfolio keywords → no escalation ✅
- "Show my portfolio" → LLM says "Your portfolio has..." → portfolio keywords without tools → escalate ✅
- "Hello" → LLM says "Hi! How can I help?" → no portfolio keywords → no escalation ✅

### Option C: Remove escalation entirely (backup)

If Option B proves too complex, remove escalation and strengthen the system prompt instead. The system prompt already says "you MUST call the relevant tools." If the LLM ignores that, one more nudge won't help.

## Implementation Plan

1. Replace `looksLikeRefusal` with `looksLikeUnbackedPortfolioClaim`
2. Change escalation message to be more specific: "You appear to be making claims about the user's portfolio without calling any tools. Either call the appropriate tool to get real data, or if this request is outside your scope, decline politely."
3. Keep `toolChoice: 'required'` only when escalating for unbacked claims
4. Add tests for:
   - Out-of-scope requests → no escalation, no tool calls
   - Portfolio questions where LLM skips tools → escalation fires
   - Greetings/smalltalk → no escalation
   - Clarifying questions from LLM → no escalation
   - Mixed messages (financial keywords but off-topic) → no escalation

## Acceptance Criteria

- [ ] "Write me a poem" → polite refusal, 0 tool calls
- [ ] "Tell me a joke" → polite refusal, 0 tool calls
- [ ] "What's 2+2" → polite refusal, 0 tool calls
- [ ] "Hello" → greeting response, 0 tool calls
- [ ] "Show my portfolio" → calls get_portfolio_summary
- [ ] "Analyze my risk" → calls analyze_risk
- [ ] LLM saying "Your portfolio is worth $50k" without tools → escalation fires
- [ ] LLM saying "I can only help with portfolio questions" → no escalation
- [ ] All existing tests pass (no regressions)

## Test Strategy

Unit tests in `react-agent.service.spec.ts`:

- Mock LLM to return various text responses (refusals, portfolio claims, greetings)
- Verify escalation fires/doesn't fire based on response content
- Verify tool calls happen/don't happen
- Verify final response content

## Rollout Plan

1. Write failing tests
2. Fix escalation logic
3. Run full test suite
4. Commit
