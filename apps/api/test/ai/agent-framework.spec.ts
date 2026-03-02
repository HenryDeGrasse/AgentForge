/**
 * Agent Framework Tests (mocked LLM)
 *
 * Runs every commit, no env gate, <30s budget.
 * Tests ReactAgentService + ToolRegistry + ResponseVerifierService plumbing:
 *   schema validation, auth scoping, guardrails, envelope structure, routing.
 *
 * These are NOT golden-set evals — the LLM is a scripted mock so LLM
 * behaviour is not tested here. See golden-sets-live.spec.ts for that.
 *
 * Cases are loaded at MODULE SCOPE — Jest registers it() blocks at parse time.
 */
import { ReactAgentService } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import type {
  LLMClient,
  LLMCompletionResponse
} from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
import {
  PORTFOLIO_SUMMARY_INPUT_SCHEMA,
  PORTFOLIO_SUMMARY_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import { ToolRegistry } from '@ghostfolio/api/app/endpoints/ai/tools/tool.registry';
import type { ToolDefinition } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { ResponseVerifierService } from '@ghostfolio/api/app/endpoints/ai/verification/response-verifier.service';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertAuthScoping,
  assertEvalInvariants,
  extractActualToolsCalled,
  assertToolCallCounts,
  assertToolEnvelopes,
  toolAccuracy,
  toolEfficiency,
  contentPrecision,
  type EvalCaseMetrics,
  type ToolInvocationEntry
} from './eval-assert';
import { validateEvalSuite, type EvalCaseDefinition } from './eval-case.schema';
import { loadLlmSequence } from './fixtures/llm-sequences';
import { buildToolsForProfile } from './fixtures/tool-profiles';

// ─── Module-scope case loading ─────────────────────────────────────────────────

const allCases = validateEvalSuite(
  JSON.parse(readFileSync(join(__dirname, 'golden-sets.json'), 'utf8'))
);

const genericCases = allCases.filter((c) => c.runner !== 'custom');

const EVAL_USER_ID = 'eval-user-1';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const defaultGuardrails = {
  circuitBreakerCooldownMs: 60_000,
  circuitBreakerFailureThreshold: 3,
  costLimitUsd: 1,
  fallbackCostPer1kTokensUsd: 0.002,
  maxIterations: 10,
  timeoutMs: 30_000
};

function buildSequencedMock(
  sequence: LLMCompletionResponse[]
): LLMClient & { complete: jest.Mock } {
  const mockFn = jest.fn();
  let callIndex = 0;

  mockFn.mockImplementation(() => {
    if (callIndex >= sequence.length) {
      return Promise.resolve(sequence[sequence.length - 1]);
    }

    return Promise.resolve(sequence[callIndex++]);
  });

  return { complete: mockFn };
}

function buildToolsWithInvocationLog(
  evalCase: EvalCaseDefinition,
  invocationLog: ToolInvocationEntry[]
): ToolDefinition[] {
  return buildToolsForProfile(evalCase.profile, invocationLog);
}

// ─── Metrics Collection ────────────────────────────────────────────────────────

const metricsLog: EvalCaseMetrics[] = [];

// ─── Test Suite ────────────────────────────────────────────────────────────────

jest.setTimeout(30_000);

