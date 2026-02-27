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
    invokedToolNames: string[]
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
      response,
      sources,
      status: result.status,
      toolCalls: result.toolCalls,
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

    return warnings;
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
