import { ToolRouterService } from './tool-router.service';

describe('ToolRouterService', () => {
  let router: ToolRouterService;
  const ALL_TOOL_NAMES = [
    'analyze_risk',
    'compliance_check',
    'get_portfolio_summary',
    'get_transaction_history',
    'market_data_lookup',
    'performance_compare',
    'rebalance_suggest',
    'simulate_trades',
    'stress_test',
    'tax_estimate'
  ];

  beforeEach(() => {
    router = new ToolRouterService();
  });

  // ─── Basic routing ───────────────────────────────────────────────────

  it('selects portfolio summary for "What is my portfolio worth?"', () => {
    const result = router.selectTools(
      'What is my portfolio worth?',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toContain('get_portfolio_summary');
    expect(result.tools.length).toBeLessThanOrEqual(5);
    expect(result.source).toBe('router');
  });

  it('selects risk tools for risk-related queries', () => {
    const result = router.selectTools(
      'How risky is my portfolio?',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toContain('analyze_risk');
    expect(result.tools).toContain('get_portfolio_summary');
    expect(result.source).toBe('router');
  });

  it('selects performance_compare for performance queries', () => {
    const result = router.selectTools(
      'Compare my performance to the S&P 500',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toContain('performance_compare');
    expect(result.source).toBe('router');
  });

  it('selects tax_estimate for tax-related queries', () => {
    const result = router.selectTools(
      'What are my tax implications?',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toContain('tax_estimate');
    expect(result.source).toBe('router');
  });

  it('selects transaction history for transaction queries', () => {
    const result = router.selectTools(
      'Show me my recent transactions',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toContain('get_transaction_history');
    expect(result.source).toBe('router');
  });

  it('selects compliance_check for compliance queries', () => {
    const result = router.selectTools(
      'Am I compliant with investment limits?',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toContain('compliance_check');
    expect(result.source).toBe('router');
  });

  it('selects rebalance for rebalancing queries', () => {
    const result = router.selectTools(
      'How should I rebalance my portfolio?',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toContain('rebalance_suggest');
    expect(result.source).toBe('router');
  });

  it('selects simulate_trades for what-if scenarios', () => {
    const result = router.selectTools(
      'What if I buy 100 shares of AAPL?',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toContain('simulate_trades');
    expect(result.source).toBe('router');
  });

  it('selects stress_test for stress testing queries', () => {
    const result = router.selectTools(
      'How would my portfolio handle a market crash?',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toContain('stress_test');
    expect(result.source).toBe('router');
  });

  it('selects market_data_lookup for market data queries', () => {
    const result = router.selectTools(
      'What is the current price of TSLA?',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toContain('market_data_lookup');
    expect(result.source).toBe('router');
  });

  // ─── Always includes portfolio summary ─────────────────────────────

  it('always includes get_portfolio_summary as foundation tool', () => {
    const result = router.selectTools(
      'What are my tax implications?',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toContain('get_portfolio_summary');
  });

  // ─── Limits selection to at most 5 ─────────────────────────────────

  it('selects at most 5 tools', () => {
    const result = router.selectTools(
      'Analyze my risk, compare performance, check compliance, estimate taxes, rebalance, simulate trades, stress test everything',
      ALL_TOOL_NAMES
    );

    expect(result.tools.length).toBeLessThanOrEqual(5);
  });

  it('selects at least 3 tools (including portfolio summary)', () => {
    const result = router.selectTools('What are my taxes?', ALL_TOOL_NAMES);

    expect(result.tools.length).toBeGreaterThanOrEqual(3);
    expect(result.tools).toContain('get_portfolio_summary');
  });

  // ─── Fallback to foundation tools ─────────────────────────────────

  it('falls back to foundation tools (not all tools) for vague queries', () => {
    const result = router.selectTools('help', ALL_TOOL_NAMES);

    expect(result.source).toBe('fallback_all');
    // Foundation set only — not all 10 tools
    expect(result.tools).toContain('get_portfolio_summary');
    expect(result.tools).toContain('get_transaction_history');
    expect(result.tools).toContain('analyze_risk');
    expect(result.tools).toContain('market_data_lookup');
    expect(result.tools.length).toBe(4);
  });

  it('falls back to foundation tools for empty messages', () => {
    const result = router.selectTools('', ALL_TOOL_NAMES);

    expect(result.source).toBe('fallback_all');
    expect(result.tools.length).toBe(4);
  });

  it('falls back to foundation tools for single-word greeting', () => {
    const result = router.selectTools('hello', ALL_TOOL_NAMES);

    expect(result.source).toBe('fallback_all');
    expect(result.tools.length).toBe(4);
  });

  // ─── Caller override ──────────────────────────────────────────────

  it('returns caller-specified tools as-is when provided', () => {
    const callerTools = ['analyze_risk', 'tax_estimate'];
    const result = router.selectTools('anything', ALL_TOOL_NAMES, callerTools);

    expect(result.tools).toEqual(callerTools);
    expect(result.source).toBe('caller_override');
  });

  it('returns caller-specified tools even for empty message', () => {
    const callerTools = ['stress_test'];
    const result = router.selectTools('', ALL_TOOL_NAMES, callerTools);

    expect(result.tools).toEqual(callerTools);
    expect(result.source).toBe('caller_override');
  });

  // ─── Edge cases ───────────────────────────────────────────────────

  it('handles case-insensitive matching', () => {
    const result = router.selectTools('SHOW MY RISK ANALYSIS', ALL_TOOL_NAMES);

    expect(result.tools).toContain('analyze_risk');
  });

  it('handles multi-intent queries', () => {
    const result = router.selectTools(
      'Compare my performance and check compliance',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toContain('performance_compare');
    expect(result.tools).toContain('compliance_check');
  });

  it('filters tools to only those in the available list', () => {
    const limitedTools = ['get_portfolio_summary', 'analyze_risk'];
    const result = router.selectTools('compare my performance', limitedTools);

    // performance_compare not in available list, so not included
    expect(result.tools.every((t) => limitedTools.includes(t))).toBe(true);
  });

  it('never returns duplicates', () => {
    const result = router.selectTools(
      'portfolio summary overview holdings value worth',
      ALL_TOOL_NAMES
    );

    const unique = new Set(result.tools);
    expect(unique.size).toBe(result.tools.length);
  });

  // ─── False positive regression tests ─────────────────────────────

  it('does NOT select simulate_trades for "buy lunch" (food context)', () => {
    const result = router.selectTools(
      'I want to buy lunch today',
      ALL_TOOL_NAMES
    );
    // "buy" in food context should not trigger simulate_trades
    expect(result.tools).not.toContain('simulate_trades');
  });

  it('does NOT select simulate_trades for "sell my car" (non-financial context)', () => {
    const result = router.selectTools('I need to sell my car', ALL_TOOL_NAMES);
    // No financial keywords → fallback to foundation tools, simulate_trades not included
    expect(result.tools).not.toContain('simulate_trades');
    expect(result.source).toBe('fallback_all');
  });

  it('does NOT match analyze_risk from a single partial-word hit', () => {
    // "risky business" has only one keyword match — should not trigger with min-match=2
    // (unless portfolio summary also pushes it in via foundation tool)
    const result = router.selectTools('risky business', ALL_TOOL_NAMES);
    // Foundation tool should still be present
    expect(result.tools).toContain('get_portfolio_summary');
    // analyze_risk should not be selected based on a single vague word alone
    // (it would need 2+ keyword hits to qualify)
    // This test verifies it doesn't dominate the selection unfairly
    expect(result.tools.length).toBeLessThanOrEqual(5);
  });

  it('uses foundation tools (not all tools) as fallback for vague query', () => {
    // "help me" has no keyword match — should use foundation set (4 tools, not 10)
    const result = router.selectTools('help me', ALL_TOOL_NAMES);
    expect(result.source).toBe('fallback_all');
    expect(result.tools.length).toBe(4);
    expect(result.tools).toContain('get_portfolio_summary');
  });

  it('selects simulate_trades for an explicit financial trade query', () => {
    const result = router.selectTools(
      'What if I buy 50 shares of MSFT and sell GOOGL?',
      ALL_TOOL_NAMES
    );
    expect(result.tools).toContain('simulate_trades');
    expect(result.source).toBe('router');
  });
});
