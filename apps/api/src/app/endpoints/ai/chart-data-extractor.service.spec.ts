import type { ExecutedToolEntry } from './agent/react-agent.service';
import { ChartDataExtractorService } from './chart-data-extractor.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(
  toolName: string,
  data: Record<string, unknown>,
  status: 'success' | 'error' | 'partial' = 'success'
): ExecutedToolEntry {
  return {
    envelope:
      status === 'error'
        ? { error: { code: 'err', message: 'err' }, status: 'error' }
        : { data, status },
    toolName
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChartDataExtractorService', () => {
  let service: ChartDataExtractorService;

  beforeEach(() => {
    service = new ChartDataExtractorService();
  });

  // ─── Top-level extract() ──────────────────────────────────────────────────

  describe('extract()', () => {
    it('should return [] when executedTools is empty', () => {
      expect(service.extract([])).toEqual([]);
    });

    it('should skip tools with error status', () => {
      const charts = service.extract([
        makeEntry('get_portfolio_summary', { topHoldings: [] }, 'error')
      ]);

      expect(charts).toEqual([]);
    });

    it('should include partial-status tool results', () => {
      const charts = service.extract([
        makeEntry(
          'get_portfolio_summary',
          {
            topHoldings: [
              {
                allocationInPortfolio: 0.5,
                name: 'AAPL',
                symbol: 'AAPL'
              }
            ]
          },
          'partial'
        )
      ]);

      expect(charts.length).toBeGreaterThan(0);
    });

    it('should not throw on unknown tool name', () => {
      expect(() =>
        service.extract([makeEntry('unknown_tool', { foo: 1 })])
      ).not.toThrow();
    });
  });

  // ─── get_portfolio_summary ────────────────────────────────────────────────

  describe('get_portfolio_summary', () => {
    it('should generate a doughnut chart from topHoldings', () => {
      const charts = service.extract([
        makeEntry('get_portfolio_summary', {
          topHoldings: [
            { allocationInPortfolio: 0.4, name: 'Apple', symbol: 'AAPL' },
            { allocationInPortfolio: 0.3, name: 'Microsoft', symbol: 'MSFT' }
          ]
        })
      ]);

      expect(charts).toHaveLength(1);
      expect(charts[0].chartType).toBe('doughnut');
      expect(charts[0].toolName).toBe('get_portfolio_summary');
    });

    it('should multiply allocationInPortfolio (0–1) by 100 to get percentage', () => {
      const charts = service.extract([
        makeEntry('get_portfolio_summary', {
          topHoldings: [
            { allocationInPortfolio: 0.25, name: 'Apple', symbol: 'AAPL' }
          ]
        })
      ]);

      const item = (
        charts[0].data as { items: { name: string; value: number }[] }
      ).items[0];
      // 0.25 * 100 = 25
      expect(item.value).toBeCloseTo(25, 5);
    });

    it('should return [] when topHoldings is empty', () => {
      const charts = service.extract([
        makeEntry('get_portfolio_summary', { topHoldings: [] })
      ]);

      expect(charts).toEqual([]);
    });

    it('should return [] when topHoldings is missing', () => {
      const charts = service.extract([makeEntry('get_portfolio_summary', {})]);

      expect(charts).toEqual([]);
    });
  });

  // ─── analyze_risk ─────────────────────────────────────────────────────────

  describe('analyze_risk', () => {
    const richData = {
      exposures: {
        assetClassExposures: [
          { allocationInPortfolio: 0.7, assetClass: 'EQUITY' },
          { allocationInPortfolio: 0.3, assetClass: 'FIXED_INCOME' }
        ],
        topSectorExposures: [
          { allocationInPortfolio: 0.4, sector: 'Technology' },
          { allocationInPortfolio: 0.2, sector: 'Healthcare' }
        ]
      }
    };

    it('should read assetClassExposures from data.exposures (not top-level)', () => {
      const charts = service.extract([makeEntry('analyze_risk', richData)]);

      const doughnut = charts.find((c) => c.label === 'Asset Class Exposure');

      expect(doughnut).toBeDefined();
      expect(doughnut!.chartType).toBe('doughnut');

      const items = (
        doughnut!.data as { items: { name: string; value: number }[] }
      ).items;

      expect(items).toHaveLength(2);
      expect(items[0].name).toBe('EQUITY');
      // 0.7 * 100 = 70
      expect(items[0].value).toBeCloseTo(70, 5);
    });

    it('should read topSectorExposures from data.exposures (not top-level)', () => {
      const charts = service.extract([makeEntry('analyze_risk', richData)]);

      const bar = charts.find((c) => c.label === 'Top Sector Exposure');

      expect(bar).toBeDefined();
      expect(bar!.chartType).toBe('horizontalBar');

      const items = (bar!.data as { items: { name: string; value: number }[] })
        .items;

      expect(items[0].name).toBe('Technology');
      expect(items[0].value).toBeCloseTo(40, 5);
    });

    it('should return [] when exposures field is missing', () => {
      const charts = service.extract([
        makeEntry('analyze_risk', { flags: [], holdingsCount: 0 })
      ]);

      expect(charts).toEqual([]);
    });

    it('should return [] when assetClassExposures is empty', () => {
      const charts = service.extract([
        makeEntry('analyze_risk', {
          exposures: {
            assetClassExposures: [],
            topSectorExposures: []
          }
        })
      ]);

      expect(charts).toEqual([]);
    });
  });

  // ─── market_data_lookup ───────────────────────────────────────────────────

  describe('market_data_lookup', () => {
    it('should use marketPrice field from historicalData items', () => {
      const charts = service.extract([
        makeEntry('market_data_lookup', {
          symbol: 'AAPL',
          historicalData: [
            { date: '2024-01-01T00:00:00Z', marketPrice: 180 },
            { date: '2024-01-02T00:00:00Z', marketPrice: 182 }
          ]
        })
      ]);

      expect(charts).toHaveLength(1);
      expect(charts[0].chartType).toBe('line');

      const items = (
        charts[0].data as { items: { date: string; value: number }[] }
      ).items;

      // marketPrice must be read, not 0 (close/price fallback)
      expect(items[0].value).toBe(180);
      expect(items[1].value).toBe(182);
    });

    it('should return [] when historicalData is empty', () => {
      const charts = service.extract([
        makeEntry('market_data_lookup', {
          symbol: 'AAPL',
          historicalData: []
        })
      ]);

      expect(charts).toEqual([]);
    });

    it('should return [] when historicalData is missing', () => {
      const charts = service.extract([
        makeEntry('market_data_lookup', { symbol: 'AAPL' })
      ]);

      expect(charts).toEqual([]);
    });

    it('should use symbol as chart label', () => {
      const charts = service.extract([
        makeEntry('market_data_lookup', {
          symbol: 'MSFT',
          historicalData: [{ date: '2024-01-01', marketPrice: 400 }]
        })
      ]);

      expect(charts[0].label).toBe('MSFT');
    });
  });

  // ─── rebalance_suggest ────────────────────────────────────────────────────

  describe('rebalance_suggest', () => {
    const trades = [
      {
        action: 'BUY',
        currentPct: 0.1,
        driftPct: 0.15,
        name: 'Apple',
        quantityEstimate: 5,
        symbol: 'AAPL',
        targetPct: 0.25,
        valueInBaseCurrency: 1500
      }
    ];

    it('should generate a table chart from suggestedTrades', () => {
      const charts = service.extract([
        makeEntry('rebalance_suggest', { suggestedTrades: trades })
      ]);

      expect(charts).toHaveLength(1);
      expect(charts[0].chartType).toBe('table');
    });

    it('should populate table rows with currentPct, targetPct, driftPct (not currentPercentage etc.)', () => {
      const charts = service.extract([
        makeEntry('rebalance_suggest', { suggestedTrades: trades })
      ]);

      const tableData = charts[0].data as {
        columns: string[];
        rows: string[][];
      };
      const row = tableData.rows[0];

      // columns: Symbol, Action, Current %, Target %, Drift %
      expect(row[0]).toBe('AAPL');
      expect(row[1]).toBe('BUY');
      // These must NOT be empty strings (which was the bug)
      expect(row[2]).not.toBe('');
      expect(row[3]).not.toBe('');
      expect(row[4]).not.toBe('');
    });

    it('should return [] when suggestedTrades is empty', () => {
      const charts = service.extract([
        makeEntry('rebalance_suggest', { suggestedTrades: [] })
      ]);

      expect(charts).toEqual([]);
    });
  });

  // ─── tax_estimate ─────────────────────────────────────────────────────────

  describe('tax_estimate', () => {
    const gains = {
      shortTerm: {
        gainInBaseCurrency: 1000,
        lossInBaseCurrency: 200,
        netInBaseCurrency: 800,
        transactionCount: 3
      },
      longTerm: {
        gainInBaseCurrency: 5000,
        lossInBaseCurrency: 0,
        netInBaseCurrency: 5000,
        transactionCount: 1
      },
      total: {
        gainInBaseCurrency: 6000,
        lossInBaseCurrency: 200,
        netInBaseCurrency: 5800,
        transactionCount: 4
      }
    };

    it('should generate a table chart from realizedGains', () => {
      const charts = service.extract([
        makeEntry('tax_estimate', { realizedGains: gains })
      ]);

      expect(charts).toHaveLength(1);
      expect(charts[0].chartType).toBe('table');
    });

    it('should render net currency values not [object Object]', () => {
      const charts = service.extract([
        makeEntry('tax_estimate', { realizedGains: gains })
      ]);

      const tableData = charts[0].data as {
        columns: string[];
        rows: string[][];
      };

      for (const row of tableData.rows) {
        // No cell should contain "[object Object]"
        expect(row[1]).not.toContain('[object Object]');
        // Cells should contain numeric values
        expect(row[1]).toMatch(/[\d.]/);
      }
    });

    it('should show short-term net value in second column of first row', () => {
      const charts = service.extract([
        makeEntry('tax_estimate', { realizedGains: gains })
      ]);

      const tableData = charts[0].data as {
        columns: string[];
        rows: string[][];
      };
      const shortTermRow = tableData.rows.find((r) =>
        r[0].toLowerCase().includes('short')
      );

      expect(shortTermRow).toBeDefined();
      expect(shortTermRow![1]).toBe('800');
    });

    it('should return [] when realizedGains is missing', () => {
      const charts = service.extract([makeEntry('tax_estimate', {})]);

      expect(charts).toEqual([]);
    });
  });

  // ─── compliance_check ─────────────────────────────────────────────────────

  describe('compliance_check', () => {
    const results = [
      {
        currentValue: 0.3,
        description: 'Max single position',
        details: '30%',
        ruleId: 'max_single_position',
        ruleName: 'Max Single Position',
        status: 'pass',
        threshold: 0.25
      }
    ];

    it('should generate a table chart from results', () => {
      const charts = service.extract([
        makeEntry('compliance_check', { results })
      ]);

      expect(charts).toHaveLength(1);
      expect(charts[0].chartType).toBe('table');
    });

    it('should use ruleName field (not name or rule)', () => {
      const charts = service.extract([
        makeEntry('compliance_check', { results })
      ]);

      const tableData = charts[0].data as {
        columns: string[];
        rows: string[][];
      };
      // First column of first row should be the ruleName, not empty
      expect(tableData.rows[0][0]).toBe('Max Single Position');
    });

    it('should return [] when results is empty', () => {
      const charts = service.extract([
        makeEntry('compliance_check', { results: [] })
      ]);

      expect(charts).toEqual([]);
    });
  });

  // ─── performance_compare ──────────────────────────────────────────────────

  describe('performance_compare', () => {
    const perfData = {
      benchmarks: [
        {
          dataSource: 'YAHOO',
          marketCondition: 'BULL',
          name: 'S&P 500',
          performances: {
            allTimeHigh: { date: '2024-01-01', performancePercent: -2.5 }
          },
          symbol: 'SPY',
          trend200d: 'BULLISH',
          trend50d: 'BULLISH'
        }
      ],
      comparison: {
        outperformingBenchmarks: ['SPY'],
        underperformingBenchmarks: []
      },
      dateRange: 'ytd',
      period: { endDate: '2024-12-31', startDate: '2024-01-01' },
      portfolio: {
        currentNetWorth: 105000,
        currentValueInBaseCurrency: 100000,
        firstOrderDate: '2023-01-01',
        hasErrors: false,
        netPerformance: 5000,
        netPerformancePercentage: 5,
        netPerformancePercentageWithCurrencyEffect: 4.8,
        netPerformanceWithCurrencyEffect: 4800,
        totalInvestment: 95000
      }
    };

    it('should generate a horizontalBar chart', () => {
      const charts = service.extract([
        makeEntry('performance_compare', perfData)
      ]);

      expect(charts).toHaveLength(1);
      expect(charts[0].chartType).toBe('horizontalBar');
    });

    it('should include portfolio return as first item', () => {
      const charts = service.extract([
        makeEntry('performance_compare', perfData)
      ]);

      const items = (
        charts[0].data as { items: { name: string; value: number }[] }
      ).items;
      const portfolioItem = items.find((i) => i.name === 'Portfolio');

      expect(portfolioItem).toBeDefined();
      expect(portfolioItem!.value).toBe(5);
    });

    it('should include benchmark items', () => {
      const charts = service.extract([
        makeEntry('performance_compare', perfData)
      ]);

      const items = (
        charts[0].data as { items: { name: string; value: number }[] }
      ).items;

      expect(items.some((i) => i.name === 'S&P 500')).toBe(true);
    });

    it('should return [] when portfolio field is missing', () => {
      const charts = service.extract([
        makeEntry('performance_compare', { benchmarks: [], comparison: {} })
      ]);

      expect(charts).toEqual([]);
    });
  });

  // ─── get_transaction_history ──────────────────────────────────────────────

  describe('get_transaction_history', () => {
    const txData = {
      transactions: [
        {
          accountId: 'acc1',
          accountName: 'Main',
          currency: 'USD',
          dataSource: 'YAHOO',
          date: '2024-01-15T00:00:00Z',
          fee: 0,
          feeInBaseCurrency: 0,
          id: 'tx1',
          quantity: 10,
          symbol: 'AAPL',
          type: 'BUY',
          unitPrice: 180,
          value: 1800,
          valueInBaseCurrency: 1800
        }
      ]
    };

    it('should generate a table chart from transactions', () => {
      const charts = service.extract([
        makeEntry('get_transaction_history', txData)
      ]);

      expect(charts).toHaveLength(1);
      expect(charts[0].chartType).toBe('table');
    });

    it('should populate date, type, symbol, quantity, unitPrice columns', () => {
      const charts = service.extract([
        makeEntry('get_transaction_history', txData)
      ]);

      const tableData = charts[0].data as {
        columns: string[];
        rows: string[][];
      };
      const row = tableData.rows[0];

      expect(row[0]).toContain('2024-01-15');
      expect(row[1]).toBe('BUY');
      expect(row[2]).toBe('AAPL');
      expect(row[3]).toBe('10');
      expect(row[4]).toBe('180');
    });

    it('should return [] when transactions is empty', () => {
      const charts = service.extract([
        makeEntry('get_transaction_history', { transactions: [] })
      ]);

      expect(charts).toEqual([]);
    });
  });

  // ─── simulate_trades ──────────────────────────────────────────────────────

  describe('simulate_trades', () => {
    const simData = {
      hypotheticalPortfolio: {
        cashBalance: 1000,
        positions: [
          { allocationPct: 0.45, symbol: 'AAPL', valueInBaseCurrency: 4500 },
          { allocationPct: 0.55, symbol: 'MSFT', valueInBaseCurrency: 5500 }
        ],
        totalValueInBaseCurrency: 10000
      },
      portfolioBefore: {
        cashBalance: 1000,
        positions: [
          { allocationPct: 0.5, symbol: 'AAPL', valueInBaseCurrency: 5000 },
          { allocationPct: 0.5, symbol: 'MSFT', valueInBaseCurrency: 5000 }
        ],
        totalValueInBaseCurrency: 10000
      }
    };

    it('should generate before and after doughnut charts', () => {
      const charts = service.extract([makeEntry('simulate_trades', simData)]);

      expect(charts.length).toBe(2);
      expect(charts.every((c) => c.chartType === 'doughnut')).toBe(true);
    });

    it('should label charts as Current Allocation and Hypothetical Allocation', () => {
      const charts = service.extract([makeEntry('simulate_trades', simData)]);

      expect(charts[0].label).toBe('Current Allocation');
      expect(charts[1].label).toBe('Hypothetical Allocation');
    });

    it('should use allocationPct for doughnut values (as %)', () => {
      const charts = service.extract([makeEntry('simulate_trades', simData)]);

      const beforeItems = (
        charts[0].data as { items: { name: string; value: number }[] }
      ).items;

      // allocationPct 0.5 * 100 = 50
      expect(beforeItems[0].value).toBeCloseTo(50, 5);
    });
  });

  // ─── stress_test ──────────────────────────────────────────────────────────

  describe('stress_test', () => {
    const stressData = {
      assetClassImpacts: [
        {
          currentValueInBaseCurrency: 10000,
          lossPct: -35,
          name: 'EQUITY',
          stressedValueInBaseCurrency: 6500
        }
      ],
      positionImpacts: [
        {
          currentValueInBaseCurrency: 5000,
          lossInBaseCurrency: -1750,
          lossPct: -35,
          stressedValueInBaseCurrency: 3250,
          symbol: 'AAPL'
        }
      ],
      scenario: {
        description: '2008 crisis',
        id: 'market_crash_2008',
        name: '2008 Financial Crisis',
        shocks: []
      }
    };

    it('should generate position loss horizontalBar chart', () => {
      const charts = service.extract([makeEntry('stress_test', stressData)]);

      const posChart = charts.find((c) => c.label?.includes('Position Losses'));

      expect(posChart).toBeDefined();
      expect(posChart!.chartType).toBe('horizontalBar');
    });

    it('should generate asset class impact horizontalBar chart', () => {
      const charts = service.extract([makeEntry('stress_test', stressData)]);

      const acChart = charts.find((c) => c.label === 'Asset Class Impact (%)');

      expect(acChart).toBeDefined();
    });

    it('should use scenario name in position loss chart label', () => {
      const charts = service.extract([makeEntry('stress_test', stressData)]);

      const posChart = charts.find((c) => c.label?.includes('Position Losses'));

      expect(posChart!.label).toContain('2008 Financial Crisis');
    });

    it('should return [] when positionImpacts is empty', () => {
      const charts = service.extract([
        makeEntry('stress_test', {
          positionImpacts: [],
          assetClassImpacts: [],
          scenario: { name: 'Test', id: 'test', description: '', shocks: [] }
        })
      ]);

      expect(charts).toEqual([]);
    });
  });
});
