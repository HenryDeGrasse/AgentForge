/**
 * Golden Sets — Live Tier (real LLM calls)
 *
 * Requires OPENAI_API_KEY. Skipped automatically when the key is absent.
 * Run on-demand or in CI nightly — NOT on every commit.
 *
 *   OPENAI_API_KEY=sk-... npx jest golden-sets-live --runInBand
 *   EVAL_RECORD=1 — also persist sessions to fixtures/recorded/ for replay tier
 *
 * ── Philosophy ────────────────────────────────────────────────────────
 * Assertions describe DESIRED LLM behaviour, not observed behaviour.
 * LLMs are nondeterministic: the same prompt can produce different tool
 * selections or phrasings across runs. Rather than weakening assertions
 * to match every LLM variation, we:
 *
 *   1. Keep assertions strict (what we WANT the LLM to do)
 *   2. Retry each case once on failure (handles temperature-0 variance)
 *   3. Enforce pass-rate thresholds per category:
 *        - adversarial:  100%  (must NEVER call tools on out-of-scope)
 *        - single-tool:  ≥80%
 *        - multi-tool:   ≥70%  (multi-tool orchestration is harder)
 *        - overall:      ≥85%
 *   4. Individual case failures are logged, not thrown — the suite-level
 *      threshold in afterAll() is the actual CI gate.
 *
 * This means a case that fails 1-in-5 runs doesn't force us to weaken
 * its assertion. It just contributes to the pass rate. If the rate drops
 * below threshold, the suite fails — signalling a real regression.
 */
import {
  AGENT_DEFAULT_SYSTEM_PROMPT,
  AGENT_ALLOWED_TOOL_NAMES
} from '@ghostfolio/api/app/endpoints/ai/agent/agent.constants';
import { ReactAgentService } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import type {
  LLMClient,
  LLMCompletionRequest,
  LLMCompletionResponse
} from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
import { OpenAiClientService } from '@ghostfolio/api/app/endpoints/ai/llm/openai-client.service';
import { ToolRegistry } from '@ghostfolio/api/app/endpoints/ai/tools/tool.registry';
import { ResponseVerifierService } from '@ghostfolio/api/app/endpoints/ai/verification/response-verifier.service';

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';

import {
  assertEvalInvariants,
  assertToolCallCounts,
  type ToolInvocationEntry,
  type VerifiedResponseLike
} from './eval-assert';
import { validateEvalSuite, type EvalCaseDefinition } from './eval-case.schema';
import { buildLiveTools, LIVE_EVAL_USER_ID } from './live-tool-builder';

// ─── Env gate ─────────────────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
const HAS_KEY = Boolean(OPENAI_API_KEY);
const EVAL_RECORD = process.env['EVAL_RECORD'] === '1';

// ─── Thresholds ────────────────────────────────────────────────────────────────

/** Pass-rate thresholds by category. Suite fails if any category drops below. */
const CATEGORY_THRESHOLDS: Record<string, number> = {
  adversarial: 1.0, // 100% — must NEVER call tools on out-of-scope
  'edge-case': 0.6,
  'multi-tool': 0.7,
  'scope-gate': 1.0,
  'single-tool': 0.8
};

const OVERALL_THRESHOLD = 0.85;

/** Max retries per case (1 = original + 1 retry = 2 attempts total) */
const MAX_RETRIES = 1;

// ─── Case loading ──────────────────────────────────────────────────────────────

const allCases = validateEvalSuite(
  JSON.parse(readFileSync(join(__dirname, 'golden-sets.json'), 'utf8'))
);

const liveCases = allCases.filter((c) => c.liveEligible);

// ─── Guardrails ────────────────────────────────────────────────────────────────

const LIVE_GUARDRAILS = {
  circuitBreakerCooldownMs: 60_000,
  circuitBreakerFailureThreshold: 3,
  costLimitUsd: 1,
  fallbackCostPer1kTokensUsd: 0.01,
  maxIterations: 10,
  timeoutMs: 90_000
};

// ─── Session saving ───────────────────────────────────────────────────────────

const RECORDED_DIR = join(__dirname, 'fixtures', 'recorded');

/**
 * Persist one eval session to disk so the replay tier can re-use the
 * real gpt-4.1 responses without calling OpenAI. Overwrites any
 * previous recording for the same caseId — no build-up across runs.
 */
function saveSession(
  caseId: string,
  query: string,
  recordingClient: RecordingLlmClient,
  result: RunResult
): void {
  mkdirSync(RECORDED_DIR, { recursive: true });

  writeFileSync(
    join(RECORDED_DIR, `${caseId}.json`),
    JSON.stringify(
      {
        caseId,
        estimatedCostUsd: result.estimatedCostUsd,
        llmCalls: recordingClient.calls,
        model: process.env['OPENAI_MODEL'] ?? 'gpt-4.1',
        query,
        result: {
          elapsedMs: result.elapsedMs,
          estimatedCostUsd: result.estimatedCostUsd,
          executedTools: result.executedTools.map((t) => ({
            envelope: {
              error: t.envelope.error,
              status: t.envelope.status
            },
            toolName: t.toolName
          })),
          guardrail: result.guardrail,
          iterations: result.iterations,
          response: result.response,
          status: result.status,
          toolCalls: result.toolCalls
        },
        timestamp: new Date().toISOString()
      },
      null,
      2
    )
  );
}

