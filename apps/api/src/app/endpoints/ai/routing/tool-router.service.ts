import { Injectable } from '@nestjs/common';

export interface ToolRoutingResult {
  /** Tools selected for this request */
  tools: string[];
  /** How the tools were selected */
  source: 'router' | 'caller_override' | 'fallback_all';
}

/**
 * Keyword-signal scoring per tool. Maps tool names to an array of keyword
 * patterns (lowercase). When the user message matches any pattern, the
 * tool earns 1 point per unique match.
 */
const TOOL_SIGNALS: Record<string, string[]> = {
  analyze_risk: [
    'risk',
    'risky',
    'volatil',
    'drawdown',
    'sharpe',
    'sortino',
    'beta',
    'diversif',
    'correlation',
    'exposure',
    'concentrated'
  ],
  compliance_check: [
    'complian',
    'regulat',
    'limit',
    'restrict',
    'rule',
    'policy',
    'guideline',
    'threshold',
    'breach'
  ],
  get_portfolio_summary: [
    'portfolio',
    'summary',
    'overview',
    'holding',
    'position',
    'worth',
    'value',
    'allocation',
    'asset',
    'net worth'
  ],
  get_transaction_history: [
    'transaction',
    'trade',
    'order',
    'bought',
    'sold',
    'purchase',
    'history',
    'recent',
    'activity',
    'dividend'
  ],
  market_data_lookup: [
    'price',
    'quote',
    'ticker',
    'stock',
    'market data',
    'look up',
    'lookup',
    'current price',
    'symbol'
  ],
  performance_compare: [
    'performance',
    'compare',
    'benchmark',
    'return',
    'outperform',
    'underperform',
    's&p',
    'spy',
    'voo',
    'qqq',
    'ytd',
    'gain',
    'loss'
  ],
  rebalance_suggest: [
    'rebalance',
    'reallocat',
    'target allocation',
    'drift',
    'weight',
    'adjust'
  ],
  simulate_trades: [
    'simulat',
    'what if',
    'what-if',
    'hypothetical',
    'scenario',
    'buy',
    'sell',
    'add',
    'remove'
  ],
  stress_test: [
    'stress',
    'crash',
    'downturn',
    'recession',
    'worst case',
    'worst-case',
    'bear market',
    'black swan',
    'crisis'
  ],
  tax_estimate: [
    'tax',
    'capital gain',
    'capital loss',
    'cost basis',
    'harvest',
    'tax-loss'
  ]
};

/** Foundation tool always included when router selects */
const FOUNDATION_TOOL = 'get_portfolio_summary';

/** Min and max tools the router selects (before caller override) */
const MIN_TOOLS = 3;
const MAX_TOOLS = 5;

@Injectable()
export class ToolRouterService {
  /**
   * Select the most relevant tools for a user message.
   *
   * @param message The user's chat message
   * @param availableTools All tool names currently registered
   * @param callerOverrideTools If the caller explicitly specifies tools, bypass routing
   * @returns Routing result with selected tools and source
   */
  public selectTools(
    message: string,
    availableTools: string[],
    callerOverrideTools?: string[]
  ): ToolRoutingResult {
    // Caller override bypasses all routing logic
    if (callerOverrideTools?.length) {
      return {
        source: 'caller_override',
        tools: callerOverrideTools
      };
    }

    const normalizedMessage = message.toLowerCase().trim();

    // Score each tool
    const scores = new Map<string, number>();

    for (const toolName of availableTools) {
      const signals = TOOL_SIGNALS[toolName];

      if (!signals) {
        continue;
      }

      let score = 0;

      for (const keyword of signals) {
        if (normalizedMessage.includes(keyword)) {
          score++;
        }
      }

      if (score > 0) {
        scores.set(toolName, score);
      }
    }

    // No scores → vague/empty query → fall back to all tools
    if (scores.size === 0) {
      return {
        source: 'fallback_all',
        tools: [...availableTools]
      };
    }

    // Sort by score descending, take top MAX_TOOLS
    const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const selected = new Set(sorted.slice(0, MAX_TOOLS).map(([name]) => name));

    // Always include foundation tool if available
    if (availableTools.includes(FOUNDATION_TOOL)) {
      selected.add(FOUNDATION_TOOL);
    }

    // Pad to MIN_TOOLS if below minimum
    if (selected.size < MIN_TOOLS) {
      for (const toolName of availableTools) {
        if (selected.size >= MIN_TOOLS) {
          break;
        }

        selected.add(toolName);
      }
    }

    // Cap at MAX_TOOLS (foundation tool may have pushed us over)
    const tools = [...selected].slice(0, MAX_TOOLS);

    return {
      source: 'router',
      tools
    };
  }
}
