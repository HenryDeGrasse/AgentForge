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
 *
 * Design notes:
 * - Patterns are substrings, so "risk" matches "risky", "riskier", etc.
 * - Prefer multi-word patterns for precise tools (e.g. "what if", "capital gain")
 *   to reduce false positives from short common words.
 * - Ambiguous single-word signals (e.g. "buy", "sell") require a minimum score
 *   of MIN_SCORE_TO_INCLUDE to filter out non-financial uses.
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
    'concentrated',
    'concentration'
  ],
  compliance_check: [
    'complian',
    'regulat',
    'investment limit',
    'position limit',
    'restrict',
    'policy',
    'guideline',
    'threshold',
    'breach',
    'violat'
  ],
  get_portfolio_summary: [
    'portfolio',
    'summary',
    'overview',
    'holding',
    'position',
    'net worth',
    'allocation',
    'asset',
    'how much is my',
    'what is my portfolio'
  ],
  get_transaction_history: [
    'transaction',
    'trade history',
    'order history',
    'bought',
    'sold',
    'purchase history',
    'history',
    'recent activity',
    'dividend'
  ],
  market_data_lookup: [
    'price of',
    'current price',
    'stock price',
    'market data',
    'look up',
    'lookup',
    'quote for',
    'ticker',
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
    'year to date',
    'annual return'
  ],
  rebalance_suggest: [
    'rebalance',
    'realloc',
    'target allocation',
    'drift',
    'portfolio weight',
    'adjust my portfolio'
  ],
  simulate_trades: [
    'simulat',
    'what if i buy',
    'what if i sell',
    'what-if',
    'hypothetical',
    'if i purchased',
    'if i sold',
    'scenario',
    'what would happen if'
  ],
  stress_test: [
    'stress',
    'market crash',
    'downturn',
    'recession',
    'worst case',
    'worst-case',
    'bear market',
    'black swan',
    'crisis',
    'market collapse'
  ],
  tax_estimate: [
    'tax',
    'capital gain',
    'capital loss',
    'cost basis',
    'harvest',
    'tax-loss',
    'tax implication',
    'taxable'
  ]
};

/**
 * Negative signals: if a tool scores > 0 but the message also matches a
 * negative signal, the tool's score is discarded. This prevents obvious
 * false positives like "buy lunch" → simulate_trades.
 */
const TOOL_NEGATIVE_SIGNALS: Record<string, string[]> = {
  simulate_trades: [
    'lunch',
    'dinner',
    'breakfast',
    'groceries',
    'car',
    'house',
    'ticket',
    'concert',
    'movie',
    'coffee'
  ]
};

/** Foundation tool always included when router selects (ensures portfolio context). */
const FOUNDATION_TOOL = 'get_portfolio_summary';

/**
 * Foundation tool set returned when the message has no identifiable financial
 * signals. These four tools cover the most common portfolio questions and
 * provide enough context for the LLM to answer or ask a clarifying question.
 * Sending all 10 tools on every vague query wastes context window tokens.
 */
const FOUNDATION_TOOL_SET = [
  'get_portfolio_summary',
  'get_transaction_history',
  'analyze_risk',
  'market_data_lookup'
];

/** Min and max tools the router selects (before caller override). */
const MIN_TOOLS = 3;
const MAX_TOOLS = 5;

/**
 * Minimum keyword-match score for a tool to be included in the selection.
 * Tools that only match a single ambiguous keyword (e.g. "buy", "sell")
 * are excluded to reduce false positives.
 * Tools with highly specific multi-word signals (e.g. "what if i buy") will
 * naturally score ≥ 1 from that single match, so the threshold is intentionally low.
 */
const MIN_SCORE_TO_INCLUDE = 1;

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

      if (score < MIN_SCORE_TO_INCLUDE) {
        continue;
      }

      // Apply negative signals: discard score if any negative pattern matches
      const negativeSignals = TOOL_NEGATIVE_SIGNALS[toolName];

      if (negativeSignals?.some((neg) => normalizedMessage.includes(neg))) {
        continue;
      }

      scores.set(toolName, score);
    }

    // No scores → vague/empty query → fall back to foundation tool set.
    // Using all tools would flood the LLM context on every unclear message;
    // the foundation set covers the most common portfolio questions and is
    // small enough to keep the system prompt concise.
    if (scores.size === 0) {
      const foundationTools = FOUNDATION_TOOL_SET.filter((t) =>
        availableTools.includes(t)
      );
      // If none of the foundation tools are available, fall back to all tools
      const tools =
        foundationTools.length > 0 ? foundationTools : [...availableTools];

      return {
        source: 'fallback_all',
        tools
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
