import { Injectable } from '@nestjs/common';

export interface ToolRoutingResult {
  /** Tools selected for this request */
  tools: string[];
  /** How the tools were selected */
  source: 'router' | 'caller_override';
}

/**
 * Tool selection for the AI agent.
 *
 * The router is intentionally a pass-through: tool-use models (gpt-4.1,
 * gpt-4o) are optimised to select the right tool from a complete list of
 * definitions. A keyword pre-filter saves ~500 tokens on a 128k-context
 * window but introduces fragile substring matching that causes real
 * misrouting ("history of Apple stock" → transaction_history instead of
 * market_data_lookup, "risky question" → analyze_risk, etc.).
 *
 * The LLM is better at this job than a keyword heuristic.
 *
 * If token cost becomes a concern at scale, implement semantic routing
 * via embeddings rather than substring matching.
 */
@Injectable()
export class ToolRouterService {
  /**
   * Select tools for a user message.
   *
   * Returns all available tools so the LLM can choose, unless the caller
   * has already specified an explicit set via callerOverrideTools.
   */
  public selectTools(
    _message: string,
    availableTools: string[],
    callerOverrideTools?: string[]
  ): ToolRoutingResult {
    if (callerOverrideTools?.length) {
      return { source: 'caller_override', tools: callerOverrideTools };
    }

    return { source: 'router', tools: [...availableTools] };
  }
}
