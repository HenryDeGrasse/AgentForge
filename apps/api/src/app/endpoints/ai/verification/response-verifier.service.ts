import { AgentGuardrailType } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import { ReactAgentRunResult } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import {
  ConfidenceLevel,
  SAFE_FALLBACK_RESPONSE,
  SLOW_RESPONSE_THRESHOLD_MS,
  VerifiedResponse
} from '@ghostfolio/api/app/endpoints/ai/contracts/final-response.schema';
import { containsUnbackedPortfolioClaim } from '@ghostfolio/api/app/endpoints/ai/utils/portfolio-claim-detector';

import { Injectable } from '@nestjs/common';

/**
 * Enriches a raw agent result with heuristic quality signals before it
 * reaches the frontend.
 *
 * Confidence scoring is DETERMINISTIC (no second LLM call):
 *  - HIGH   → completed, tools called, no tool errors
 *  - MEDIUM → partial completion OR tool errors OR no tools used
 *  - LOW    → failed status
 *
 * Warnings are generated for: slow responses, guardrail fires, missing
 * tool coverage, and unbacked portfolio claims (detected via regex).
 *
 * "Requires human review" is set when confidence is low, a guardrail fired,
 * or the response contains portfolio claims without tool backing.
 */
@Injectable()
export class ResponseVerifierService {
  /**
   * Build a fully-populated VerifiedResponse from a raw agent result.
   *
   * @param result  - Raw output from ReactAgentService.run()
   * @param invokedToolNames - Tool names that were actually invoked (derived from executedTools)
   * @param traceId - Optional Langfuse trace ID for feedback correlation
   * @returns VerifiedResponse — never throws
   */
  public verify(
    result: ReactAgentRunResult,
    invokedToolNames: string[],
    traceId = ''
  ): VerifiedResponse {
    const confidence = this.computeConfidence(result);
    const warnings = this.collectWarnings(result);
    const sources =
      result.toolCalls > 0 && invokedToolNames.length > 0
        ? invokedToolNames
        : [];
    const response = result.response?.trim()
      ? result.response
      : SAFE_FALLBACK_RESPONSE;

    // Human review is recommended when:
    //  - confidence is low (failed status, tool errors)
    //  - a guardrail fired (cost, timeout, circuit breaker, max iterations)
    //  - the verifier detected unbacked portfolio claims
    const requiresHumanReview =
      confidence === 'low' ||
      result.guardrail !== undefined ||
      warnings.some((w) =>
        w.includes('portfolio-specific claims but no data tools')
      );

    return {
      actions: [],
      chartData: [],
      confidence,
      elapsedMs: result.elapsedMs,
      estimatedCostUsd: result.estimatedCostUsd,
      ...(result.guardrail !== undefined
        ? { guardrail: result.guardrail }
        : {}),
      invokedToolNames,
      iterations: result.iterations,
      requiresHumanReview,
      response,
      sources,
      status: result.status,
      toolCalls: result.toolCalls,
      traceId,
      warnings
    };
  }

  // ─── private helpers ──────────────────────────────────────────────────────

  private computeConfidence(result: ReactAgentRunResult): ConfidenceLevel {
    if (result.status === 'failed') {
      return 'low';
    }

    if (result.status === 'partial') {
      return 'medium';
    }

    // completed
    if (result.toolCalls > 0) {
      const hasToolError = result.executedTools.some(
        (entry) => entry.envelope.status !== 'success'
      );

      return hasToolError ? 'medium' : 'high';
    }

    return 'medium';
  }

  private collectWarnings(result: ReactAgentRunResult): string[] {
    const warnings: string[] = [];

    if (result.status === 'failed') {
      warnings.push('Response could not be completed. Please try again.');
    }

    if (result.status === 'partial') {
      warnings.push('Response may be incomplete due to an early stop.');
    }

    if (result.toolCalls === 0) {
      warnings.push(
        'No portfolio data tools were used; response may not reflect current data.'
      );
    }

    if (result.elapsedMs > SLOW_RESPONSE_THRESHOLD_MS) {
      warnings.push('Response took longer than expected; data may be delayed.');
    }

    if (result.guardrail) {
      warnings.push(this.guardrailWarning(result.guardrail));
    }

    // Detect unbacked portfolio claims: response mentions specific portfolio
    // data but no tools were called to verify it.
    if (
      result.toolCalls === 0 &&
      result.status === 'completed' &&
      this.containsPortfolioClaims(result.response)
    ) {
      warnings.push(
        'Response contains portfolio-specific claims but no data tools were used to verify them.'
      );
    }

    return warnings;
  }

  /**
   * Returns true if the text contains specific portfolio data assertions
   * that should be backed by tools.
   * Delegates to containsUnbackedPortfolioClaim() — the single source of
   * truth shared with ReactAgentService to prevent pattern drift.
   */
  private containsPortfolioClaims(text: string): boolean {
    return containsUnbackedPortfolioClaim(text);
  }

  private guardrailWarning(guardrail: AgentGuardrailType): string {
    switch (guardrail) {
      case 'CIRCUIT_BREAKER':
        return 'The AI provider is temporarily unavailable. Please try again later.';
      case 'COST_LIMIT':
        return 'Response was cut short due to cost constraints.';
      case 'MAX_ITERATIONS':
        return 'Response was cut short after reaching the reasoning step limit.';
      case 'TIMEOUT':
        return 'Response was cut short due to a timeout.';
    }
  }
}