describe('Agent Framework Tests', () => {
  const verifier = new ResponseVerifierService();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (metricsLog.length === 0) return;

    const passed = metricsLog.filter((m) => m.passed).length;
    const total = metricsLog.length;
    const pct = ((passed / total) * 100).toFixed(1);

    const avgAccuracy = (
      metricsLog.reduce((s, m) => s + m.toolAccuracyScore, 0) / total
    ).toFixed(2);
    const avgEfficiency = (
      metricsLog.reduce((s, m) => s + m.toolEfficiencyScore, 0) / total
    ).toFixed(2);
    const avgPrecision = (
      metricsLog.reduce((s, m) => s + m.contentPrecisionScore, 0) / total
    ).toFixed(2);

    // Group by category
    const byCategory: Record<string, { passed: number; total: number }> = {};

    for (const m of metricsLog) {
      // Extract category from caseId prefix (e.g. "rich-" → "single-tool", "adv-" → "adversarial")
      const cat =
        m.caseId.startsWith('adv-') ||
        m.caseId.startsWith('prompt-') ||
        m.caseId.startsWith('malformed-')
          ? 'adversarial'
          : m.caseId.startsWith('multi-')
            ? 'multi-tool'
            : m.caseId.startsWith('guardrail-')
              ? 'guardrail'
              : m.caseId.startsWith('schema-')
                ? 'schema-safety'
                : m.caseId.startsWith('auth-')
                  ? 'auth'
                  : m.caseId.startsWith('edge-')
                    ? 'edge-case'
                    : 'single-tool';

      byCategory[cat] ??= { passed: 0, total: 0 };
      byCategory[cat].total++;

      if (m.passed) byCategory[cat].passed++;
    }

    console.log('\n' + '═'.repeat(60));
    console.log('GOLDEN SET RESULTS');
    console.log('═'.repeat(60));

    for (const [cat, stats] of Object.entries(byCategory).sort()) {
      const catPct = ((stats.passed / stats.total) * 100).toFixed(0);
      const bar =
        '█'.repeat(Math.round((stats.passed / stats.total) * 20)) +
        '░'.repeat(20 - Math.round((stats.passed / stats.total) * 20));

      console.log(
        `  ${cat.padEnd(18)} ${String(stats.passed).padStart(2)}/${stats.total}  (${String(catPct).padStart(3)}%)  ${bar}`
      );
    }

    console.log('─'.repeat(60));
    console.log(`  Overall: ${passed}/${total} passed (${pct}%)`);
    console.log('─'.repeat(60));
    console.log(`  Avg Tool Accuracy:   ${avgAccuracy}`);
    console.log(`  Avg Tool Efficiency: ${avgEfficiency}`);
    console.log(`  Avg Content Precision: ${avgPrecision}`);
    console.log('═'.repeat(60) + '\n');
  });

  for (const evalCase of genericCases) {
    it(`[${evalCase.meta.category}] ${evalCase.id}`, async () => {
      const invocationLog: ToolInvocationEntry[] = [];
      const tools = buildToolsWithInvocationLog(evalCase, invocationLog);

      // Special handling for schema-safety cases that need modified tools
      const toolRegistry = buildToolRegistryForCase(
        evalCase,
        tools,
        invocationLog
      );

      const llmSequence = loadLlmSequence(evalCase.id);
      const llmClient = buildSequencedMock(llmSequence);

      // Build guardrails (merge overrides from eval case)
      const guardrails = {
        ...defaultGuardrails,
        ...(evalCase.guardrailOverrides ?? {})
      };

      const agent = new ReactAgentService(llmClient, toolRegistry);
      const result = await agent.run({
        guardrails,
        prompt: evalCase.request.message,
        toolNames: evalCase.request.toolNames,
        userId: EVAL_USER_ID
      });

      const invokedToolNames = extractActualToolsCalled(invocationLog);
      const verified = verifier.verify(result, invokedToolNames);

      // Standard structural checks (status, confidence, content, guardrail)
      assertEvalInvariants(evalCase, verified);

      // Tool call counts — includes mustNotCallTools / forbiddenTools
      assertToolCallCounts(evalCase.expect, invocationLog);

      // Envelope checks — inspect serialized tool messages in LLM call history
      if (evalCase.expect.toolEnvelopeChecks) {
        assertToolEnvelopes(evalCase.expect.toolEnvelopeChecks, llmClient);
      }

      // Auth scoping — every invocation used context.userId, not LLM args
      if (invocationLog.length > 0) {
        assertAuthScoping(invocationLog, EVAL_USER_ID);
      }

      // Collect replay metrics (Phase 5)
      metricsLog.push({
        caseId: evalCase.id,
        contentPrecisionScore: contentPrecision(
          evalCase.expect.mustContainAll,
          verified.response
        ),
        passed: true, // if we reach here, the test passed
        toolAccuracyScore: toolAccuracy(
          evalCase.expect.requiredTools,
          invokedToolNames
        ),
        toolEfficiencyScore: toolEfficiency(
          evalCase.expect.requiredTools,
          invokedToolNames
        )
      });
    });
  }

  // ─── Custom: Timeout ─────────────────────────────────────────────────────

  it('[guardrail] guardrail-timeout', async () => {
    const timeoutCase = allCases.find((c) => c.id === 'guardrail-timeout');

    if (!timeoutCase) {
      throw new Error('guardrail-timeout case not found in golden-sets.json');
    }

    const invocationLog: ToolInvocationEntry[] = [];
    const tools = buildToolsForProfile(timeoutCase.profile, invocationLog);
    const toolRegistry = new ToolRegistry();

    for (const tool of tools) {
      toolRegistry.register(tool);
    }

    // Mock Date.now to control timing deterministically.
    // The agent uses Date.now() for hasTimedOut() and getRemainingTime().
    // We advance time past timeoutMs between the run start and the first LLM call.
    let now = 1_000;

    jest.spyOn(Date, 'now').mockImplementation(() => {
      // Each call to Date.now() advances by 10ms
      now += 10;

      return now;
    });

    // LLM mock — should never be reached if timeout fires at the loop check
    const llmClient: LLMClient & { complete: jest.Mock } = {
      complete: jest.fn().mockResolvedValue({
        finishReason: 'stop',
        text: 'This should not be delivered',
        toolCalls: [],
        usage: { estimatedCostUsd: 0 }
      })
    };

    const guardrails = {
      ...defaultGuardrails,
      ...(timeoutCase.guardrailOverrides ?? {}),
      // timeoutMs=1 means the agent's hasTimedOut() check triggers immediately
      // because our Date.now() mock advances by 10ms per call
      timeoutMs: 1
    };

    const agent = new ReactAgentService(llmClient, toolRegistry);
    const result = await agent.run({
      guardrails,
      prompt: timeoutCase.request.message,
      toolNames: timeoutCase.request.toolNames,
      userId: EVAL_USER_ID
    });

    const invokedTools = [
      ...new Set((result.executedTools ?? []).map((t) => t.toolName))
    ];
    const verified = new ResponseVerifierService().verify(result, invokedTools);

    assertEvalInvariants(timeoutCase, verified);
  });

  // ─── Custom: Circuit Breaker (multi-run) ─────────────────────────────────

  it('[guardrail] guardrail-circuit-breaker', async () => {
    const cbCase = allCases.find((c) => c.id === 'guardrail-circuit-breaker');

    if (!cbCase) {
      throw new Error(
        'guardrail-circuit-breaker case not found in golden-sets.json'
      );
    }

    const invocationLog: ToolInvocationEntry[] = [];
    const tools = buildToolsForProfile(cbCase.profile, invocationLog);
    const toolRegistry = new ToolRegistry();

    for (const tool of tools) {
      toolRegistry.register(tool);
    }

    // Mock Date.now for deterministic timing
    const now = 1_000;

    jest.spyOn(Date, 'now').mockImplementation(() => now);

    const llmClient: LLMClient & { complete: jest.Mock } = {
      complete: jest
        .fn()
        // First call: reject → agent records failure
        .mockRejectedValueOnce(new Error('Provider unavailable'))
        // Recovery call (after cooldown): resolve normally
        .mockResolvedValueOnce({
          finishReason: 'stop',
          text: 'Recovered response',
          toolCalls: [],
          usage: { estimatedCostUsd: 0.001 }
        })
    };

    const guardrails = {
      ...defaultGuardrails,
      circuitBreakerCooldownMs: 100,
      circuitBreakerFailureThreshold: 1,
      ...(cbCase.guardrailOverrides ?? {})
    };

    const agent = new ReactAgentService(llmClient, toolRegistry);

    // Run 1: LLM rejects → agent records failure, opens circuit
    const firstResult = await agent.run({
      guardrails,
      prompt: cbCase.request.message,
      toolNames: cbCase.request.toolNames,
      userId: EVAL_USER_ID
    });

    expect(firstResult.status).toBe('failed');

    // Run 2: Circuit is open → immediate partial with CIRCUIT_BREAKER
    const secondResult = await agent.run({
      guardrails,
      prompt: cbCase.request.message,
      toolNames: cbCase.request.toolNames,
      userId: EVAL_USER_ID
    });

    const invokedCbTools = [
      ...new Set((secondResult.executedTools ?? []).map((t) => t.toolName))
    ];
    const verified = new ResponseVerifierService().verify(
      secondResult,
      invokedCbTools
    );

    assertEvalInvariants(cbCase, verified);

    // Verify circuit breaker specific behavior
    expect(verified.guardrail).toBe('CIRCUIT_BREAKER');
    expect(verified.status).toBe('partial');
  });

  // ─── Custom: Out-of-Scope (no tools provided) ──────────────────────────

  it('[scope-gate] out-of-scope-crystal-ball', async () => {
    const oosCase = allCases.find((c) => c.id === 'out-of-scope-crystal-ball');

    if (!oosCase) {
      throw new Error(
        'out-of-scope-crystal-ball case not found in golden-sets.json'
      );
    }

    const invocationLog: ToolInvocationEntry[] = [];
    const tools = buildToolsForProfile(oosCase.profile, invocationLog);
    const toolRegistry = new ToolRegistry();

    for (const tool of tools) {
      toolRegistry.register(tool);
    }

    const llmSequence = loadLlmSequence(oosCase.id);
    const llmClient = buildSequencedMock(llmSequence);

    const agent = new ReactAgentService(llmClient, toolRegistry);

    // No toolNames in request — agent should decline without calling any tools
    const result = await agent.run({
      guardrails: defaultGuardrails,
      prompt: oosCase.request.message,
      toolNames: oosCase.request.toolNames,
      userId: EVAL_USER_ID
    });

    const verified = new ResponseVerifierService().verify(
      result,
      oosCase.request.toolNames ?? []
    );

    assertEvalInvariants(oosCase, verified);

    // Zero tool calls — the agent should refuse without using portfolio tools
    expect(invocationLog.length).toBe(0);
    expect(verified.toolCalls).toBe(0);
  });

  // ─── Custom: Tool Execution Exception ───────────────────────────────────

  it('[adversarial] schema-tool-execution-exception', async () => {
    const exCase = allCases.find(
      (c) => c.id === 'schema-tool-execution-exception'
    );

    if (!exCase) {
      throw new Error(
        'schema-tool-execution-exception case not found in golden-sets.json'
      );
    }

    const invocationLog: ToolInvocationEntry[] = [];
    const tools = buildToolsForProfile(exCase.profile, invocationLog);
    const toolRegistry = new ToolRegistry();

    // Register a throwing tool stub for get_portfolio_summary
    const throwingTool: ToolDefinition = {
      description: 'Return portfolio totals (throws for testing).',
      execute: (_input, context) => {
        invocationLog.push({
          input: _input,
          toolName: 'get_portfolio_summary',
          userId: context.userId
        });

        throw new Error('Database connection failed');
      },
      inputSchema: PORTFOLIO_SUMMARY_INPUT_SCHEMA,
      name: 'get_portfolio_summary',
      outputSchema: PORTFOLIO_SUMMARY_OUTPUT_SCHEMA
    };

    toolRegistry.register(throwingTool);

    for (const tool of tools) {
      if (tool.name !== 'get_portfolio_summary') {
        toolRegistry.register(tool);
      }
    }

    const llmSequence = loadLlmSequence(exCase.id);
    const llmClient = buildSequencedMock(llmSequence);

    const agent = new ReactAgentService(llmClient, toolRegistry);
    const result = await agent.run({
      guardrails: defaultGuardrails,
      prompt: exCase.request.message,
      toolNames: exCase.request.toolNames,
      userId: EVAL_USER_ID
    });

    const invokedToolNames = extractActualToolsCalled(invocationLog);
    const verified = verifier.verify(result, invokedToolNames);

    assertEvalInvariants(exCase, verified);

    // Verify the tool envelope shows tool_execution_failed
    if (exCase.expect.toolEnvelopeChecks) {
      assertToolEnvelopes(exCase.expect.toolEnvelopeChecks, llmClient);
    }
  });
});