// ─── Recording wrapper ────────────────────────────────────────────────────────

type RunResult = Awaited<ReturnType<ReactAgentService['run']>>;

class RecordingLlmClient implements LLMClient {
  public readonly calls: {
    latencyMs: number;
    request: LLMCompletionRequest;
    response: LLMCompletionResponse;
  }[] = [];

  public constructor(private readonly inner: LLMClient) {}

  public async complete(
    request: LLMCompletionRequest
  ): Promise<LLMCompletionResponse> {
    const start = Date.now();
    const response = await this.inner.complete(request);

    this.calls.push({ latencyMs: Date.now() - start, request, response });

    return response;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractCalledToolsFromLlmHistory(
  client: RecordingLlmClient
): string[] {
  const called: string[] = [];

  for (const { request } of client.calls) {
    for (const msg of request.messages) {
      if (msg.role === 'tool' && msg.name && !called.includes(msg.name)) {
        called.push(msg.name);
      }
    }
  }

  for (const { response } of client.calls) {
    for (const tc of response.toolCalls ?? []) {
      if (!called.includes(tc.name)) {
        called.push(tc.name);
      }
    }
  }

  return called;
}

function buildInvocationLog(toolNames: string[]): ToolInvocationEntry[] {
  return toolNames.map((toolName) => ({
    input: {},
    toolName,
    userId: LIVE_EVAL_USER_ID
  }));
}

function buildRealLlmClient(): LLMClient {
  const openAiSdk = new OpenAI({ apiKey: OPENAI_API_KEY });

  return new OpenAiClientService(openAiSdk);
}

// ─── Single-attempt runner ────────────────────────────────────────────────────

interface AttemptResult {
  durationMs: number;
  error?: string;
  estimatedCostUsd: number;
  passed: boolean;
  recordingClient: RecordingLlmClient;
  result: RunResult;
  toolsCalled: string[];
}

async function runOneAttempt(
  evalCase: EvalCaseDefinition
): Promise<AttemptResult> {
  const { tools } = buildLiveTools();
  const registry = new ToolRegistry();

  for (const tool of tools) {
    registry.register(tool);
  }

  const innerClient = buildRealLlmClient();
  const recordingClient = new RecordingLlmClient(innerClient);
  const agent = new ReactAgentService(recordingClient, registry);
  const verifier = new ResponseVerifierService();

  const start = Date.now();
  const result = await agent.run({
    guardrails: LIVE_GUARDRAILS,
    prompt: evalCase.request.message,
    systemPrompt: AGENT_DEFAULT_SYSTEM_PROMPT,
    toolNames:
      evalCase.request.toolNames ??
      (AGENT_ALLOWED_TOOL_NAMES as unknown as string[]),
    userId: LIVE_EVAL_USER_ID
  });
  const durationMs = Date.now() - start;

  const toolsCalled = extractCalledToolsFromLlmHistory(recordingClient);
  const invocationLog = buildInvocationLog(toolsCalled);

  const verified: VerifiedResponseLike = {
    confidence: result.status === 'completed' ? 'high' : 'medium',
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

  const verifiedResult = verifier.verify(result, toolsCalled);

  verified.confidence = verifiedResult.confidence;

  try {
    assertEvalInvariants(evalCase, verified);
    assertToolCallCounts(evalCase.expect, invocationLog);

    return {
      durationMs,
      estimatedCostUsd: result.estimatedCostUsd,
      passed: true,
      recordingClient,
      result,
      toolsCalled
    };
  } catch (err) {
    return {
      durationMs,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      estimatedCostUsd: result.estimatedCostUsd,
      passed: false,
      recordingClient,
      result,
      toolsCalled
    };
  }
}

// ─── Metrics collection ───────────────────────────────────────────────────────

interface LiveEvalResult {
  attempts: number;
  caseId: string;
  category: string;
  durationMs: number;
  error?: string;
  estimatedCostUsd: number;
  passed: boolean;
  toolsCalled: string[];
}

const liveResults: LiveEvalResult[] = [];

// ─── Test suite ───────────────────────────────────────────────────────────────

const describeOrSkip = HAS_KEY ? describe : describe.skip;

describeOrSkip('Golden Sets (live — real gpt-4.1)', () => {
  jest.setTimeout(180_000); // 3 min per case (includes retry)

  // ── afterAll: enforce pass-rate thresholds ──────────────────────────────────
  afterAll(() => {
    if (liveResults.length === 0) return;

    const passed = liveResults.filter((r) => r.passed).length;
    const total = liveResults.length;
    const totalCost = liveResults.reduce(
      (sum, r) => sum + r.estimatedCostUsd,
      0
    );
    const totalMs = liveResults.reduce((sum, r) => sum + r.durationMs, 0);

    // ── Per-category stats ─────────────────────────────────────────────────
    const byCategory: Record<
      string,
      { failed: number; passed: number; total: number }
    > = {};

    for (const r of liveResults) {
      byCategory[r.category] ??= { failed: 0, passed: 0, total: 0 };
      byCategory[r.category].total++;

      if (r.passed) {
        byCategory[r.category].passed++;
      } else {
        byCategory[r.category].failed++;
      }
    }

    // ── Print report ───────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(64));
    console.log('LIVE EVAL RESULTS  (real gpt-4.1)');
    console.log('═'.repeat(64));

    for (const [cat, stats] of Object.entries(byCategory).sort()) {
      const pct = ((stats.passed / stats.total) * 100).toFixed(0);
      const threshold = CATEGORY_THRESHOLDS[cat];
      const thresholdStr = threshold
        ? ` (gate: ${(threshold * 100).toFixed(0)}%)`
        : '';
      const bar =
        '█'.repeat(Math.round((stats.passed / stats.total) * 20)) +
        '░'.repeat(20 - Math.round((stats.passed / stats.total) * 20));

      console.log(
        `  ${cat.padEnd(18)} ${String(stats.passed).padStart(2)}/${stats.total}  (${String(pct).padStart(3)}%)  ${bar}${thresholdStr}`
      );
    }

    console.log('─'.repeat(64));
    console.log(
      `  Overall:  ${passed}/${total} passed (${((passed / total) * 100).toFixed(0)}%, gate: ${(OVERALL_THRESHOLD * 100).toFixed(0)}%)`
    );
    console.log(`  Cost:     $${totalCost.toFixed(4)}`);
    console.log(
      `  Duration: ${(totalMs / 1000).toFixed(1)}s total  (~${(totalMs / total / 1000).toFixed(1)}s/case)`
    );

    const retried = liveResults.filter((r) => r.attempts > 1);

    if (retried.length > 0) {
      console.log(`  Retries:  ${retried.length} case(s) needed a retry`);
    }

    const failures = liveResults.filter((r) => !r.passed);

    if (failures.length > 0) {
      console.log('\n  Failures:');

      for (const f of failures) {
        console.log(
          `    ✗ ${f.caseId}  tools=[${f.toolsCalled.join(',')}]  attempts=${f.attempts}`
        );
        console.log(`      ${f.error ?? ''}`);
      }
    }

    console.log('═'.repeat(64) + '\n');

    // ── Threshold enforcement ──────────────────────────────────────────────
    const violations: string[] = [];

    for (const [cat, stats] of Object.entries(byCategory)) {
      const threshold = CATEGORY_THRESHOLDS[cat];

      if (threshold !== undefined) {
        const rate = stats.passed / stats.total;

        if (rate < threshold) {
          violations.push(
            `${cat}: ${(rate * 100).toFixed(0)}% < ${(threshold * 100).toFixed(0)}% threshold (${stats.passed}/${stats.total})`
          );
        }
      }
    }

    const overallRate = passed / total;

    if (overallRate < OVERALL_THRESHOLD) {
      violations.push(
        `overall: ${(overallRate * 100).toFixed(0)}% < ${(OVERALL_THRESHOLD * 100).toFixed(0)}% threshold (${passed}/${total})`
      );
    }

    if (violations.length > 0) {
      throw new Error(
        `Live eval pass-rate below threshold:\n  ${violations.join('\n  ')}`
      );
    }
  });

  // ── Per-case tests ──────────────────────────────────────────────────────────
  //
  // Each test runs the case, retries once on failure, and records the result.
  // Individual tests always PASS in Jest — the afterAll gate is the real check.
  // This avoids noisy per-case failures when 1-2 nondeterministic cases flake.

  for (const evalCase of liveCases) {
    it(`[${evalCase.meta.category}] ${evalCase.id}`, async () => {
      let lastAttempt: AttemptResult | undefined;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        lastAttempt = await runOneAttempt(evalCase);

        if (lastAttempt.passed) {
          break;
        }
      }

      const attempts = lastAttempt!.passed ? 1 : MAX_RETRIES + 1;

      // Record result for afterAll threshold check
      liveResults.push({
        attempts,
        caseId: evalCase.id,
        category: evalCase.meta.category,
        durationMs: lastAttempt!.durationMs,
        error: lastAttempt!.error,
        estimatedCostUsd: lastAttempt!.estimatedCostUsd,
        passed: lastAttempt!.passed,
        toolsCalled: lastAttempt!.toolsCalled
      });

      // Save session for replay tier (only on a passing attempt)
      if (EVAL_RECORD && lastAttempt!.passed) {
        saveSession(
          evalCase.id,
          evalCase.request.message,
          lastAttempt!.recordingClient,
          lastAttempt!.result
        );
      }

      // DO NOT throw on failure — afterAll threshold gate handles it.
      // Log the failure for visibility in test output.
      if (!lastAttempt!.passed) {
        console.warn(
          `[LIVE EVAL] ${evalCase.id} FAILED after ${attempts} attempt(s): ${lastAttempt!.error}`
        );
      }
    });
  }
});
