import { AgentGuardrailType } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import type { ActionItem, ChartDataItem } from '@ghostfolio/common/interfaces';

export type ConfidenceLevel = 'high' | 'low' | 'medium';

export type ResponseStatus = 'completed' | 'failed' | 'partial';

/**
 * The final response envelope returned to all callers after verification.
 * Every field is required so the frontend never sees undefined.
 */
export interface VerifiedResponse {
  /** Deterministic follow-up actions derived from tool results. */
  actions: ActionItem[];
  /** Extracted chart data for inline rendering. */
  chartData: ChartDataItem[];
  /** Calibrated confidence based on status and tool usage. */
  confidence: ConfidenceLevel;
  /** Wall-clock time from agent start to verification complete. */
  elapsedMs: number;
  /** Estimated OpenAI cost in USD for this request. */
  estimatedCostUsd: number;
  /** Which guardrail stopped the agent (undefined if none triggered). */
  guardrail?: AgentGuardrailType;
  /** Tool names that were actually invoked (derived from executedTools). */
  invokedToolNames: string[];
  /** Number of ReAct iterations the agent performed. */
  iterations: number;
  /**
   * True when the agent's confidence is low, a guardrail fired, or the
   * verifier detected unbacked claims. Signals the UI to show a
   * "⚠️ Human review recommended" badge.
   */
  requiresHumanReview: boolean;
  /** Verified, non-empty response text. */
  response: string;
  /** Tool names that contributed to the response (requested/legacy). */
  sources: string[];
  /** Agent completion status after verification. */
  status: ResponseStatus;
  /** Number of tool calls executed. */
  toolCalls: number;
  /**
   * Langfuse trace ID for this request. Used by the feedback endpoint
   * to attach thumbs-up/down scores to the correct trace.
   */
  traceId: string;
  /** Domain-level warnings surfaced by the verifier. */
  warnings: string[];
}

export const SAFE_FALLBACK_RESPONSE =
  'No response was generated. Please try again.';

export const SLOW_RESPONSE_THRESHOLD_MS = 10_000;
