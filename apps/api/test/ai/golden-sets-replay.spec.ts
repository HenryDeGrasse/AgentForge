/**
 * Golden Sets — Replay Tier (recorded real gpt-4.1 sessions)
 *
 * Replays sessions previously recorded by the live tier (EVAL_RECORD=1).
 * No OpenAI calls, $0, runs every commit in < 15 seconds.
 *
 * How it works:
 *   1. Reads fixtures/recorded/<caseId>.json — real gpt-4.1 request/response pairs
 *   2. Builds a ReplayLlmClient that returns those responses in order
 *   3. Builds real tools (same as live tier, via buildLiveTools())
 *   4. Runs ReactAgentService — tools execute for real, LLM is replayed
 *   5. Runs same assertEvalInvariants + assertToolCallCounts as live tier
 *
 * What this catches:
 *   - Assertion tightening: you add mustNotIncludeAny and recorded response violates it
 *   - Tool logic changes: tool code changes but replayed LLM expected old output shape
 *   - New required fields: schema changes that break tool execution
 *
 * What this does NOT catch (use live tier for these):
 *   - LLM behaviour drift (OpenAI updates model weights)
 *   - System prompt changes (prompt changes → different LLM decisions)
 *   - New eval cases (no recorded session exists yet)
 *
 * When to re-record:
 *   EVAL_RECORD=1 OPENAI_API_KEY=sk-... npx jest golden-sets-live --runInBand
 */
import {
  AGENT_DEFAULT_SYSTEM_PROMPT,
  AGENT_ALLOWED_TOOL_NAMES
} from '@ghostfolio/api/app/endpoints/ai/agent/agent.constants';
import { ReactAgentService } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import type {
  LLMClient,
  LLMCompletionResponse
} from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
import { ToolRegistry } from '@ghostfolio/api/app/endpoints/ai/tools/tool.registry';
import { ResponseVerifierService } from '@ghostfolio/api/app/endpoints/ai/verification/response-verifier.service';

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertEvalInvariants,
  assertToolCallCounts,
  type ToolInvocationEntry,
  type VerifiedResponseLike
} from './eval-assert';
import { validateEvalSuite } from './eval-case.schema';
import { buildLiveTools, LIVE_EVAL_USER_ID } from './live-tool-builder';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecordedSession {
  caseId: string;
  llmCalls: {
    latencyMs: number;
    request: unknown;
    response: LLMCompletionResponse;
  }[];
  model: string;
  query: string;
  result: {
    elapsedMs: number;
    estimatedCostUsd: number;
    executedTools: {
      envelope: { error?: unknown; status: string };
      toolName: string;
    }[];
    guardrail?: string;
    iterations: number;
    response: string;
    status: string;
    toolCalls: number;
  };
  timestamp: string;
}

// ─── Replay LLM client ───────────────────────────────────────────────────────

/**
 * Returns recorded LLM responses in order. No API calls.
 * If the agent makes more calls than were recorded (e.g. due to tool logic
 * changes producing different output), returns the last recorded response
 * to avoid an out-of-bounds crash.
 */
class ReplayLlmClient implements LLMClient {
  private callIndex = 0;

  public constructor(private readonly responses: LLMCompletionResponse[]) {}

  public async complete(): Promise<LLMCompletionResponse> {
    if (this.callIndex >= this.responses.length) {
      return this.responses[this.responses.length - 1];
    }

    return this.responses[this.callIndex++];
  }
}

// ─── Case + session loading ───────────────────────────────────────────────────

const RECORDED_DIR = join(__dirname, 'fixtures', 'recorded');

const allCases = validateEvalSuite(
  JSON.parse(readFileSync(join(__dirname, 'golden-sets.json'), 'utf8'))
);

const liveCases = allCases.filter((c) => c.liveEligible);

/** Discover which cases have a recorded session on disk. */
function getRecordedCaseIds(): Set<string> {
  if (!existsSync(RECORDED_DIR)) {
    return new Set();
  }

  return new Set(
    readdirSync(RECORDED_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
  );
}

function loadSession(caseId: string): RecordedSession {
  return JSON.parse(readFileSync(join(RECORDED_DIR, `${caseId}.json`), 'utf8'));
}

const recordedIds = getRecordedCaseIds();
const replayCases = liveCases.filter((c) => recordedIds.has(c.id));
const skippedCases = liveCases.filter((c) => !recordedIds.has(c.id));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildInvocationLog(toolNames: string[]): ToolInvocationEntry[] {
  return toolNames.map((toolName) => ({
    input: {},
    toolName,
    userId: LIVE_EVAL_USER_ID
  }));
}

/** Extract tool names from executedTools in agent result. */
function extractToolsFromResult(
  result: Awaited<ReturnType<ReactAgentService['run']>>
): string[] {
  return [...new Set(result.executedTools.map((t) => t.toolName))];
}

// ─── Guardrails (lenient — replay should not hit these) ──────────────────────

const REPLAY_GUARDRAILS = {
  circuitBreakerCooldownMs: 60_000,
  circuitBreakerFailureThreshold: 10,
  costLimitUsd: 10,
  fallbackCostPer1kTokensUsd: 0,
  maxIterations: 10,
  timeoutMs: 60_000
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Golden Sets (replay — recorded gpt-4.1)', () => {
  const verifier = new ResponseVerifierService();

  if (skippedCases.length > 0) {
    it.skip.each(skippedCases.map((c) => [c.id]))('[no recording] %s', () => {
      // Placeholder — skipped cases have no recorded session to replay
      expect(true).toBe(true);
    });
  }

  for (const evalCase of replayCases) {
    it(`[replay] [${evalCase.meta.category}] ${evalCase.id}`, async () => {
      const session = loadSession(evalCase.id);
      const responses = session.llmCalls.map((c) => c.response);
      const replayClient = new ReplayLlmClient(responses);

      const { tools } = buildLiveTools();
      const registry = new ToolRegistry();

      for (const tool of tools) {
        registry.register(tool);
      }

      const agent = new ReactAgentService(replayClient, registry);

      const result = await agent.run({
        guardrails: REPLAY_GUARDRAILS,
        prompt: evalCase.request.message,
        systemPrompt: AGENT_DEFAULT_SYSTEM_PROMPT,
        toolNames:
          evalCase.request.toolNames ??
          (AGENT_ALLOWED_TOOL_NAMES as unknown as string[]),
        userId: LIVE_EVAL_USER_ID
      });

      const toolsCalled = extractToolsFromResult(result);
      const invocationLog = buildInvocationLog(toolsCalled);

      const verifiedResult = verifier.verify(result, toolsCalled);

      const verified: VerifiedResponseLike = {
        confidence: verifiedResult.confidence,
        elapsedMs: result.elapsedMs,
        estimatedCostUsd: result.estimatedCostUsd,
        guardrail: result.guardrail,
        invokedToolNames: toolsCalled,
        iterations: result.iterations,
        response: result.response,
        sources: toolsCalled,
        status: result.status,
        toolCalls: result.toolCalls,
        warnings: []
      };

      assertEvalInvariants(evalCase, verified);
      assertToolCallCounts(evalCase.expect, invocationLog);
    });
  }

  afterAll(() => {
    console.log(
      `\n[Replay] ${replayCases.length} replayed, ${skippedCases.length} skipped (no recording)\n`
    );
  });
});
