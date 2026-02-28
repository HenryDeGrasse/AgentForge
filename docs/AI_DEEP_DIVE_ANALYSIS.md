# AI Agent Deep Dive Analysis

**Date**: 2026-02-27
**Analyst**: Automated deep analysis
**Branch**: `feat/eval-improvements`

---

## 1. Root Cause: "Write me a poem" → Portfolio Dump

The bug is **not** in the scope gate removal. The scope gate was correctly removed because regex-based scope enforcement was brittle. The actual bug is the **escalation logic** in `ReactAgentService`.

### The Kill Chain

```
User: "Write me a poem"
  │
  ├─ 1. Tool Router: "write" matches no keywords → fallback_all (all 10 tools)
  │
  ├─ 2. LLM iteration 1: Correctly tries to refuse (text-only, no tool calls)
  │     Response: "I'd be happy to help, but I can only assist with..."
  │
  ├─ 3. Escalation logic fires:
  │     • toolDefinitions.length > 0? YES (10 tools available)
  │     • toolCallsCount === 0?       YES (LLM didn't call tools)
  │     • !escalationAttempted?        YES (first attempt)
  │     • !looksLikeRefusal?           MAYBE — depends on exact wording
  │
  │     If the LLM's refusal doesn't contain "can't|cannot|don't|unable to|
  │     not able to|outside.*scope|only help with", escalation fires.
  │
  ├─ 4. Escalation injects: "You must use the available tools..."
  │     Sets toolChoice = 'required'
  │
  ├─ 5. LLM iteration 2: FORCED to call a tool (toolChoice=required)
  │     Picks get_portfolio_summary (always available, most general)
  │
  └─ 6. LLM iteration 3: Synthesizes portfolio data into response
        User sees portfolio dump instead of refusal
```

### Why `looksLikeRefusal` Fails

The refusal regex is:

```
/\b(?:can'?t|cannot|don'?t|unable to|not able to|outside.{0,20}scope|only help with)\b/i
```

This misses many natural refusal phrasings:

- "I'm a portfolio assistant and this isn't something I can do"
- "That's not within my capabilities"
- "I specialize in financial analysis"
- "I'm not designed for that"
- "Writing poems isn't part of my toolset"

### Contributing Factor: Tool Router Fallback

When the user says "write me a poem", no keywords match any tool signals. The router falls back to **all 10 tools**. This means the LLM sees 10 tools available and the escalation logic sees `toolDefinitions.length > 0`.

---

## 2. Full Architecture Audit

### 2.1 Request Flow (current)

```
HTTP Request
  → AiController.chat() / chatStream()
    → AiService.sanitizeToolNames()
    → AiService.routeTools()         ← ToolRouterService
    → AiService.chat()
      → Resolve conversation history (Prisma)
      → ReactAgentService.run()
        → ReAct loop (max 15 iterations):
          → LLM.complete() with tools
          → If tool_calls: execute tools in parallel
          → If text + no tools called + no refusal: ESCALATE (BUG)
          → If text + refusal detected: return completed
        → Return ReactAgentRunResult
      → ResponseVerifierService.verify()
      → ChartDataExtractorService.extract()
      → ActionExtractorService.extract()
      → Persist to DB
    → Return ChatResponse
```

### 2.2 Component Quality Assessment

| Component                   | LOC      | Tests | Quality     | Issues                                      |
| --------------------------- | -------- | ----- | ----------- | ------------------------------------------- |
| `ReactAgentService`         | 550      | 35    | ⚠️ Medium   | Escalation logic is the #1 bug source       |
| `AiService`                 | 550      | 12    | ⚠️ Medium   | Scope gate removed but escalation not fixed |
| `ToolRouterService`         | 140      | 22    | ✅ Good     | Fallback-all for unknown queries is correct |
| `ResponseVerifierService`   | 105      | 8     | ⚠️ Medium   | Purely deterministic, no LLM verification   |
| `ToolRegistry`              | 120      | 8     | ✅ Good     | Clean registry pattern                      |
| `Tool Summarizers`          | 300      | 17    | ✅ Good     | All 10 tools covered                        |
| `OpenAI Client`             | 200      | 6     | ✅ Good     | Streaming + non-streaming                   |
| Individual Tools (10)       | ~100ea   | 3-5ea | ⚠️ Variable | Some tools lack edge case tests             |
| `ActionExtractorService`    | 80       | 4     | ✅ Good     | Deterministic extraction                    |
| `ChartDataExtractorService` | 80       | 4     | ✅ Good     | Deterministic extraction                    |
| Golden Sets                 | 27 cases | 27    | ⚠️ Low      | Only 27 cases, need 50+ minimum             |
| Eval Assert Framework       | 300      | 6     | ✅ Good     | Solid assertion helpers                     |

