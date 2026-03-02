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

  // ─── Pass-through behaviour ───────────────────────────────────────────────
  // The router no longer keyword-scores messages. Tool-use models (gpt-4.1,
  // gpt-4o) are optimised to select the right tool from a full list; a
  // keyword pre-filter adds fragility without meaningful token savings on a
  // 128k-context model.

  it('returns ALL available tools for any message', () => {
    const result = router.selectTools(
      'What is my portfolio worth?',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toEqual(ALL_TOOL_NAMES);
    expect(result.source).toBe('router');
  });

  it('returns all tools for a vague message', () => {
    const result = router.selectTools('help', ALL_TOOL_NAMES);

    expect(result.tools).toEqual(ALL_TOOL_NAMES);
    expect(result.source).toBe('router');
  });

  it('returns all tools for an empty message', () => {
    const result = router.selectTools('', ALL_TOOL_NAMES);

    expect(result.tools).toEqual(ALL_TOOL_NAMES);
    expect(result.source).toBe('router');
  });

  it('returns all tools for a complex multi-intent query', () => {
    const result = router.selectTools(
      'Analyze risk, compare performance, check compliance, estimate taxes',
      ALL_TOOL_NAMES
    );

    expect(result.tools).toEqual(ALL_TOOL_NAMES);
    expect(result.source).toBe('router');
  });

  it('returns only available tools when the available list is a subset', () => {
    const limited = ['get_portfolio_summary', 'analyze_risk'];
    const result = router.selectTools('compare my performance', limited);

    expect(result.tools).toEqual(limited);
    expect(result.source).toBe('router');
  });

  it('returns an empty array when no tools are available', () => {
    const result = router.selectTools('show my portfolio', []);

    expect(result.tools).toEqual([]);
    expect(result.source).toBe('router');
  });

  // ─── Caller override ──────────────────────────────────────────────────────

  it('returns caller-specified tools unchanged when provided', () => {
    const callerTools = ['analyze_risk', 'tax_estimate'];
    const result = router.selectTools('anything', ALL_TOOL_NAMES, callerTools);

    expect(result.tools).toEqual(callerTools);
    expect(result.source).toBe('caller_override');
  });

  it('returns caller-specified tools even for an empty message', () => {
    const callerTools = ['stress_test'];
    const result = router.selectTools('', ALL_TOOL_NAMES, callerTools);

    expect(result.tools).toEqual(callerTools);
    expect(result.source).toBe('caller_override');
  });

  it('never returns duplicates', () => {
    const result = router.selectTools('anything', ALL_TOOL_NAMES);
    const unique = new Set(result.tools);

    expect(unique.size).toBe(result.tools.length);
  });
});
