/**
 * Golden Sets — Live Tier (real LLM calls)
 *
 * Requires OPENAI_API_KEY. Skipped automatically when the key is absent.
 * Run on-demand or in CI nightly — NOT on every commit.
 *
 *   npx nx test api --testFile=apps/api/test/ai/golden-sets-live.spec.ts
 *
 * What this tests that the fast tier (MockLlmClient) cannot:
 *  - Does gpt-4.1 pick the right tool for each request?
 *  - Does gpt-4.1 refuse out-of-scope requests without calling tools?
 *  - Does gpt-4.1 synthesise multi-tool output coherently?
 *  - Does gpt-4.1 include specific values (%, $, symbols) from real tool output?
 *
 * The tools are REAL (AnalyzeRiskTool, ComplianceCheckTool, etc.) backed by
 * demo-account-shaped mock services. Tool arguments from gpt-4.1 are validated
 * against real schemas; tool logic (FIFO, risk flags, compliance rules) executes
 * for real. Only the underlying DB/API services are mocked.
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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';

import {
  assertEvalInvariants,
  assertToolCallCounts,
  type VerifiedResponseLike,
  type ToolInvocationEntry
} from './eval-assert';
import { validateEvalSuite } from './eval-case.schema';
import { buildLiveTools, LIVE_EVAL_USER_ID } from './live-tool-builder';

// ─── Env gate ─────────────────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
const HAS_KEY = Boolean(OPENAI_API_KEY);

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

// ─── Recording wrapper ────────────────────────────────────────────────────────

/**
 * Transparent LLM client wrapper that records every request/response pair.
 * Used for optional session recording (EVAL_RECORD=1) and for extracting
 * the actual tools called (from tool-role messages in request history).
 */
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

// ─── Invocation tracking wrapper ─────────────────────────────────────────────

/**
 * Wraps a ToolDefinition's execute() to track invocations.
 * Since real tools run inside ReactAgentService (no external invocationLog),
 * we extract called tools from the LLM's tool-role messages instead.
 */