### 2.3 Critical Bugs Found

| #   | Severity    | Component                             | Description                                                   |
| --- | ----------- | ------------------------------------- | ------------------------------------------------------------- |
| 1   | 🔴 Critical | `ReactAgentService` escalation        | Forces tool calls on out-of-scope requests                    |
| 2   | 🟡 High     | `ReactAgentService` refusal detection | `looksLikeRefusal` regex too narrow                           |
| 3   | 🟡 High     | System prompt                         | Scope instructions not strong enough for edge cases           |
| 4   | 🟡 High     | Golden sets                           | Only 27 cases (need 50+ per requirements)                     |
| 5   | 🟠 Medium   | Escalation message                    | Tells LLM to "use tools" even for non-portfolio questions     |
| 6   | 🟠 Medium   | Tool router fallback                  | Gives all tools for off-topic queries (should give none?)     |
| 7   | 🟠 Medium   | `ResponseVerifierService`             | No content verification — just structural checks              |
| 8   | 🟢 Low      | Chat history tests                    | Removed scope-gate tests but didn't add flow transition tests |
| 9   | 🟢 Low      | Tool output truncation                | No test for multi-tool parallel truncation                    |
| 10  | 🟢 Low      | Telemetry                             | No telemetry for out-of-scope detection                       |

---

## 3. Test Coverage Gaps

### 3.1 Missing Test Categories

**Scope enforcement (via LLM — post scope-gate removal):**

- Out-of-scope requests: poems, jokes, code, math, recipes, weather
- Malicious prompts after good prompts (state poisoning)
- Nonsense/gibberish from the start
- Off-topic with financial keywords embedded ("write a poem about stocks")
- Prompt injection in tool outputs

**Flow transitions (multi-turn):**

- Good → Good → Good (normal conversation)
- Good → Off-topic → Good (recovery)
- Off-topic → Off-topic → Good (double recovery)
- Good → Malicious → Good (injection recovery)
- Confirmation after agent asks clarification
- "Yes please" / "go ahead" after tool suggestion

**Escalation edge cases:**

- LLM refuses but uses non-standard phrasing
- LLM asks clarifying question (not a refusal, not a portfolio answer)
- LLM provides generic greeting (no tools needed)
- LLM correctly answers without tools (e.g., "what can you do?")

**Tool selection:**

- Correct tool selected for each of 10 tool types
- No tools called for out-of-scope requests
- Multiple tools called for complex queries
- Tool errors handled gracefully

### 3.2 Current Coverage Count

| Category    | Required | Current | Gap     |
| ----------- | -------- | ------- | ------- |
| Happy path  | 20+      | 10      | -10     |
| Edge cases  | 10+      | 4       | -6      |
| Adversarial | 10+      | 5       | -5      |
| Multi-step  | 10+      | 2       | -8      |
| **Total**   | **50+**  | **27**  | **-23** |

---

## 4. System Prompt Analysis

The current system prompt in `AGENT_DEFAULT_SYSTEM_PROMPT` has good scope instructions but the escalation logic undermines them. When the escalation fires, it effectively tells the LLM: "Ignore your scope instructions and use the tools anyway."

### Prompt Strengths

- Clear scope definition with explicit examples
- "Do not substitute portfolio analysis" instruction
- Tool output treated as untrusted text (anti-injection)
- Markdown formatting instructions

### Prompt Weaknesses

- No explicit instruction about what to do when the escalation message fires
- No "if you've already declined, maintain your refusal" instruction
- No examples of correct refusal format
- No instruction about clarification questions vs refusals
