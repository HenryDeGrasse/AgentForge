import { buildSystemPrompt } from './system-prompt-builder';

describe('buildSystemPrompt', () => {
  describe('always-present sections', () => {
    it('includes CORE_IDENTITY in every prompt', () => {
      const prompt = buildSystemPrompt([]);
      expect(prompt).toContain('helpful financial assistant');
    });

    it('includes SCOPE_RULES in every prompt', () => {
      const prompt = buildSystemPrompt([]);
      expect(prompt).toContain('Scope');
    });

    it('includes TOOL_USAGE section in every prompt', () => {
      const prompt = buildSystemPrompt([]);
      expect(prompt).toContain('Tool usage');
    });

    it('includes RESPONSE_FORMATTING in every prompt', () => {
      const prompt = buildSystemPrompt([]);
      expect(prompt).toContain('Response formatting');
    });
  });

  describe('conditional sections — rebalancing', () => {
    it('includes rebalancing section when rebalance_suggest is in tool set', () => {
      const prompt = buildSystemPrompt(['rebalance_suggest']);
      expect(prompt).toContain('Rebalancing');
    });

    it('excludes rebalancing section when rebalance_suggest is NOT in tool set', () => {
      const prompt = buildSystemPrompt([
        'get_portfolio_summary',
        'analyze_risk'
      ]);
      expect(prompt).not.toContain('Rebalancing');
    });

    it('excludes rebalancing section when tool list is empty', () => {
      const prompt = buildSystemPrompt([]);
      expect(prompt).not.toContain('Rebalancing');
    });
  });

  describe('conditional sections — quantitative capabilities', () => {
    it('includes quantitative section when analyze_risk is in tool set', () => {
      const prompt = buildSystemPrompt(['analyze_risk']);
      expect(prompt).toContain('Quantitative capabilities');
    });

    it('excludes quantitative section when analyze_risk is NOT in tool set', () => {
      const prompt = buildSystemPrompt([
        'get_portfolio_summary',
        'tax_estimate'
      ]);
      expect(prompt).not.toContain('Quantitative capabilities');
    });
  });

  describe('conditional sections — cross-tool coherence', () => {
    it('includes cross-tool coherence section when more than 1 tool is selected', () => {
      const prompt = buildSystemPrompt(['analyze_risk', 'rebalance_suggest']);
      expect(prompt).toContain('Cross-tool coherence');
    });

    it('excludes cross-tool coherence section for single-tool requests', () => {
      const prompt = buildSystemPrompt(['tax_estimate']);
      expect(prompt).not.toContain('Cross-tool coherence');
    });

    it('excludes cross-tool coherence section for empty tool list', () => {
      const prompt = buildSystemPrompt([]);
      expect(prompt).not.toContain('Cross-tool coherence');
    });
  });

  describe('section combinations', () => {
    it('includes all sections when all relevant tools are present', () => {
      const prompt = buildSystemPrompt([
        'get_portfolio_summary',
        'analyze_risk',
        'rebalance_suggest',
        'tax_estimate'
      ]);
      expect(prompt).toContain('Rebalancing');
      expect(prompt).toContain('Quantitative capabilities');
      expect(prompt).toContain('Cross-tool coherence');
    });

    it('includes only core sections for a single non-special tool', () => {
      const prompt = buildSystemPrompt(['get_transaction_history']);
      expect(prompt).not.toContain('Rebalancing');
      expect(prompt).not.toContain('Quantitative capabilities');
      expect(prompt).not.toContain('Cross-tool coherence');
      // Core sections still present
      expect(prompt).toContain('helpful financial assistant');
      expect(prompt).toContain('Scope');
    });

    it('is shorter for single-tool request than full-tool request', () => {
      const singleTool = buildSystemPrompt(['tax_estimate']);
      const allTools = buildSystemPrompt([
        'get_portfolio_summary',
        'analyze_risk',
        'rebalance_suggest',
        'tax_estimate',
        'compliance_check'
      ]);
      expect(singleTool.length).toBeLessThan(allTools.length);
    });
  });

  describe('custom system prompt passthrough', () => {
    it('returns the custom prompt unchanged when provided', () => {
      const custom = 'You are a specialized hedge fund advisor.';
      expect(buildSystemPrompt([], custom)).toBe(custom);
    });

    it('ignores tool names when custom prompt is provided', () => {
      const custom = 'Custom prompt.';
      const result = buildSystemPrompt(
        ['analyze_risk', 'rebalance_suggest'],
        custom
      );
      expect(result).toBe(custom);
    });
  });
});
