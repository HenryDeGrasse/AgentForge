import { AgentGuardrailType } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import { ReactAgentRunResult } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import {
  ConfidenceLevel,
  SAFE_FALLBACK_RESPONSE,
  SLOW_RESPONSE_THRESHOLD_MS,
  VerifiedResponse
} from '@ghostfolio/api/app/endpoints/ai/contracts/final-response.schema';

import { Injectable } from '@nestjs/common';

@Injectable()
export class ResponseVerifierService {
  /**
   * Verify and enrich a raw agent result before it reaches the frontend.
   *
   * @param result  - Raw output from ReactAgentService.run()
   * @param invokedToolNames - Tool names that were actually invoked (derived from executedTools)
   * @returns A fully-populated VerifiedResponse — never throws
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
   * (values, holdings, compliance status) that should be backed by tools.
   * Generic mentions of "portfolio" (e.g., "I can help with your portfolio")
   * do NOT trigger this.
   */
  private containsPortfolioClaims(text: string): boolean {
    return /\b(?:your portfolio (?:is|has|shows|contains|looks|total|value|worth)|your holdings (?:are|include|show|consist)|total value (?:is|of)|net worth (?:is|of)|worth (?:about |approximately )?\$[\d,]+|(?:you have|you own|you hold) [\d]+ (?:share|position|holding|stock|asset)|(?:gain|loss|return) of [\d.]+%|(?:compliant|non-compliant) with)\b/i.test(
      text
    );
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
