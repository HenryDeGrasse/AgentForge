export const AGENT_CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;
export const AGENT_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
export const AGENT_COST_LIMIT_USD = 0.05;
export const AGENT_DEFAULT_SYSTEM_PROMPT =
  'You are a helpful financial assistant that analyzes portfolio data and provides clear, neutral insights. Always base your answers on the data returned by the available tools. If you cannot find the relevant data, say so clearly.';
export const AGENT_FALLBACK_COST_PER_1K_TOKENS_USD = 0.002;
export const AGENT_MAX_HISTORY_PAIRS = 10; // user+assistant pairs sent to LLM as prior context
export const AGENT_MAX_ITERATIONS = 6;
export const AGENT_TIMEOUT_MS = 15_000;

/** Tool names that the AI agent is allowed to invoke */
export const AGENT_ALLOWED_TOOL_NAMES = [
  'analyze_risk',
  'compliance_check',
  'get_portfolio_summary',
  'get_transaction_history',
  'market_data_lookup',
  'performance_compare',
  'rebalance_suggest',
  'tax_estimate'
] as const;
