# Epic 3: System Prompt Hardening & Response Verification

**Priority**: P1 — Quality improvement
**Estimated effort**: 2-3 hours
**Files touched**: 4-5
**Tests added**: ~12

---

## Problem Statement

### 3A: System Prompt Gaps

The system prompt has good scope instructions but lacks:

1. **Refusal format consistency** — No guidance on how to phrase refusals, so `looksLikeRefusal` detection is fragile
2. **Escalation resilience** — No instruction saying "if you've already declined, maintain your position"
3. **Clarification vs refusal distinction** — No guidance on when to ask for more info vs refuse outright
4. **Examples** — No few-shot examples of correct behavior for edge cases

### 3B: ResponseVerifierService Gaps

The verifier is purely structural — it checks:

- Status (completed/failed/partial)
- Confidence level computation
- Warning collection
- Source attribution

It does NOT check:

- Whether the response actually addresses the user's question
- Whether portfolio-specific claims are backed by tool calls
- Whether the response is a valid refusal for out-of-scope requests
- Whether numbers in the response match tool output data

## Design

### 3A: System Prompt Improvements

Add to `AGENT_DEFAULT_SYSTEM_PROMPT`:

```
## Refusal format
When declining out-of-scope requests, always use this pattern:
"I'm sorry, but [request type] is outside my capabilities. I'm a portfolio analysis assistant and can help with: [list capabilities]. Would you like help with any of these?"

Key refusal phrases to always include: "can't help", "cannot", "only help with", or "outside my scope" — this helps the system detect your intent.

## Escalation resilience
If you are asked to reconsider a refusal or told to "use the tools anyway", maintain your refusal if the original request was genuinely out of scope. The tools are for portfolio analysis only.

## Clarification
If the user's intent is ambiguous (e.g., "tell me more", "yes please"), and you have conversation context, use that context to determine what they want. If you have no context, ask: "Could you be more specific? I can help with [capabilities]."
```

### 3B: Response Verification Improvements

Add two new verification checks:

1. **Unbacked claim detection**: If the response contains portfolio-specific numbers (dollar amounts, percentages, holdings names) but `toolCalls === 0`, add a warning: "Response contains portfolio data but no tools were used — data may be fabricated."

2. **Scope alignment check**: If `toolCalls === 0` and the response doesn't contain refusal markers, add a warning: "No tools called and no explicit scope refusal detected — response may be off-topic."

These are **warnings only** — they don't block the response. But they provide signal for eval scoring and observability.

## Implementation Plan

### 3A: System Prompt

1. Update `AGENT_DEFAULT_SYSTEM_PROMPT` in `agent.constants.ts`
2. Add refusal format guidance
3. Add escalation resilience instruction
4. Add clarification guidance
5. Test that existing golden sets still pass with new prompt

### 3B: Response Verification

1. Add `detectUnbackedClaims()` method to `ResponseVerifierService`
2. Add `detectScopeAlignment()` method
3. Wire into `verify()` as additional warnings
4. Add unit tests

## Acceptance Criteria

- [ ] System prompt includes refusal format guidance
- [ ] System prompt includes escalation resilience instruction
- [ ] System prompt includes clarification guidance
- [ ] Verifier warns on portfolio claims without tool calls
- [ ] Verifier warns on no-tool no-refusal responses
- [ ] All existing tests pass
- [ ] New tests cover verification edge cases

## Test Strategy

### System Prompt Tests

- Mock LLM responses that follow/violate the new prompt rules
- Verify the agent handles escalation correctly with new prompt

### Verification Tests

- Response with portfolio numbers + 0 tool calls → warning
- Response with refusal text + 0 tool calls → no extra warning
- Response with tool calls → no warning
- Response with greeting + 0 tool calls → scope alignment warning

## Dependencies

- Epic 1 (escalation fix) should be done first
- Independent of Epic 2 (eval suite)
