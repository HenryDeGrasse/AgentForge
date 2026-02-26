import { ActionExtractorService } from './action-extractor.service';

describe('ActionExtractorService', () => {
  let service: ActionExtractorService;

  beforeEach(() => {
    service = new ActionExtractorService();
  });

  // ─── Empty / unknown input ────────────────────────────────────────────────

  it('returns empty array for empty invokedToolNames', () => {
    expect(service.extract([])).toEqual([]);
  });

  it('returns empty array for unknown tool names', () => {
    expect(service.extract(['unknown_tool', 'another_unknown'])).toEqual([]);
  });

  it('never throws on malformed input', () => {
    expect(() => service.extract(undefined as any)).not.toThrow();
    expect(() => service.extract(null as any)).not.toThrow();
  });

  // ─── Per-tool action mappings ─────────────────────────────────────────────

  it('returns chips for get_portfolio_summary', () => {
    const actions = service.extract(['get_portfolio_summary']);

    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.prompt.length > 0)).toBe(true);
    expect(actions.every((a) => a.key.length > 0)).toBe(true);

    const keys = actions.map((a) => a.key);
    expect(keys).toContain('risk-exposure');
    expect(keys).toContain('performance-history');
  });

  it('returns chips for analyze_risk', () => {
    const actions = service.extract(['analyze_risk']);

    const keys = actions.map((a) => a.key);
    expect(keys).toContain('reduce-risk');
    expect(keys).toContain('compliance-status');
  });

  it('returns chips and a button for compliance_check', () => {
    const actions = service.extract(['compliance_check']);

    const chips = actions.filter((a) => a.actionType === 'chip');
    const buttons = actions.filter((a) => a.actionType === 'button');

    expect(chips.length).toBeGreaterThan(0);
    expect(buttons.length).toBe(1);
    expect(buttons[0].key).toBe('compliance-full-report');
  });

  it('returns chips for market_data_lookup', () => {
    const actions = service.extract(['market_data_lookup']);

    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((a) => a.key === 'compare-holdings')).toBe(true);
  });

  it('returns chips for performance_compare', () => {
    const actions = service.extract(['performance_compare']);

    expect(actions.length).toBeGreaterThan(0);
  });

  it('returns chips for rebalance_suggest', () => {
    const actions = service.extract(['rebalance_suggest']);

    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((a) => a.key === 'tax-impact')).toBe(true);
  });

  it('returns chips for tax_estimate', () => {
    const actions = service.extract(['tax_estimate']);

    expect(actions.length).toBeGreaterThan(0);
  });

  it('returns chips for get_transaction_history', () => {
    const actions = service.extract(['get_transaction_history']);

    expect(actions.length).toBeGreaterThan(0);
  });

  it('returns chips for simulate_trades', () => {
    const actions = service.extract(['simulate_trades']);

    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((a) => a.key === 'analyze-risk-simulated')).toBe(true);
    expect(actions.some((a) => a.key === 'try-different-trades')).toBe(true);
  });

  it('returns chips for stress_test', () => {
    const actions = service.extract(['stress_test']);

    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((a) => a.key === 'try-another-scenario')).toBe(true);
    expect(actions.some((a) => a.key === 'analyze-risk-from-stress')).toBe(
      true
    );
  });

  // ─── Deduplication ────────────────────────────────────────────────────────

  it('deduplicates actions by key', () => {
    const actions = service.extract([
      'get_portfolio_summary',
      'analyze_risk',
      'compliance_check'
    ]);

    const keys = actions.map((a) => a.key);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  // ─── Cap ──────────────────────────────────────────────────────────────────

  it('caps total actions at 6', () => {
    const actions = service.extract([
      'get_portfolio_summary',
      'analyze_risk',
      'compliance_check',
      'market_data_lookup',
      'performance_compare',
      'rebalance_suggest',
      'simulate_trades',
      'stress_test',
      'tax_estimate',
      'get_transaction_history'
    ]);

    expect(actions.length).toBeLessThanOrEqual(6);
  });

  // ─── Recency ordering ────────────────────────────────────────────────────

  it('prioritizes actions from the most recently invoked tool', () => {
    const actions = service.extract([
      'get_portfolio_summary',
      'compliance_check'
    ]);

    // Last tool was compliance_check, its actions should come first
    const firstAction = actions[0];
    const complianceKeys = ['compliance-violations', 'compliance-full-report'];
    expect(complianceKeys).toContain(firstAction.key);
  });

  // ─── ActionItem shape ─────────────────────────────────────────────────────

  it('returns well-formed ActionItem objects', () => {
    const actions = service.extract(['get_portfolio_summary']);

    for (const action of actions) {
      expect(action).toHaveProperty('actionType');
      expect(action).toHaveProperty('label');
      expect(action).toHaveProperty('prompt');
      expect(action).toHaveProperty('key');
      expect(['chip', 'button']).toContain(action.actionType);
      expect(typeof action.label).toBe('string');
      expect(typeof action.prompt).toBe('string');
      expect(typeof action.key).toBe('string');
    }
  });

  // ─── All prompts are in-scope ─────────────────────────────────────────────

  it('only proposes prompts that are portfolio/finance related', () => {
    const allTools = [
      'get_portfolio_summary',
      'analyze_risk',
      'compliance_check',
      'market_data_lookup',
      'performance_compare',
      'rebalance_suggest',
      'simulate_trades',
      'stress_test',
      'tax_estimate',
      'get_transaction_history'
    ];

    for (const tool of allTools) {
      const actions = service.extract([tool]);

      for (const action of actions) {
        // Prompts should contain finance/portfolio-related keywords
        const prompt = action.prompt.toLowerCase();
        const hasFinanceKeyword =
          /risk|portfolio|compliance|performance|tax|transaction|rebalanc|holding|market|trend|history|report|summary|simulat|trades|stress|scenario/i.test(
            prompt
          );

        expect(hasFinanceKeyword).toBe(true);
      }
    }
  });
});
