import { PerformanceCompareTool } from './performance-compare.tool';

describe('PerformanceCompareTool', () => {
  it('returns portfolio vs benchmark comparison for selected date range', async () => {
    const benchmarkService = {
      getBenchmarkTrends: jest.fn().mockResolvedValue({
        trend200d: 'UP',
        trend50d: 'DOWN'
      }),
      getBenchmarks: jest.fn().mockResolvedValue([
        {
          dataSource: 'YAHOO',
          marketCondition: 'BEAR_MARKET',
          name: 'Vanguard S&P 500 ETF',
          performances: {
            allTimeHigh: {
              date: new Date('2025-01-10T00:00:00.000Z'),
              performancePercent: -0.08
            }
          },
          symbol: 'VOO',
          trend200d: 'NEUTRAL',
          trend50d: 'UP'
        },
        {
          dataSource: 'YAHOO',
          marketCondition: 'NEUTRAL_MARKET',
          name: 'Invesco QQQ Trust',
          performances: {
            allTimeHigh: {
              date: new Date('2025-01-15T00:00:00.000Z'),
              performancePercent: 0.15
            }
          },
          symbol: 'QQQ',
          trend200d: 'DOWN',
          trend50d: 'DOWN'
        }
      ])
    };

    const performanceCompareTool = new PerformanceCompareTool(
      {
        getPerformance: jest.fn().mockResolvedValue({
          firstOrderDate: new Date('2023-05-01T00:00:00.000Z'),
          hasErrors: false,
          performance: {
            currentNetWorth: 102000,
            currentValueInBaseCurrency: 100000,
            netPerformance: 12000,
            netPerformancePercentage: 0.12,
            netPerformancePercentageWithCurrencyEffect: 0.11,
            netPerformanceWithCurrencyEffect: 11000,
            totalInvestment: 88000
          }
        })
      } as any,
      benchmarkService as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: {
            settings: {
              baseCurrency: 'USD'
            }
          }
        })
      } as any
    );

    const result = await performanceCompareTool.execute(
      {
        benchmarkSymbols: ['VOO'],
        dateRange: 'ytd'
      },
      { userId: 'user-1' }
    );

    expect(result.baseCurrency).toBe('USD');
    expect(result.dateRange).toBe('ytd');
    expect(result.portfolio).toMatchObject({
      currentNetWorth: 102000,
      currentValueInBaseCurrency: 100000,
      firstOrderDate: '2023-05-01T00:00:00.000Z',
      hasErrors: false,
      netPerformance: 12000,
      netPerformancePercentage: 0.12,
      netPerformancePercentageWithCurrencyEffect: 0.11,
      netPerformanceWithCurrencyEffect: 11000,
      totalInvestment: 88000
    });

    expect(result.benchmarks).toEqual([
      {
        dataSource: 'YAHOO',
        marketCondition: 'BEAR_MARKET',
        name: 'Vanguard S&P 500 ETF',
        performances: {
          allTimeHigh: {
            date: '2025-01-10T00:00:00.000Z',
            performancePercent: -0.08
          }
        },
        symbol: 'VOO',
        trend200d: 'UP',
        trend50d: 'DOWN'
      }
    ]);

    expect(result.comparison).toEqual({
      outperformingBenchmarks: ['VOO'],
      underperformingBenchmarks: []
    });

    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.assumptions[0]).toContain(
      'Benchmark comparison uses all-time-high drawdown as benchmark metric, not period return.'
    );
    expect(result.warnings).toEqual([]);
  });

  it('normalizes nullable dates to empty strings for schema-safe output', async () => {
    const performanceCompareTool = new PerformanceCompareTool(
      {
        getPerformance: jest.fn().mockResolvedValue({
          firstOrderDate: null,
          hasErrors: false,
          performance: {
            currentNetWorth: 1000,
            currentValueInBaseCurrency: 1000,
            netPerformance: 10,
            netPerformancePercentage: 0.01,
            netPerformancePercentageWithCurrencyEffect: 0.01,
            netPerformanceWithCurrencyEffect: 10,
            totalInvestment: 990
          }
        })
      } as any,
      {
        getBenchmarkTrends: jest.fn().mockResolvedValue({
          trend200d: 'UP',
          trend50d: 'UP'
        }),
        getBenchmarks: jest.fn().mockResolvedValue([
          {
            dataSource: 'YAHOO',
            marketCondition: 'NEUTRAL_MARKET',
            name: 'SPY',
            performances: {
              allTimeHigh: {
                date: null,
                performancePercent: -0.02
              }
            },
            symbol: 'SPY',
            trend200d: 'UP',
            trend50d: 'UP'
          }
        ])
      } as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: { settings: { baseCurrency: 'USD' } }
        })
      } as any
    );

    const result = await performanceCompareTool.execute({}, { userId: 'u1' });

    expect(result.portfolio.firstOrderDate).toBe('');
    expect(result.benchmarks[0].performances.allTimeHigh.date).toBe('');
  });

  it('warns when benchmark list is empty', async () => {
    const performanceCompareTool = new PerformanceCompareTool(
      {
        getPerformance: jest.fn().mockResolvedValue({
          firstOrderDate: null,
          hasErrors: false,
          performance: {
            currentNetWorth: 0,
            currentValueInBaseCurrency: 1000,
            netPerformance: 0,
            netPerformancePercentage: 0,
            netPerformancePercentageWithCurrencyEffect: 0,
            netPerformanceWithCurrencyEffect: 0,
            totalInvestment: 1000
          }
        })
      } as any,
      {
        getBenchmarkTrends: jest.fn(),
        getBenchmarks: jest.fn().mockResolvedValue([])
      } as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: { settings: { baseCurrency: 'USD' } }
        })
      } as any
    );

    const result = await performanceCompareTool.execute({}, { userId: 'u1' });

    expect(result.benchmarks).toEqual([]);
    expect(result.portfolio.firstOrderDate).toBe('');
    expect(result.warnings).toEqual([
      {
        code: 'no_benchmark_data',
        message: 'No benchmark data is configured or available.'
      }
    ]);
  });

  it('warns when benchmark filter has no matches', async () => {
    const performanceCompareTool = new PerformanceCompareTool(
      {
        getPerformance: jest.fn().mockResolvedValue({
          firstOrderDate: null,
          hasErrors: false,
          performance: {
            currentNetWorth: 0,
            currentValueInBaseCurrency: 1000,
            netPerformance: 0,
            netPerformancePercentage: 0,
            netPerformancePercentageWithCurrencyEffect: 0,
            netPerformanceWithCurrencyEffect: 0,
            totalInvestment: 1000
          }
        })
      } as any,
      {
        getBenchmarkTrends: jest.fn(),
        getBenchmarks: jest.fn().mockResolvedValue([
          {
            dataSource: 'YAHOO',
            marketCondition: 'NEUTRAL_MARKET',
            name: 'SPY',
            performances: {
              allTimeHigh: {
                date: new Date('2025-01-10T00:00:00.000Z'),
                performancePercent: -0.02
              }
            },
            symbol: 'SPY',
            trend200d: 'UP',
            trend50d: 'UP'
          }
        ])
      } as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: { settings: { baseCurrency: 'USD' } }
        })
      } as any
    );

    const result = await performanceCompareTool.execute(
      {
        benchmarkSymbols: ['VOO']
      },
      { userId: 'u1' }
    );

    expect(result.benchmarks).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'benchmark_filter_no_matches',
          message:
            'No configured benchmarks matched the requested benchmarkSymbols.'
        },
        {
          code: 'no_benchmark_data',
          message: 'No benchmark data is configured or available.'
        }
      ])
    );
  });

  it('warns when portfolio is empty', async () => {
    const performanceCompareTool = new PerformanceCompareTool(
      {
        getPerformance: jest.fn().mockResolvedValue({
          firstOrderDate: null,
          hasErrors: false,
          performance: {
            currentNetWorth: 0,
            currentValueInBaseCurrency: 0,
            netPerformance: 0,
            netPerformancePercentage: 0,
            netPerformancePercentageWithCurrencyEffect: 0,
            netPerformanceWithCurrencyEffect: 0,
            totalInvestment: 0
          }
        })
      } as any,
      {
        getBenchmarkTrends: jest.fn(),
        getBenchmarks: jest.fn().mockResolvedValue([])
      } as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: { settings: { baseCurrency: 'USD' } }
        })
      } as any
    );

    const result = await performanceCompareTool.execute({}, { userId: 'u1' });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'empty_portfolio',
          message: 'Portfolio has no investment data for the selected range.'
        }
      ])
    );
  });

  it('warns when portfolio calculator reports errors', async () => {
    const performanceCompareTool = new PerformanceCompareTool(
      {
        getPerformance: jest.fn().mockResolvedValue({
          firstOrderDate: new Date('2025-01-01T00:00:00.000Z'),
          hasErrors: true,
          performance: {
            currentNetWorth: 100,
            currentValueInBaseCurrency: 100,
            netPerformance: 0,
            netPerformancePercentage: 0,
            netPerformancePercentageWithCurrencyEffect: 0,
            netPerformanceWithCurrencyEffect: 0,
            totalInvestment: 100
          }
        })
      } as any,
      {
        getBenchmarkTrends: jest.fn().mockResolvedValue({
          trend200d: 'UP',
          trend50d: 'UP'
        }),
        getBenchmarks: jest.fn().mockResolvedValue([
          {
            dataSource: 'YAHOO',
            marketCondition: 'NEUTRAL_MARKET',
            name: 'SPY',
            performances: {
              allTimeHigh: {
                date: new Date('2025-01-10T00:00:00.000Z'),
                performancePercent: -0.02
              }
            },
            symbol: 'SPY',
            trend200d: 'UP',
            trend50d: 'UP'
          }
        ])
      } as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: { settings: { baseCurrency: 'USD' } }
        })
      } as any
    );

    const result = await performanceCompareTool.execute({}, { userId: 'u1' });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'calculation_errors',
          message:
            'Portfolio performance calculation reported internal errors; values may be incomplete.'
        }
      ])
    );
  });
});