function extractCalledToolsFromLlmHistory(
  client: RecordingLlmClient
): string[] {
  const called: string[] = [];

  for (const { request } of client.calls) {
    for (const msg of request.messages) {
      if (msg.role === 'tool' && msg.name) {
        if (!called.includes(msg.name)) {
          called.push(msg.name);
        }
      }
    }
  }

  // Also extract from toolCalls in assistant messages
  for (const { response } of client.calls) {
    for (const tc of response.toolCalls ?? []) {
      if (!called.includes(tc.name)) {
        called.push(tc.name);
      }
    }
  }

  return called;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a VerifiedResponseLike-compatible invocationLog entry array from
 * the set of tool names the LLM actually called. Used for assertToolCallCounts.
 */
function buildInvocationLog(toolNames: string[]): ToolInvocationEntry[] {
  return toolNames.map((toolName) => ({
    input: {},
    toolName,
    userId: LIVE_EVAL_USER_ID
  }));
}

function buildRealLlmClient(): LLMClient {
  // Use injected OpenAI SDK so we can pass the key from env
  const openAiSdk = new OpenAI({ apiKey: OPENAI_API_KEY });

  return new OpenAiClientService(openAiSdk);
}

// ─── Metrics collection ───────────────────────────────────────────────────────

interface LiveEvalResult {
  caseId: string;
  category: string;
  durationMs: number;
  estimatedCostUsd: number;
  passed: boolean;
  toolsCalled: string[];
  error?: string;
}

const liveResults: LiveEvalResult[] = [];

// ─── Test suite ───────────────────────────────────────────────────────────────

const describeOrSkip = HAS_KEY ? describe : describe.skip;

describeOrSkip('Golden Sets (live — real gpt-4.1)', () => {
  jest.setTimeout(120_000);

  const verifier = new ResponseVerifierService();

  afterAll(() => {
    if (liveResults.length === 0) return;

    const passed = liveResults.filter((r) => r.passed).length;
    const total = liveResults.length;
    const totalCost = liveResults.reduce(
      (sum, r) => sum + r.estimatedCostUsd,
      0
    );
    const totalMs = liveResults.reduce((sum, r) => sum + r.durationMs, 0);

    // By category
    const byCategory: Record<
      string,
      { failed: number; passed: number; total: number }
    > = {};

    for (const r of liveResults) {
      byCategory[r.category] ??= { failed: 0, passed: 0, total: 0 };
      byCategory[r.category].total++;
      if (r.passed) byCategory[r.category].passed++;
      else byCategory[r.category].failed++;
    }

    console.log('\n' + '═'.repeat(64));
    console.log('LIVE EVAL RESULTS  (real gpt-4.1)');
    console.log('═'.repeat(64));

    for (const [cat, stats] of Object.entries(byCategory).sort()) {
      const pct = ((stats.passed / stats.total) * 100).toFixed(0);
      const bar =
        '█'.repeat(Math.round((stats.passed / stats.total) * 20)) +
        '░'.repeat(20 - Math.round((stats.passed / stats.total) * 20));

      console.log(
        `  ${cat.padEnd(18)} ${String(stats.passed).padStart(2)}/${stats.total}  (${String(pct).padStart(3)}%)  ${bar}`
      );
    }

    console.log('─'.repeat(64));
    console.log(`  Overall:  ${passed}/${total} passed`);
    console.log(`  Cost:     $${totalCost.toFixed(4)}`);
    console.log(
      `  Duration: ${(totalMs / 1000).toFixed(1)}s total  (~${(totalMs / total / 1000).toFixed(1)}s/case)`
    );

    const failures = liveResults.filter((r) => !r.passed);

    if (failures.length > 0) {
      console.log('\n  Failures:');

      for (const f of failures) {
        console.log(
          `    ✗ ${f.caseId}  tools=[${f.toolsCalled.join(',')}]  ${f.error ?? ''}`
        );
      }
    }

    console.log('═'.repeat(64) + '\n');
  });

  for (const evalCase of liveCases) {
    it(`[${evalCase.meta.category}] ${evalCase.id}`, async () => {
      const { tools } = buildLiveTools();

      const registry = new ToolRegistry();

      for (const tool of tools) {
        registry.register(tool);
      }

      const innerClient = buildRealLlmClient();
      const recordingClient = new RecordingLlmClient(innerClient);

      const agent = new ReactAgentService(recordingClient, registry);

      const start = Date.now();
      const result = await agent.run({
        guardrails: LIVE_GUARDRAILS,
        prompt: evalCase.request.message,
        // Only expose the tools the eval case expects, filtered to allowed set
        toolNames:
          evalCase.request.toolNames ??
          (AGENT_ALLOWED_TOOL_NAMES as unknown as string[]),
        userId: LIVE_EVAL_USER_ID,
        systemPrompt: AGENT_DEFAULT_SYSTEM_PROMPT
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

      // Override confidence from verifier when we have a verified response
      const verifiedResult = verifier.verify(result, toolsCalled);

      verified.confidence = verifiedResult.confidence;

      // Track metrics
      liveResults.push({
        caseId: evalCase.id,
        category: evalCase.meta.category,
        durationMs,
        estimatedCostUsd: result.estimatedCostUsd,
        passed: true, // set to false in catch below
        toolsCalled
      });

      try {
        // Core assertions — same as fast tier
        assertEvalInvariants(evalCase, verified);
        assertToolCallCounts(evalCase.expect, invocationLog);
      } catch (err) {
        // Mark as failed and re-throw
        liveResults[liveResults.length - 1].passed = false;
        liveResults[liveResults.length - 1].error =
          err instanceof Error ? err.message.slice(0, 120) : String(err);

        throw err;
      }
    });
  }
});
