import { PerformanceCompareTool } from './performance-compare.tool';

/**
 * Helper: builds a minimal PerformanceCompareTool with the given mocks.
 * Reduces boilerplate across tests.
 */
function buildTool({
  benchmarkService,
  marketDataService,
  portfolioService,
  userService
}: {
  benchmarkService: any;
  marketDataService?: any;
  portfolioService: any;
  userService?: any;
}) {
  return new PerformanceCompareTool(
    portfolioService,
    benchmarkService,
    marketDataService ?? { getRange: jest.fn().mockResolvedValue([]) },
    userService ?? {
      user: jest.fn().mockResolvedValue({
        settings: { settings: { baseCurrency: 'USD' } }
      })
    }
  );
}

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
      { getRange: jest.fn().mockResolvedValue([]) } as any,
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
    // No market data provided → ATH fallback is used → unavailable warning
    expect(result.warnings).toEqual([
      {
        code: 'benchmark_period_return_unavailable',
        message:
          'Period return data unavailable for VOO; comparison uses ATH drawdown as a proxy (less reliable).'
      }
    ]);
  });

  it('classifies negative portfolio return as underperforming even if benchmark ATH metric is lower', async () => {
    const performanceCompareTool = new PerformanceCompareTool(
      {
        getPerformance: jest.fn().mockResolvedValue({
          firstOrderDate: new Date('2023-05-01T00:00:00.000Z'),
          hasErrors: false,
          performance: {
            currentNetWorth: 950,
            currentValueInBaseCurrency: 1000,
            netPerformance: -50,
            netPerformancePercentage: -0.05,
            netPerformancePercentageWithCurrencyEffect: -0.05,
            netPerformanceWithCurrencyEffect: -50,
            totalInvestment: 1000
          }
        })
      } as any,
      {
        getBenchmarkTrends: jest.fn().mockResolvedValue({
          trend200d: 'DOWN',
          trend50d: 'DOWN'
        }),
        getBenchmarks: jest.fn().mockResolvedValue([
          {
            dataSource: 'YAHOO',
            marketCondition: 'BEAR_MARKET',
            name: 'VOO',
            performances: {
              allTimeHigh: {
                date: new Date('2025-01-10T00:00:00.000Z'),
                performancePercent: -0.08
              }
            },
            symbol: 'VOO',
            trend200d: 'DOWN',
            trend50d: 'DOWN'
          }
        ])
      } as any,
      { getRange: jest.fn().mockResolvedValue([]) } as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: { settings: { baseCurrency: 'USD' } }
        })
      } as any
    );

    const result = await performanceCompareTool.execute({}, { userId: 'u1' });

    expect(result.comparison).toEqual({
      outperformingBenchmarks: [],
      underperformingBenchmarks: ['VOO']
    });
  });

  it('classifies zero portfolio return as underperforming (requires strictly positive return)', async () => {
    const performanceCompareTool = new PerformanceCompareTool(
      {
        getPerformance: jest.fn().mockResolvedValue({
          firstOrderDate: new Date('2023-05-01T00:00:00.000Z'),
          hasErrors: false,
          performance: {
            currentNetWorth: 1000,
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
        getBenchmarkTrends: jest.fn().mockResolvedValue({
          trend200d: 'DOWN',
          trend50d: 'DOWN'
        }),
        getBenchmarks: jest.fn().mockResolvedValue([
          {
            dataSource: 'YAHOO',
            marketCondition: 'BEAR_MARKET',
            name: 'VOO',
            performances: {
              allTimeHigh: {
                date: new Date('2025-01-10T00:00:00.000Z'),
                performancePercent: -0.01
              }
            },
            symbol: 'VOO',
            trend200d: 'DOWN',
            trend50d: 'DOWN'
          }
        ])
      } as any,
      { getRange: jest.fn().mockResolvedValue([]) } as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: { settings: { baseCurrency: 'USD' } }
        })
      } as any
    );

    const result = await performanceCompareTool.execute({}, { userId: 'u1' });

    expect(result.comparison).toEqual({
      outperformingBenchmarks: [],
      underperformingBenchmarks: ['VOO']
    });
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
      { getRange: jest.fn().mockResolvedValue([]) } as any,
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
      { getRange: jest.fn().mockResolvedValue([]) } as any,
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
      { getRange: jest.fn().mockResolvedValue([]) } as any,
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
      { getRange: jest.fn().mockResolvedValue([]) } as any,
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
      { getRange: jest.fn().mockResolvedValue([]) } as any,
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

  // ─── WS-3: Period return comparison ─────────────────────────────────────

  describe('period return comparison (WS-3)', () => {
    it('uses period return for outperformance classification when market data is available', async () => {
      const tool = buildTool({
        portfolioService: {
          getPerformance: jest.fn().mockResolvedValue({
            firstOrderDate: new Date('2024-01-01T00:00:00.000Z'),
            hasErrors: false,
            performance: {
              currentNetWorth: 11000,
              currentValueInBaseCurrency: 11000,
              netPerformance: 1000,
              netPerformancePercentage: 0.1, // +10%
              netPerformancePercentageWithCurrencyEffect: 0.1,
              netPerformanceWithCurrencyEffect: 1000,
              totalInvestment: 10000
            }
          })
        },
        benchmarkService: {
          getBenchmarkTrends: jest.fn().mockResolvedValue({
            trend200d: 'UP',
            trend50d: 'UP'
          }),
          getBenchmarks: jest.fn().mockResolvedValue([
            {
              dataSource: 'YAHOO',
              marketCondition: 'ALL_TIME_HIGH',
              name: 'VOO',
              performances: {
                allTimeHigh: {
                  date: new Date('2025-01-10T00:00:00.000Z'),
                  performancePercent: 0
                }
              },
              symbol: 'VOO',
              trend200d: 'UP',
              trend50d: 'UP'
            }
          ])
        },
        // Market data: benchmark went from 100 to 115 → +15% period return
        // Portfolio is at +10%, so it should be underperforming
        marketDataService: {
          getRange: jest.fn().mockResolvedValue([
            {
              dataSource: 'YAHOO',
              symbol: 'VOO',
              date: new Date('2025-01-01'),
              marketPrice: 100
            },
            {
              dataSource: 'YAHOO',
              symbol: 'VOO',
              date: new Date('2025-02-27'),
              marketPrice: 115
            }
          ])
        }
      });

      const result = await tool.execute({ dateRange: 'ytd' }, { userId: 'u1' });

      // With period return: portfolio +10% vs benchmark +15% → underperforming
      expect(result.comparison.underperformingBenchmarks).toContain('VOO');
      expect(result.comparison.outperformingBenchmarks).not.toContain('VOO');

      // Period return should be in the output
      expect(result.benchmarks[0].performances.periodReturn).toBeDefined();
      expect(
        result.benchmarks[0].performances.periodReturn.periodReturnPct
      ).toBeCloseTo(0.15, 4);
      expect(result.benchmarks[0].performances.periodReturn.dataPoints).toBe(2);
    });

    it('classifies portfolio as outperforming when period return is lower than portfolio return', async () => {
      const tool = buildTool({
        portfolioService: {
          getPerformance: jest.fn().mockResolvedValue({
            firstOrderDate: new Date('2024-01-01T00:00:00.000Z'),
            hasErrors: false,
            performance: {
              currentNetWorth: 12000,
              currentValueInBaseCurrency: 12000,
              netPerformance: 2000,
              netPerformancePercentage: 0.2, // +20%
              netPerformancePercentageWithCurrencyEffect: 0.2,
              netPerformanceWithCurrencyEffect: 2000,
              totalInvestment: 10000
            }
          })
        },
        benchmarkService: {
          getBenchmarkTrends: jest.fn().mockResolvedValue({
            trend200d: 'UP',
            trend50d: 'UP'
          }),
          getBenchmarks: jest.fn().mockResolvedValue([
            {
              dataSource: 'YAHOO',
              marketCondition: 'ALL_TIME_HIGH',
              name: 'VOO',
              performances: {
                allTimeHigh: {
                  date: new Date('2025-01-10T00:00:00.000Z'),
                  performancePercent: 0
                }
              },
              symbol: 'VOO',
              trend200d: 'UP',
              trend50d: 'UP'
            }
          ])
        },
        // Benchmark: 100 → 108 = +8%. Portfolio at +20% → outperforming
        marketDataService: {
          getRange: jest.fn().mockResolvedValue([
            {
              dataSource: 'YAHOO',
              symbol: 'VOO',
              date: new Date('2025-01-01'),
              marketPrice: 100
            },
            {
              dataSource: 'YAHOO',
              symbol: 'VOO',
              date: new Date('2025-02-27'),
              marketPrice: 108
            }
          ])
        }
      });

      const result = await tool.execute({ dateRange: 'ytd' }, { userId: 'u1' });

      expect(result.comparison.outperformingBenchmarks).toContain('VOO');
      expect(result.comparison.underperformingBenchmarks).not.toContain('VOO');
    });

    it('falls back to ATH comparison with warning when market data has fewer than 2 data points', async () => {
      const tool = buildTool({
        portfolioService: {
          getPerformance: jest.fn().mockResolvedValue({
            firstOrderDate: new Date('2024-01-01T00:00:00.000Z'),
            hasErrors: false,
            performance: {
              currentNetWorth: 10500,
              currentValueInBaseCurrency: 10500,
              netPerformance: 500,
              netPerformancePercentage: 0.05, // +5%
              netPerformancePercentageWithCurrencyEffect: 0.05,
              netPerformanceWithCurrencyEffect: 500,
              totalInvestment: 10000
            }
          })
        },
        benchmarkService: {
          getBenchmarkTrends: jest.fn().mockResolvedValue({
            trend200d: 'UP',
            trend50d: 'UP'
          }),
          getBenchmarks: jest.fn().mockResolvedValue([
            {
              dataSource: 'YAHOO',
              marketCondition: 'BEAR_MARKET',
              name: 'VOO',
              performances: {
                allTimeHigh: {
                  date: new Date('2025-01-10T00:00:00.000Z'),
                  performancePercent: -0.08
                }
              },
              symbol: 'VOO',
              trend200d: 'UP',
              trend50d: 'UP'
            }
          ])
        },
        // Only 1 data point — insufficient for period return
        marketDataService: {
          getRange: jest.fn().mockResolvedValue([
            {
              dataSource: 'YAHOO',
              symbol: 'VOO',
              date: new Date('2025-02-27'),
              marketPrice: 400
            }
          ])
        }
      });

      const result = await tool.execute({ dateRange: 'ytd' }, { userId: 'u1' });

      // Should fall back to ATH logic
      expect(result.benchmarks[0].performances.periodReturn).toBeUndefined();
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'benchmark_period_return_unavailable'
          })
        ])
      );

      // ATH fallback: portfolio +5% > benchmark ATH -8% AND portfolio is positive → outperforming
      expect(result.comparison.outperformingBenchmarks).toContain('VOO');
    });

    it('falls back to ATH comparison when market data returns empty array', async () => {
      const tool = buildTool({
        portfolioService: {
          getPerformance: jest.fn().mockResolvedValue({
            firstOrderDate: new Date('2024-01-01T00:00:00.000Z'),
            hasErrors: false,
            performance: {
              currentNetWorth: 10500,
              currentValueInBaseCurrency: 10500,
              netPerformance: 500,
              netPerformancePercentage: 0.05,
              netPerformancePercentageWithCurrencyEffect: 0.05,
              netPerformanceWithCurrencyEffect: 500,
              totalInvestment: 10000
            }
          })
        },
        benchmarkService: {
          getBenchmarkTrends: jest.fn().mockResolvedValue({
            trend200d: 'UP',
            trend50d: 'UP'
          }),
          getBenchmarks: jest.fn().mockResolvedValue([
            {
              dataSource: 'YAHOO',
              marketCondition: 'ALL_TIME_HIGH',
              name: 'VOO',
              performances: {
                allTimeHigh: {
                  date: new Date('2025-01-10T00:00:00.000Z'),
                  performancePercent: -0.01
                }
              },
              symbol: 'VOO',
              trend200d: 'UP',
              trend50d: 'UP'
            }
          ])
        },
        marketDataService: {
          getRange: jest.fn().mockResolvedValue([])
        }
      });

      const result = await tool.execute({ dateRange: 'ytd' }, { userId: 'u1' });

      expect(result.benchmarks[0].performances.periodReturn).toBeUndefined();
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'benchmark_period_return_unavailable'
          })
        ])
      );
    });

    it('falls back to ATH comparison when first market data price is zero', async () => {
      const tool = buildTool({
        portfolioService: {
          getPerformance: jest.fn().mockResolvedValue({
            firstOrderDate: new Date('2024-01-01T00:00:00.000Z'),
            hasErrors: false,
            performance: {
              currentNetWorth: 10500,
              currentValueInBaseCurrency: 10500,
              netPerformance: 500,
              netPerformancePercentage: 0.05,
              netPerformancePercentageWithCurrencyEffect: 0.05,
              netPerformanceWithCurrencyEffect: 500,
              totalInvestment: 10000
            }
          })
        },
        benchmarkService: {
          getBenchmarkTrends: jest.fn().mockResolvedValue({
            trend200d: 'UP',
            trend50d: 'UP'
          }),
          getBenchmarks: jest.fn().mockResolvedValue([
            {
              dataSource: 'YAHOO',
              marketCondition: 'ALL_TIME_HIGH',
              name: 'VOO',
              performances: {
                allTimeHigh: {
                  date: new Date('2025-01-10T00:00:00.000Z'),
                  performancePercent: -0.01
                }
              },
              symbol: 'VOO',
              trend200d: 'UP',
              trend50d: 'UP'
            }
          ])
        },
        marketDataService: {
          getRange: jest.fn().mockResolvedValue([
            {
              dataSource: 'YAHOO',
              symbol: 'VOO',
              date: new Date('2025-01-01'),
              marketPrice: 0
            },
            {
              dataSource: 'YAHOO',
              symbol: 'VOO',
              date: new Date('2025-02-27'),
              marketPrice: 400
            }
          ])
        }
      });

      const result = await tool.execute({ dateRange: 'ytd' }, { userId: 'u1' });

      expect(result.benchmarks[0].performances.periodReturn).toBeUndefined();
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'benchmark_period_return_unavailable'
          })
        ])
      );
    });

    it('updates assumptions text when period return is used', async () => {
      const tool = buildTool({
        portfolioService: {
          getPerformance: jest.fn().mockResolvedValue({
            firstOrderDate: new Date('2024-01-01T00:00:00.000Z'),
            hasErrors: false,
            performance: {
              currentNetWorth: 11000,
              currentValueInBaseCurrency: 11000,
              netPerformance: 1000,
              netPerformancePercentage: 0.1,
              netPerformancePercentageWithCurrencyEffect: 0.1,
              netPerformanceWithCurrencyEffect: 1000,
              totalInvestment: 10000
            }
          })
        },
        benchmarkService: {
          getBenchmarkTrends: jest.fn().mockResolvedValue({
            trend200d: 'UP',
            trend50d: 'UP'
          }),
          getBenchmarks: jest.fn().mockResolvedValue([
            {
              dataSource: 'YAHOO',
              marketCondition: 'ALL_TIME_HIGH',
              name: 'VOO',
              performances: {
                allTimeHigh: {
                  date: new Date('2025-01-10T00:00:00.000Z'),
                  performancePercent: 0
                }
              },
              symbol: 'VOO',
              trend200d: 'UP',
              trend50d: 'UP'
            }
          ])
        },
        marketDataService: {
          getRange: jest.fn().mockResolvedValue([
            {
              dataSource: 'YAHOO',
              symbol: 'VOO',
              date: new Date('2025-01-01'),
              marketPrice: 100
            },
            {
              dataSource: 'YAHOO',
              symbol: 'VOO',
              date: new Date('2025-02-27'),
              marketPrice: 108
            }
          ])
        }
      });

      const result = await tool.execute({ dateRange: 'ytd' }, { userId: 'u1' });

      expect(result.assumptions[0]).toContain('period return');
      expect(result.assumptions[0]).not.toContain(
        'all-time-high drawdown as benchmark metric'
      );
    });
  });
});
