/**
 * Shared assertion helpers for AI eval suites.
 *
 * Extracted from mvp-evals.spec.ts and extended with:
 * - Tool call count assertions via invocationLog
 * - Tool envelope structure assertions via LLM call history
 * - Auth scoping assertions via invocationLog
 */
import type { ConfidenceLevel } from '@ghostfolio/api/app/endpoints/ai/contracts/final-response.schema';

import type {
  EvalCaseDefinition,
  EvalCaseExpect,
  ToolEnvelopeCheck
} from './eval-case.schema';
import type { ToolInvocationEntry } from './fixtures/tool-profiles';

// Re-export so existing consumers don't break
export type { ToolInvocationEntry } from './fixtures/tool-profiles';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Shape of a verified response — compatible with both fast-tier and live-tier payloads */
export interface VerifiedResponseLike {
  confidence: string;
  elapsedMs: number;
  estimatedCostUsd: number;
  guardrail?: string;
  /** Present in API versions that return tool names; absent in older deployments */
  invokedToolNames?: string[];
  iterations: number;
  response: string;
  sources: string[];
  status: string;
  toolCalls: number;
  warnings: string[];
}

// ─── Confidence Ranking ────────────────────────────────────────────────────────

export const confidenceRank: Record<ConfidenceLevel, number> = {
  high: 3,
  low: 1,
  medium: 2
};

// ─── Shape Assertion ───────────────────────────────────────────────────────────

const REQUIRED_RESPONSE_FIELDS = [
  'status',
  'confidence',
  'response',
  'sources',
  'toolCalls',
  'elapsedMs'
] as const;

export function assertChatResponseShape(
  payload: unknown
): asserts payload is VerifiedResponseLike {
  const obj = payload as Record<string, unknown>;

  for (const key of REQUIRED_RESPONSE_FIELDS) {
    if (!(key in obj) || obj[key] === undefined) {
      throw new Error(
        `Chat response missing required field "${key}". Got keys: ${Object.keys(obj).join(', ')}`
      );
    }
  }
}

// ─── Core Invariant Assertions ─────────────────────────────────────────────────

/**
 * Standard structural checks shared by all eval tiers.
 * Validates status, confidence, content, and negative content.
 */
export function assertEvalInvariants(
  evalCase: EvalCaseDefinition,
  response: VerifiedResponseLike
) {
  const { expect: expected } = evalCase;

  assertChatResponseShape(response);

  // Status
  expect(response.status).toBe(expected.status);

  // Tool call count (from VerifiedResponse — for live tier this is the gating signal)
  expect(response.toolCalls).toBeGreaterThanOrEqual(expected.minToolCalls);

  if (expected.maxToolCalls !== undefined) {
    expect(response.toolCalls).toBeLessThanOrEqual(expected.maxToolCalls);
  }

  // Required tools (live + fast tiers via invokedToolNames — skipped when field absent on old deployments)
  if (
    expected.requiredTools.length > 0 &&
    response.invokedToolNames !== undefined
  ) {
    for (const requiredTool of expected.requiredTools) {
      expect(response.invokedToolNames).toContain(requiredTool);
    }
  }

  // Confidence
  expect(Object.keys(confidenceRank)).toContain(response.confidence);
  expect(
    confidenceRank[response.confidence as ConfidenceLevel]
  ).toBeGreaterThanOrEqual(
    confidenceRank[expected.minConfidence as ConfidenceLevel]
  );

  // Guardrail
  if (expected.expectedGuardrail) {
    expect(response.guardrail).toBe(expected.expectedGuardrail);
  }

  // Content validation (case-insensitive)
  const normalizedResponse = response.response.toLowerCase();

  if (expected.mustIncludeAny.length > 0) {
    const found = expected.mustIncludeAny.some((phrase) => {
      return normalizedResponse.includes(phrase.toLowerCase());
    });

    if (!found) {
      const truncated =
        normalizedResponse.length > 200
          ? normalizedResponse.slice(0, 200) + '…'
          : normalizedResponse;

      throw new Error(
        `mustIncludeAny: none of [${expected.mustIncludeAny.join(', ')}] found in response: "${truncated}"`
      );
    }
  }

  for (const forbiddenPhrase of expected.mustNotIncludeAny) {
    expect(normalizedResponse).not.toContain(forbiddenPhrase.toLowerCase());
  }

  if (expected.maxElapsedMs !== undefined) {
    expect(response.elapsedMs).toBeLessThanOrEqual(expected.maxElapsedMs);
  }
}

// ─── Fast-Tier: Tool Call Count Assertions via invocationLog ───────────────────

/**
 * Uses invocationLog as the source of truth for how many tools actually executed.
 * More accurate than VerifiedResponse.toolCalls for the fast tier.
 */
