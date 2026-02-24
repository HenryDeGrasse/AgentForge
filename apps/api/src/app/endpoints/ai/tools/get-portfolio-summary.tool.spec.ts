import { GetPortfolioSummaryTool } from './get-portfolio-summary.tool';

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildTool({
  createdAt = new Date('2025-01-01T00:00:00.000Z') as Date | string,
  holdings = {} as Record<string, unknown>,
  activityDate = null as Date | string | null,
  activityCount = 0,
  totalValueInBaseCurrency = 0,
  cash = 0
} = {}) {
  return new GetPortfolioSummaryTool(
    {
      getDetails: jest.fn().mockResolvedValue({
        createdAt,
        holdings,
        summary: {
          activityCount,
          cash,
          totalValueInBaseCurrency
        }
      })
    } as any,
    {
      order: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: activityCount },
          _max: { date: activityDate }
        })
      }
    } as any,
    {
      user: jest.fn().mockResolvedValue({
        settings: { settings: { baseCurrency: 'USD' } }
      })
    } as any
  );
}

describe('GetPortfolioSummaryTool', () => {
  it('returns deterministic totals and top holdings sorted by value', async () => {
    const portfolioService = {
      getDetails: jest.fn().mockResolvedValue({
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        holdings: {
          AAPL: {
            assetClass: 'EQUITY',
            currency: 'USD',
            dataSource: 'YAHOO',
            marketPrice: 200,
            name: 'Apple',
            quantity: 3,
            symbol: 'AAPL',
            valueInBaseCurrency: 600
          },
          VOO: {
            assetClass: 'ETF',
            currency: 'USD',
            dataSource: 'YAHOO',
            marketPrice: 500,
            name: 'Vanguard S&P 500',
            quantity: 1,
            symbol: 'VOO',
            valueInBaseCurrency: 500
          },
          MSFT: {
            assetClass: 'EQUITY',
            currency: 'USD',
            dataSource: 'YAHOO',
            marketPrice: 300,
            name: 'Microsoft',
            quantity: 1,
            symbol: 'MSFT',
            valueInBaseCurrency: 300
          }
        },
        summary: {
          activityCount: 9,
          cash: 100,
          totalValueInBaseCurrency: 1500
        }
      })
    };

    const prismaService = {
      order: {
        aggregate: jest.fn().mockResolvedValue({
          _count: {
            _all: 9
          },
          _max: {
            date: new Date('2024-12-31T00:00:00.000Z')
          }
        })
      }
    };

    const userService = {
      user: jest.fn().mockResolvedValue({
        settings: {
          settings: {
            baseCurrency: 'USD'
          }
        }
      })
    };

    const getPortfolioSummaryTool = new GetPortfolioSummaryTool(
      portfolioService as any,
      prismaService as any,
      userService as any
    );

    const result = await getPortfolioSummaryTool.execute(
      {
        topN: 2
      },
      {
        userId: 'user-1'
      }
    );

    expect(result.baseCurrency).toBe('USD');
    expect(result.snapshotCreatedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(result.latestActivityDate).toBe('2024-12-31T00:00:00.000Z');

    expect(result.totals).toEqual({
      activityCount: 9,
      cashInBaseCurrency: 100,
      holdingsCount: 3,
      holdingsValueInBaseCurrency: 1400,
      totalPortfolioValueInBaseCurrency: 1500
    });

    expect(result.topHoldings).toHaveLength(2);
    expect(result.topHoldings.map(({ symbol }) => symbol)).toEqual([
      'AAPL',
      'VOO'
    ]);

    expect(result.topHoldings[0]).toMatchObject({
      allocationInHoldings: 600 / 1400,
      allocationInPortfolio: 600 / 1500,
      symbol: 'AAPL',
      valueInBaseCurrency: 600
    });

    expect(result.warnings).toEqual([
      {
        code: 'top_holdings_truncated',
        message: 'Top holdings are limited to 2 rows.'
      }
    ]);
  });

  it('enforces row safeguards by capping topN to 25', async () => {
    const holdings = Array.from({ length: 30 }).reduce(
      (response, _, index) => {
        const symbol = `SYM${index + 1}`;

        response[symbol] = {
          assetClass: 'EQUITY',
          currency: 'USD',
          dataSource: 'YAHOO',
          marketPrice: 100,
          name: symbol,
          quantity: 1,
          symbol,
          valueInBaseCurrency: 100 - index
        };

        return response;
      },
      {} as Record<string, Record<string, unknown>>
    );

    const getPortfolioSummaryTool = new GetPortfolioSummaryTool(
      {
        getDetails: jest.fn().mockResolvedValue({
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          holdings,
          summary: {
            activityCount: 30,
            cash: 0,
            totalValueInBaseCurrency: 3000
          }
        })
      } as any,
      {
        order: {
          aggregate: jest.fn().mockResolvedValue({
            _count: {
              _all: 30
            },
            _max: {
              date: new Date('2024-12-31T00:00:00.000Z')
            }
          })
        }
      } as any,
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

    const result = await getPortfolioSummaryTool.execute(
      {
        topN: 999
      },
      {
        userId: 'user-1'
      }
    );

    expect(result.topHoldings).toHaveLength(25);
    expect(result.warnings).toEqual([
      {
        code: 'top_holdings_truncated',
        message: 'Top holdings are limited to 25 rows.'
      }
    ]);
  });

  it('emits warnings when holdings or activity timestamps are missing', async () => {
    const getPortfolioSummaryTool = new GetPortfolioSummaryTool(
      {
        getDetails: jest.fn().mockResolvedValue({
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          holdings: {},
          summary: {
            activityCount: 0,
            cash: 0,
            totalValueInBaseCurrency: 0
          }
        })
      } as any,
      {
        order: {
          aggregate: jest.fn().mockResolvedValue({
            _count: {
              _all: 0
            },
            _max: {
              date: null
            }
          })
        }
      } as any,
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

    const result = await getPortfolioSummaryTool.execute(
      {},
      {
        userId: 'user-1'
      }
    );

    expect(result.topHoldings).toEqual([]);
    expect(result.latestActivityDate).toBe('');

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'no_holdings_data',
          message: 'No holdings were found for this user.'
        },
        {
          code: 'no_activity_history',
          message: 'No activity timestamps were found for this user.'
        },
        {
          code: 'non_positive_portfolio_total',
          message: 'The total portfolio value is zero or negative.'
        }
      ])
    );
  });

  // ─── Regression: createdAt / date fields returned as strings ─────────────
  // The portfolioCalculator.getSnapshot() returns createdAt as a string in
  // many code paths (cached snapshots, serialized DB rows). Calling
  // .toISOString() on a string throws "toISOString is not a function", which
  // causes the ToolRegistry to return an error envelope and the AI to reply
  // "I cannot access your portfolio summary due to a technical issue."

  it('does not throw when createdAt is already an ISO string (regression)', async () => {
    const tool = buildTool({
      createdAt: '2025-06-01T12:00:00.000Z',
      activityDate: '2025-05-31T00:00:00.000Z',
      activityCount: 3,
      totalValueInBaseCurrency: 1000
    });

    await expect(tool.execute({}, { userId: 'u1' })).resolves.toMatchObject({
      snapshotCreatedAt: '2025-06-01T12:00:00.000Z',
      latestActivityDate: '2025-05-31T00:00:00.000Z'
    });
  });

  it('does not throw when createdAt is a Date object (original contract)', async () => {
    const tool = buildTool({
      createdAt: new Date('2025-06-01T12:00:00.000Z'),
      activityDate: new Date('2025-05-31T00:00:00.000Z'),
      activityCount: 2,
      totalValueInBaseCurrency: 500
    });

    await expect(tool.execute({}, { userId: 'u1' })).resolves.toMatchObject({
      snapshotCreatedAt: '2025-06-01T12:00:00.000Z',
      latestActivityDate: '2025-05-31T00:00:00.000Z'
    });
  });

  it('returns empty strings for dates when createdAt is null/falsy', async () => {
    // Pass null explicitly — undefined hits the default param, but the real
    // runtime can produce null from the DB layer.
    const tool = new GetPortfolioSummaryTool(
      {
        getDetails: jest.fn().mockResolvedValue({
          createdAt: null,
          holdings: {},
          summary: { activityCount: 0, cash: 0, totalValueInBaseCurrency: 0 }
        })
      } as any,
      {
        order: {
          aggregate: jest.fn().mockResolvedValue({
            _count: { _all: 0 },
            _max: { date: null }
          })
        }
      } as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: { settings: { baseCurrency: 'USD' } }
        })
      } as any
    );

    const result = await tool.execute({}, { userId: 'u1' });

    expect(result.snapshotCreatedAt).toBe('');
    expect(result.latestActivityDate).toBe('');
  });

  it('returns holdings summary correctly when createdAt is a string', async () => {
    const tool = buildTool({
      createdAt: '2025-01-01T00:00:00.000Z',
      holdings: {
        AAPL: {
          assetClass: 'EQUITY',
          currency: 'USD',
          dataSource: 'YAHOO',
          marketPrice: 200,
          name: 'Apple',
          quantity: 5,
          symbol: 'AAPL',
          valueInBaseCurrency: 1000
        }
      },
      activityCount: 5,
      totalValueInBaseCurrency: 1000,
      activityDate: '2025-01-15T00:00:00.000Z'
    });

    const result = await tool.execute({ topN: 5 }, { userId: 'u1' });

    expect(result.totals.holdingsCount).toBe(1);
    expect(result.totals.holdingsValueInBaseCurrency).toBe(1000);
    expect(result.topHoldings[0].symbol).toBe('AAPL');
    expect(result.warnings).toEqual([]);
  });
});