// ─── Helper: Build ToolRegistry with special handling for schema-safety ───────

function buildToolRegistryForCase(
  evalCase: EvalCaseDefinition,
  tools: ToolDefinition[],
  invocationLog: ToolInvocationEntry[]
): ToolRegistry {
  const toolRegistry = new ToolRegistry();

  // For schema-tool-output-violation: register a special tool that returns invalid output
  if (evalCase.id === 'schema-tool-output-violation') {
    const invalidOutputTool: ToolDefinition = {
      description:
        'Return portfolio totals (deliberately invalid output for testing).',
      execute: (input, context) => {
        invocationLog.push({
          input,
          toolName: 'get_portfolio_summary',
          userId: context.userId
        });

        // Return data missing required fields — will fail output validation
        return {
          data: { invalidField: true },
          status: 'success'
        } as any;
      },
      inputSchema: PORTFOLIO_SUMMARY_INPUT_SCHEMA,
      name: 'get_portfolio_summary',
      outputSchema: PORTFOLIO_SUMMARY_OUTPUT_SCHEMA
    };

    toolRegistry.register(invalidOutputTool);

    // Register remaining tools (skip get_portfolio_summary since we replaced it)
    for (const tool of tools) {
      if (tool.name !== 'get_portfolio_summary') {
        toolRegistry.register(tool);
      }
    }

    return toolRegistry;
  }

  // Default: register all tools from the profile
  for (const tool of tools) {
    toolRegistry.register(tool);
  }

  return toolRegistry;
}
