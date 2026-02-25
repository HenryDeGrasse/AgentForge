import { AgentGuardrailType } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import type { ChartDataItem } from '@ghostfolio/common/interfaces';

export type ConfidenceLevel = 'high' | 'low' | 'medium';

export type ResponseStatus = 'completed' | 'failed' | 'partial';

/**
 * The final response envelope returned to all callers after verification.
 * Every field is required so the frontend never sees undefined.
 */
export interface VerifiedResponse {
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
  /** Number of ReAct iterations the agent performed. */
  iterations: number;
  /** Verified, non-empty response text. */
  response: string;
  /** Tool names that contributed to the response. */
  sources: string[];
  /** Agent completion status after verification. */
  status: ResponseStatus;
  /** Number of tool calls executed. */
  toolCalls: number;
  /** Domain-level warnings surfaced by the verifier. */
  warnings: string[];
}

export const SAFE_FALLBACK_RESPONSE =
  'No response was generated. Please try again.';

export const SLOW_RESPONSE_THRESHOLD_MS = 10_000;