export function assertToolCallCounts(
  expected: EvalCaseExpect,
  invocationLog: ToolInvocationEntry[]
) {
  expect(invocationLog.length).toBeGreaterThanOrEqual(expected.minToolCalls);

  if (expected.maxToolCalls !== undefined) {
    expect(invocationLog.length).toBeLessThanOrEqual(expected.maxToolCalls);
  }

  // Check required tools actually executed
  for (const requiredTool of expected.requiredTools) {
    const found = invocationLog.some((entry) => {
      return entry.toolName === requiredTool;
    });

    if (!found) {
      const actualTools = [
        ...new Set(invocationLog.map((e) => e.toolName))
      ].join(', ');

      throw new Error(
        `Required tool "${requiredTool}" was not invoked. Actual tools called: [${actualTools}]`
      );
    }
  }
}

// ─── Fast-Tier: Auth Scoping Assertions ────────────────────────────────────────

/**
 * Asserts that every tool invocation received the expected userId via context,
 * not from LLM-provided arguments.
 */
export function assertAuthScoping(
  invocationLog: ToolInvocationEntry[],
  expectedUserId: string
) {
  for (const entry of invocationLog) {
    expect(entry.userId).toBe(expectedUserId);
  }
}

// ─── Fast-Tier: Tool Envelope Assertions ───────────────────────────────────────

/**
 * Inspects serialized tool messages in the LLM call history to validate
 * envelope structure. Uses llmClient.complete mock call args to find
 * `role: 'tool'` messages.
 */
export function assertToolEnvelopes(
  checks: ToolEnvelopeCheck[],
  llmClient: { complete: jest.Mock }
) {
  const toolMessages = extractToolMessages(llmClient);

  for (const check of checks) {
    const message = toolMessages.find((msg) => {
      return msg.toolName === check.toolName;
    });

    expect(message).toBeDefined();

    if (!message) {
      continue;
    }

    const envelope = message.parsedContent;
    const envelopeError = envelope.error as
      | { code?: string; issues?: unknown[]; message?: string }
      | undefined;
    const envelopeData = envelope.data as Record<string, unknown> | undefined;

    // Status
    expect(envelope.status).toBe(check.expectStatus);

    // Success/partial checks
    if (check.dataFieldsPresent) {
      for (const field of check.dataFieldsPresent) {
        expect(envelopeData).toHaveProperty(field);
      }
    }

    if (check.warningsInclude) {
      expect(Array.isArray(envelopeData?.warnings)).toBe(true);

      const warningCodes = (
        (envelopeData?.warnings ?? []) as { code?: string }[]
      )
        .map((warning) => warning.code)
        .filter((code): code is string => typeof code === 'string');

      for (const expectedCode of check.warningsInclude) {
        expect(warningCodes).toContain(expectedCode);
      }
    }

    // Error checks
    if (check.errorCode) {
      expect(envelopeError?.code).toBe(check.errorCode);
    }

    if (check.errorIssuesNonEmpty) {
      expect(envelopeError?.issues).toBeDefined();
      expect(envelopeError?.issues?.length).toBeGreaterThan(0);
    }
  }
}

// ─── Fast-Tier: Extract Actually-Called Tools ──────────────────────────────────

/**
 * Returns unique tool names from the invocation log.
 */
export function extractActualToolsCalled(
  invocationLog: ToolInvocationEntry[]
): string[] {
  return [...new Set(invocationLog.map((entry) => entry.toolName))];
}

// ─── Live-Tier: Relaxed Source Assertions ──────────────────────────────────────

/**
 * For live tiers where invocationLog isn't available.
 * Validates that sources and invokedToolNames are populated,
 * and that requiredTools appear in the invokedToolNames list.
 */
export function assertLiveSources(
  response: VerifiedResponseLike,
  evalCase: EvalCaseDefinition
) {
  if (evalCase.expect.minToolCalls > 0) {
    expect(response.sources.length).toBeGreaterThan(0);
    if (response.invokedToolNames !== undefined) {
      expect(response.invokedToolNames.length).toBeGreaterThan(0);
    }
  }

  if (response.invokedToolNames !== undefined) {
    for (const requiredTool of evalCase.expect.requiredTools) {
      if (!response.invokedToolNames.includes(requiredTool)) {
        throw new Error(
          `Live sources: required tool "${requiredTool}" not in invokedToolNames: [${response.invokedToolNames.join(', ')}]`
        );
      }
    }
  }
}

// ─── Internal Helpers ──────────────────────────────────────────────────────────

interface ParsedToolMessage {
  parsedContent: Record<string, unknown>;
  toolName: string;
}

/**
 * Extracts tool-role messages from the LLM mock's call history.
 * Each call to llmClient.complete receives a messages array;
 * we scan all calls for messages with role === 'tool'.
 */
function extractToolMessages(llmClient: {
  complete: jest.Mock;
}): ParsedToolMessage[] {
  const results: ParsedToolMessage[] = [];

  for (const call of llmClient.complete.mock.calls) {
    const request = call[0];

    if (!request?.messages) {
      continue;
    }

    for (const msg of request.messages) {
      if (msg.role === 'tool' && msg.content) {
        try {
          const parsed =
            typeof msg.content === 'string'
              ? JSON.parse(msg.content)
              : msg.content;

          results.push({
            parsedContent: parsed,
            toolName: msg.name ?? parsed?.meta?.toolName ?? 'unknown'
          });
        } catch {
          // Non-JSON tool content — skip
        }
      }
    }
  }

  return results;
}
