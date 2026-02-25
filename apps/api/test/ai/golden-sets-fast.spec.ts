/**
 * Golden Sets — Fast Tier (mocked LLM)
 *
 * Runs every commit, no env gate, <30s budget.
 * Tests actual ReactAgentService + ToolRegistry + ResponseVerifierService
 * with deterministic tool stubs and scripted LLM completions.
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
  assertToolCallCounts,
  assertToolEnvelopes,
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

// ─── Test Suite ────────────────────────────────────────────────────────────────

jest.setTimeout(30_000);

describe('Golden Sets (fast)', () => {
  const verifier = new ResponseVerifierService();

  afterEach(() => {
    jest.restoreAllMocks();
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

      const verified = verifier.verify(result, evalCase.request.toolNames);

      // Standard structural checks (status, confidence, content, guardrail)
      assertEvalInvariants(evalCase, verified);

      // Tool call counts from invocationLog (source of truth for actual calls)
      assertToolCallCounts(evalCase.expect, invocationLog);

      // Envelope checks — inspect serialized tool messages in LLM call history
      if (evalCase.expect.toolEnvelopeChecks) {
        assertToolEnvelopes(evalCase.expect.toolEnvelopeChecks, llmClient);
      }

      // Auth scoping — every invocation used context.userId, not LLM args
      if (invocationLog.length > 0) {
        assertAuthScoping(invocationLog, EVAL_USER_ID);
      }
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

    const verified = new ResponseVerifierService().verify(
      result,
      timeoutCase.request.toolNames
    );

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

    const verified = new ResponseVerifierService().verify(
      secondResult,
      cbCase.request.toolNames
    );

    assertEvalInvariants(cbCase, verified);

    // Verify circuit breaker specific behavior
    expect(verified.guardrail).toBe('CIRCUIT_BREAKER');
    expect(verified.status).toBe('partial');
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
