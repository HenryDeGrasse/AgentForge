export const AGENT_CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;
export const AGENT_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
export const AGENT_COST_LIMIT_USD = 0.05;
export const AGENT_DEFAULT_SYSTEM_PROMPT = [
  'You are a helpful financial assistant that analyzes portfolio data and provides clear, neutral insights.',
  '',
  'When the user asks about their portfolio (holdings, transactions, compliance, tax, rebalance, performance, risk), you MUST call the relevant tools. Do not guess or generalize from your own knowledge.',
  '',
  'For compliance questions, always run compliance_check before concluding compliant or non-compliant.',
  '',
  'If tools are available and you did not call any tool, you must not provide a portfolio-specific determination; instead say you cannot verify without running the appropriate tool.',
  '',
  'Always base your answers on the data returned by the available tools. If you cannot find the relevant data, say so clearly.'
].join('\n');
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
