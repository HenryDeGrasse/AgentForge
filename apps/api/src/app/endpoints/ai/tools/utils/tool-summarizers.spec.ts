import { SUMMARY_RAW_CHARS, summarizeToolOutput } from './tool-summarizers';

describe('tool-summarizers', () => {
  // ─── get_portfolio_summary ────────────────────────────────────────

  describe('get_portfolio_summary', () => {
    it('produces a human-readable summary with key figures', () => {
      const output = {
        baseCurrency: 'USD',
        holdings: [
          {
            allocationPercentage: 60,
            assetClass: 'EQUITY',
            assetSubClass: 'ETF',
            currency: 'USD',
            name: 'Vanguard S&P 500 ETF',
            symbol: 'VOO'
          },
          {
            allocationPercentage: 40,
            assetClass: 'EQUITY',
            assetSubClass: 'STOCK',
            currency: 'USD',
            name: 'Apple Inc.',
            symbol: 'AAPL'
          }
        ],
        totalHoldings: 2
      };

      const result = summarizeToolOutput('get_portfolio_summary', output);

      expect(result).toContain('[SUMMARY]');
      expect(result).toContain('2 holdings');
      expect(result).toContain('USD');
      expect(result).toContain('VOO');
      expect(result).toContain('AAPL');
    });
  });

  // ─── analyze_risk ─────────────────────────────────────────────────

  describe('analyze_risk', () => {
    it('summarizes risk metrics', () => {
      const output = {
        baseCurrency: 'USD',
        overallRisk: {
          concentrationRisk: 'HIGH',
          currencyRisk: 'LOW',
          diversificationScore: 0.45,
          overallRiskLevel: 'MEDIUM'
        },
        riskContributors: [
          { allocation: 60, name: 'VOO', riskContribution: 'MEDIUM' },
          { allocation: 40, name: 'AAPL', riskContribution: 'HIGH' }
        ]
      };

      const result = summarizeToolOutput('analyze_risk', output);

      expect(result).toContain('[SUMMARY]');
      expect(result).toContain('MEDIUM');
      expect(result).toContain('concentration');
    });
  });

  // ─── performance_compare ──────────────────────────────────────────

  describe('performance_compare', () => {
    it('summarizes portfolio vs benchmark performance', () => {
      const output = {
        baseCurrency: 'USD',
        benchmarks: [
          {
            name: 'VOO',
            performances: {
              allTimeHigh: { performancePercent: -0.05 },
              periodReturn: { periodReturnPct: 0.08 }
            },
            symbol: 'VOO'
          }
        ],
        comparison: {
          outperformingBenchmarks: ['VOO'],
          underperformingBenchmarks: []
        },
        dateRange: 'ytd',
        portfolio: {
          netPerformancePercentage: 0.12
        }
      };

      const result = summarizeToolOutput('performance_compare', output);

      expect(result).toContain('[SUMMARY]');
      expect(result).toContain('outperforming');
    });
  });

  // ─── tax_estimate ─────────────────────────────────────────────────

  describe('tax_estimate', () => {
    it('summarizes tax data', () => {
      const output = {
        baseCurrency: 'USD',
        realizedGains: { longTerm: 5000, shortTerm: 1200 },
        unrealizedGains: { longTerm: 8000, shortTerm: 300 }
      };

      const result = summarizeToolOutput('tax_estimate', output);

      expect(result).toContain('[SUMMARY]');
      expect(result).toContain('5000');
    });
  });

  // ─── get_transaction_history ──────────────────────────────────────

  describe('get_transaction_history', () => {
    it('summarizes transaction count and types', () => {
      const output = {
        transactions: [
          { date: '2025-01-15', symbol: 'AAPL', type: 'BUY', quantity: 10 },
          { date: '2025-02-01', symbol: 'VOO', type: 'BUY', quantity: 5 },
          { date: '2025-02-15', symbol: 'AAPL', type: 'SELL', quantity: 3 }
        ],
        totalCount: 3
      };

      const result = summarizeToolOutput('get_transaction_history', output);

      expect(result).toContain('[SUMMARY]');
      expect(result).toContain('3');
    });
  });

  // ─── Unknown tool falls back gracefully ───────────────────────────

  describe('unknown tool', () => {
    it('returns raw JSON for unrecognized tool names', () => {
      const output = { foo: 'bar' };
      const result = summarizeToolOutput('nonexistent_tool', output);

      expect(result).toContain('"foo"');
      expect(result).toContain('"bar"');
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles null output gracefully', () => {
      const result = summarizeToolOutput('get_portfolio_summary', null);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('handles undefined output gracefully', () => {
      const result = summarizeToolOutput('analyze_risk', undefined);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('handles empty object gracefully', () => {
      const result = summarizeToolOutput('get_portfolio_summary', {});

      expect(result).toContain('[SUMMARY]');
    });

    it('handles string output', () => {
      const result = summarizeToolOutput('get_portfolio_summary', 'raw string');

      expect(result).toBeDefined();
      expect(result).toContain('raw string');
    });

    it('truncates raw JSON to SUMMARY_RAW_CHARS', () => {
      const largeOutput = {
        data: 'x'.repeat(SUMMARY_RAW_CHARS * 2)
      };

      const result = summarizeToolOutput('get_portfolio_summary', largeOutput);

      // Summary + truncated raw should be present
      expect(result).toContain('[SUMMARY]');
      expect(result).toContain('[RAW JSON truncated]');
      // Total length should be bounded
      expect(result.length).toBeLessThan(SUMMARY_RAW_CHARS * 3);
    });

    it('includes full raw JSON when it fits within SUMMARY_RAW_CHARS', () => {
      const smallOutput = { value: 42 };
      const result = summarizeToolOutput('get_portfolio_summary', smallOutput);

      expect(result).toContain('"value"');
      expect(result).not.toContain('[RAW JSON truncated]');
    });
  });

  // ─── compliance_check ─────────────────────────────────────────────

  describe('compliance_check', () => {
    it('summarizes compliance status', () => {
      const output = {
        isCompliant: true,
        rules: [
          { name: 'Max allocation', status: 'PASS' },
          { name: 'Min diversification', status: 'PASS' }
        ]
      };

      const result = summarizeToolOutput('compliance_check', output);

      expect(result).toContain('[SUMMARY]');
      expect(result).toMatch(/compliant|PASS/i);
    });
  });

  // ─── rebalance_suggest ────────────────────────────────────────────

  describe('rebalance_suggest', () => {
    it('summarizes rebalance suggestions', () => {
      const output = {
        suggestions: [
          { action: 'BUY', symbol: 'VTI', amount: 5000 },
          { action: 'SELL', symbol: 'AAPL', amount: 2000 }
        ]
      };

      const result = summarizeToolOutput('rebalance_suggest', output);

      expect(result).toContain('[SUMMARY]');
    });
  });

  // ─── simulate_trades ─────────────────────────────────────────────

  describe('simulate_trades', () => {
    it('summarizes simulation results', () => {
      const output = {
        simulatedPortfolio: {
          totalValue: 105000,
          netChange: 5000
        }
      };

      const result = summarizeToolOutput('simulate_trades', output);

      expect(result).toContain('[SUMMARY]');
    });
  });

  // ─── stress_test ──────────────────────────────────────────────────

  describe('stress_test', () => {
    it('summarizes stress test results', () => {
      const output = {
        scenarios: [
          { name: '2008 Financial Crisis', portfolioImpact: -0.35 },
          { name: 'COVID Crash', portfolioImpact: -0.25 }
        ]
      };

      const result = summarizeToolOutput('stress_test', output);

      expect(result).toContain('[SUMMARY]');
    });
  });

  // ─── market_data_lookup ───────────────────────────────────────────

  describe('market_data_lookup', () => {
    it('summarizes market data results', () => {
      const output = {
        quotes: [
          { symbol: 'AAPL', price: 185.5, currency: 'USD' },
          { symbol: 'TSLA', price: 245.0, currency: 'USD' }
        ]
      };

      const result = summarizeToolOutput('market_data_lookup', output);

      expect(result).toContain('[SUMMARY]');
      expect(result).toContain('AAPL');
    });
  });
});
