import { TaxEstimateTool } from './tax-estimate.tool';

describe('TaxEstimateTool', () => {
  it('computes short-term and long-term realized gains via FIFO', async () => {
    const taxEstimateTool = new TaxEstimateTool(
      {
        getOrders: jest.fn().mockResolvedValue({
          activities: [
            {
              SymbolProfile: {
                dataSource: 'YAHOO',
                name: 'Apple',
                symbol: 'AAPL'
              },
              date: new Date('2023-01-01T00:00:00.000Z'),
              feeInBaseCurrency: 0,
              quantity: 10,
              type: 'BUY',
              valueInBaseCurrency: 1000
            },
            {
              SymbolProfile: {
                dataSource: 'YAHOO',
                name: 'Apple',
                symbol: 'AAPL'
              },
              date: new Date('2024-12-01T00:00:00.000Z'),
              feeInBaseCurrency: 0,
              quantity: 10,
              type: 'BUY',
              valueInBaseCurrency: 500
            },
            {
              SymbolProfile: {
                dataSource: 'YAHOO',
                name: 'Apple',
                symbol: 'AAPL'
              },
              date: new Date('2025-02-01T00:00:00.000Z'),
              feeInBaseCurrency: 0,
              quantity: 10,
              type: 'SELL',
              valueInBaseCurrency: 1200
            },
            {
              SymbolProfile: {
                dataSource: 'YAHOO',
                name: 'Apple',
                symbol: 'AAPL'
              },
              date: new Date('2025-03-01T00:00:00.000Z'),
              feeInBaseCurrency: 0,
              quantity: 5,
              type: 'SELL',
              valueInBaseCurrency: 200
            }
          ],
          count: 4
        })
      } as any,
      {
        getDetails: jest.fn().mockResolvedValue({
          holdings: {},
          summary: {
            totalValueInBaseCurrency: 0
          }
        })
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

    const result = await taxEstimateTool.execute(
      {
        jurisdiction: 'US',
        taxYear: 2025
      },
      { userId: 'user-1' }
    );

    expect(result.realizedGains.shortTerm).toEqual({
      gainInBaseCurrency: 0,
      lossInBaseCurrency: 50,
      netInBaseCurrency: -50,
      transactionCount: 1
    });

    expect(result.realizedGains.longTerm).toEqual({
      gainInBaseCurrency: 200,
      lossInBaseCurrency: 0,
      netInBaseCurrency: 200,
      transactionCount: 1
    });

    expect(result.realizedGains.total).toEqual({
      gainInBaseCurrency: 200,
      lossInBaseCurrency: 50,
      netInBaseCurrency: 150,
      transactionCount: 2
    });

    expect(result.warnings).toEqual([]);
  });

  it('returns TLH candidates when no sells occurred in tax year', async () => {
    const taxEstimateTool = new TaxEstimateTool(
      {
        getOrders: jest.fn().mockResolvedValue({
          activities: [
            {
              SymbolProfile: {
                dataSource: 'YAHOO',
                name: 'MSFT',
                symbol: 'MSFT'
              },
              date: new Date('2025-01-05T00:00:00.000Z'),
              feeInBaseCurrency: 0,
              quantity: 5,
              type: 'BUY',
              valueInBaseCurrency: 1000
            }
          ],
          count: 1
        })
      } as any,
      {
        getDetails: jest.fn().mockResolvedValue({
          holdings: {
            MSFT: {
              dateOfFirstActivity: new Date('2024-01-01T00:00:00.000Z'),
              name: 'Microsoft',
              netPerformanceWithCurrencyEffect: -200,
              symbol: 'MSFT',
              valueInBaseCurrency: 800
            }
          }
        })
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

    const result = await taxEstimateTool.execute(
      {
        jurisdiction: 'US',
        taxYear: 2025
      },
      { userId: 'user-1' }
    );

    expect(result.realizedGains.total).toEqual({
      gainInBaseCurrency: 0,
      lossInBaseCurrency: 0,
      netInBaseCurrency: 0,
      transactionCount: 0
    });

    expect(result.taxLossHarvestingCandidates).toEqual([
      {
        costBasisInBaseCurrency: 1000,
        currentValueInBaseCurrency: 800,
        holdingPeriodDays: expect.any(Number),
        isLongTerm: true,
        name: 'Microsoft',
        symbol: 'MSFT',
        unrealizedLossInBaseCurrency: -200
      }
    ]);
  });

  it('warns when cost basis cannot be reconstructed', async () => {
    const taxEstimateTool = new TaxEstimateTool(
      {
        getOrders: jest.fn().mockResolvedValue({
          activities: [
            {
              SymbolProfile: {
                dataSource: 'YAHOO',
                name: 'Tesla',
                symbol: 'TSLA'
              },
              date: new Date('2025-04-01T00:00:00.000Z'),
              feeInBaseCurrency: 0,
              quantity: 5,
              type: 'SELL',
              valueInBaseCurrency: 500
            }
          ],
          count: 1
        })
      } as any,
      {
        getDetails: jest.fn().mockResolvedValue({
          holdings: {}
        })
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

    const result = await taxEstimateTool.execute(
      {
        jurisdiction: 'US',
        taxYear: 2025
      },
      { userId: 'user-1' }
    );

    expect(result.realizedGains.total.transactionCount).toBe(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'missing_cost_basis',
          message:
            'Insufficient BUY history to match at least one SELL transaction via FIFO.'
        }
      ])
    );
  });

  it('adds warning when jurisdiction is not provided', async () => {
    const taxEstimateTool = new TaxEstimateTool(
      {
        getOrders: jest.fn().mockResolvedValue({ activities: [], count: 0 })
      } as any,
      {
        getDetails: jest.fn().mockResolvedValue({ holdings: {} })
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

    const result = await taxEstimateTool.execute(
      {
        taxYear: 2025
      },
      { userId: 'user-1' }
    );

    expect(result.jurisdiction).toBe('GENERIC');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'no_jurisdiction_provided',
          message:
            'No jurisdiction was provided; tax estimate is generic and may omit local rules.'
        }
      ])
    );
  });

  it('handles partial sells correctly with FIFO lot matching', async () => {
    const taxEstimateTool = new TaxEstimateTool(
      {
        getOrders: jest.fn().mockResolvedValue({
          activities: [
            {
              SymbolProfile: {
                dataSource: 'YAHOO',
                name: 'NVIDIA',
                symbol: 'NVDA'
              },
              date: new Date('2023-01-01T00:00:00.000Z'),
              feeInBaseCurrency: 0,
              quantity: 10,
              type: 'BUY',
              valueInBaseCurrency: 1000
            },
            {
              SymbolProfile: {
                dataSource: 'YAHOO',
                name: 'NVIDIA',
                symbol: 'NVDA'
              },
              date: new Date('2025-06-01T00:00:00.000Z'),
              feeInBaseCurrency: 0,
              quantity: 5,
              type: 'SELL',
              valueInBaseCurrency: 600
            }
          ],
          count: 2
        })
      } as any,
      {
        getDetails: jest.fn().mockResolvedValue({ holdings: {} })
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

    const result = await taxEstimateTool.execute(
      {
        jurisdiction: 'US',
        taxYear: 2025
      },
      { userId: 'user-1' }
    );

    expect(result.realizedGains.longTerm).toEqual({
      gainInBaseCurrency: 100,
      lossInBaseCurrency: 0,
      netInBaseCurrency: 100,
      transactionCount: 1
    });

    expect(result.realizedGains.total.netInBaseCurrency).toBe(100);
  });
});

// ─── Hypothetical Trade Impact ─────────────────────────────────────────────

function buildHypotheticalTool({
  activities = [],
  holdings = {}
}: {
  activities?: object[];
  holdings?: Record<string, object>;
}) {
  return new TaxEstimateTool(
    {
      getOrders: jest
        .fn()
        .mockResolvedValue({ activities, count: activities.length })
    } as any,
    {
      getDetails: jest.fn().mockResolvedValue({
        holdings,
        summary: { totalValueInBaseCurrency: 0 }
      })
    } as any,
    {
      user: jest
        .fn()
        .mockResolvedValue({ settings: { settings: { baseCurrency: 'USD' } } })
    } as any
  );
}

describe('TaxEstimateTool — hypothetical trades', () => {
  it('computes gain for a hypothetical sell by exact quantity', async () => {
    const tool = buildHypotheticalTool({
      activities: [
        {
          SymbolProfile: { dataSource: 'YAHOO', symbol: 'NVDA' },
          date: new Date('2020-01-01T00:00:00.000Z'),
          feeInBaseCurrency: 0,
          quantity: 10,
          type: 'BUY',
          valueInBaseCurrency: 1000 // unitCost = $100
        }
      ],
      holdings: {
        NVDA: {
          marketPrice: 300,
          name: 'NVIDIA',
          symbol: 'NVDA',
          valueInBaseCurrency: 3000
        }
      }
    });

    const result = await tool.execute(
      {
        hypotheticalTrades: [{ action: 'sell', quantity: 5, symbol: 'NVDA' }],
        jurisdiction: 'US',
        taxYear: 2025
      },
      { userId: 'user-1' }
    );

    // No real sells → realized gains are zero
    expect(result.realizedGains.total.netInBaseCurrency).toBe(0);

    expect(result.hypotheticalImpact).toBeDefined();
    expect(result.hypotheticalImpact.trades).toHaveLength(1);

    const trade = result.hypotheticalImpact.trades[0];

    expect(trade.symbol).toBe('NVDA');
    expect(trade.quantitySold).toBe(5);
    expect(trade.estimatedProceedsInBaseCurrency).toBe(1500); // 5 * $300
    expect(trade.estimatedCostBasisInBaseCurrency).toBe(500); // 5 * $100
    expect(trade.estimatedGainInBaseCurrency).toBe(1000);
    expect(trade.isLongTerm).toBe(true); // bought 2020 → definitely >12mo
    expect(trade.warning).toBeUndefined();

    expect(result.hypotheticalImpact.totalEstimatedGainInBaseCurrency).toBe(
      1000
    );
    expect(result.hypotheticalImpact.totalLongTermGainInBaseCurrency).toBe(
      1000
    );
    expect(result.hypotheticalImpact.totalShortTermGainInBaseCurrency).toBe(0);
  });

  it('classifies hypothetical gain as short-term for recently acquired lots', async () => {
    const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const tool = buildHypotheticalTool({
      activities: [
        {
          SymbolProfile: { dataSource: 'YAHOO', symbol: 'NVDA' },
          date: recentDate,
          feeInBaseCurrency: 0,
          quantity: 10,
          type: 'BUY',
          valueInBaseCurrency: 1000
        }
      ],
      holdings: {
        NVDA: {
          marketPrice: 300,
          name: 'NVIDIA',
          symbol: 'NVDA',
          valueInBaseCurrency: 3000
        }
      }
    });

    const result = await tool.execute(
      {
        hypotheticalTrades: [{ action: 'sell', quantity: 5, symbol: 'NVDA' }],
        jurisdiction: 'US',
        taxYear: 2025
      },
      { userId: 'user-1' }
    );

    const trade = result.hypotheticalImpact.trades[0];

    expect(trade.isLongTerm).toBe(false); // 30 days < 360 days (12 months)
    expect(result.hypotheticalImpact.totalShortTermGainInBaseCurrency).toBe(
      1000
    );
    expect(result.hypotheticalImpact.totalLongTermGainInBaseCurrency).toBe(0);
  });

  it('resolves quantity from fractionOfPosition', async () => {
    const tool = buildHypotheticalTool({
      activities: [
        {
          SymbolProfile: { dataSource: 'YAHOO', symbol: 'NVDA' },
          date: new Date('2020-01-01T00:00:00.000Z'),
          feeInBaseCurrency: 0,
          quantity: 10,
          type: 'BUY',
          valueInBaseCurrency: 1000
        }
      ],
      holdings: {
        NVDA: {
          marketPrice: 300,
          name: 'NVIDIA',
          symbol: 'NVDA',
          valueInBaseCurrency: 3000
        }
      }
    });

    const result = await tool.execute(
      {
        hypotheticalTrades: [
          { action: 'sell', fractionOfPosition: 0.5, symbol: 'NVDA' }
        ],
        jurisdiction: 'US',
        taxYear: 2025
      },
      { userId: 'user-1' }
    );

    const trade = result.hypotheticalImpact.trades[0];

    expect(trade.quantitySold).toBeCloseTo(5, 5);
    expect(trade.estimatedProceedsInBaseCurrency).toBeCloseTo(1500, 5);
    expect(trade.estimatedGainInBaseCurrency).toBeCloseTo(1000, 5);
  });

  it('resolves quantity from notionalValueInBaseCurrency using market price', async () => {
    const tool = buildHypotheticalTool({
      activities: [
        {
          SymbolProfile: { dataSource: 'YAHOO', symbol: 'NVDA' },
          date: new Date('2020-01-01T00:00:00.000Z'),
          feeInBaseCurrency: 0,
          quantity: 10,
          type: 'BUY',
          valueInBaseCurrency: 1000
        }
      ],
      holdings: {
        NVDA: {
          marketPrice: 300,
          name: 'NVIDIA',
          symbol: 'NVDA',
          valueInBaseCurrency: 3000
        }
      }
    });

    const result = await tool.execute(
      {
        // $1500 / $300 per share = 5 shares
        hypotheticalTrades: [
          { action: 'sell', notionalValueInBaseCurrency: 1500, symbol: 'NVDA' }
        ],
        jurisdiction: 'US',
        taxYear: 2025
      },
      { userId: 'user-1' }
    );

    const trade = result.hypotheticalImpact.trades[0];

    expect(trade.quantitySold).toBeCloseTo(5, 5);
    expect(trade.estimatedGainInBaseCurrency).toBeCloseTo(1000, 5);
  });

  it('handles insufficient lots: partial fill and adds warning', async () => {
    const tool = buildHypotheticalTool({
      activities: [
        {
          SymbolProfile: { dataSource: 'YAHOO', symbol: 'NVDA' },
          date: new Date('2020-01-01T00:00:00.000Z'),
          feeInBaseCurrency: 0,
          quantity: 3,
          type: 'BUY',
          valueInBaseCurrency: 300 // unitCost = $100
        }
      ],
      holdings: {
        NVDA: {
          marketPrice: 300,
          name: 'NVIDIA',
          symbol: 'NVDA',
          valueInBaseCurrency: 900
        }
      }
    });

    const result = await tool.execute(
      {
        hypotheticalTrades: [{ action: 'sell', quantity: 10, symbol: 'NVDA' }],
        jurisdiction: 'US',
        taxYear: 2025
      },
      { userId: 'user-1' }
    );

    const trade = result.hypotheticalImpact.trades[0];

    expect(trade.quantitySold).toBe(3); // only 3 lots available
    expect(trade.estimatedProceedsInBaseCurrency).toBe(900);
    expect(trade.estimatedCostBasisInBaseCurrency).toBe(300);
    expect(trade.estimatedGainInBaseCurrency).toBe(600);
    expect(trade.warning).toMatch(/insufficient lots/i);
  });

  it('handles multiple hypothetical trades and aggregates totals', async () => {
    const tool = buildHypotheticalTool({
      activities: [
        {
          SymbolProfile: { dataSource: 'YAHOO', symbol: 'NVDA' },
          date: new Date('2020-01-01T00:00:00.000Z'),
          feeInBaseCurrency: 0,
          quantity: 10,
          type: 'BUY',
          valueInBaseCurrency: 1000 // unitCost = $100
        },
        {
          SymbolProfile: { dataSource: 'YAHOO', symbol: 'AAPL' },
          date: new Date('2020-01-01T00:00:00.000Z'),
          feeInBaseCurrency: 0,
          quantity: 5,
          type: 'BUY',
          valueInBaseCurrency: 500 // unitCost = $100
        }
      ],
      holdings: {
        AAPL: {
          marketPrice: 200,
          name: 'Apple',
          symbol: 'AAPL',
          valueInBaseCurrency: 1000
        },
        NVDA: {
          marketPrice: 300,
          name: 'NVIDIA',
          symbol: 'NVDA',
          valueInBaseCurrency: 3000
        }
      }
    });

    const result = await tool.execute(
      {
        hypotheticalTrades: [
          { action: 'sell', quantity: 5, symbol: 'NVDA' }, // gain = 5*(300-100) = $1000
          { action: 'sell', quantity: 5, symbol: 'AAPL' } // gain = 5*(200-100) = $500
        ],
        jurisdiction: 'US',
        taxYear: 2025
      },
      { userId: 'user-1' }
    );

    expect(result.hypotheticalImpact.trades).toHaveLength(2);
    expect(result.hypotheticalImpact.totalEstimatedGainInBaseCurrency).toBe(
      1500
    );
    expect(result.hypotheticalImpact.totalLongTermGainInBaseCurrency).toBe(
      1500
    );
    expect(result.hypotheticalImpact.totalShortTermGainInBaseCurrency).toBe(0);
  });

  it('uses remaining lots after real sells for hypothetical matching', async () => {
    const tool = buildHypotheticalTool({
      activities: [
        {
          SymbolProfile: { dataSource: 'YAHOO', symbol: 'NVDA' },
          date: new Date('2020-01-01T00:00:00.000Z'),
          feeInBaseCurrency: 0,
          quantity: 10,
          type: 'BUY',
          valueInBaseCurrency: 1000 // unitCost = $100
        },
        {
          // Real sell in 2025 — consumes 5 lots via FIFO
          SymbolProfile: { dataSource: 'YAHOO', symbol: 'NVDA' },
          date: new Date('2025-01-15T00:00:00.000Z'),
          feeInBaseCurrency: 0,
          quantity: 5,
          type: 'SELL',
          valueInBaseCurrency: 1500
        }
      ],
      holdings: {
        NVDA: {
          marketPrice: 300,
          name: 'NVIDIA',
          symbol: 'NVDA',
          valueInBaseCurrency: 1500
        }
      }
    });

    const result = await tool.execute(
      {
        hypotheticalTrades: [{ action: 'sell', quantity: 5, symbol: 'NVDA' }],
        jurisdiction: 'US',
        taxYear: 2025
      },
      { userId: 'user-1' }
    );

    // Real sell: 5 shares at $1500 proceeds − $500 cost basis = $1000 gain (long-term)
    expect(result.realizedGains.longTerm.gainInBaseCurrency).toBe(1000);

    // Hypothetical: remaining 5 shares at same cost basis ($100)
    const trade = result.hypotheticalImpact.trades[0];

    expect(trade.quantitySold).toBe(5);
    expect(trade.estimatedCostBasisInBaseCurrency).toBe(500);
    expect(trade.estimatedGainInBaseCurrency).toBe(1000);
    expect(trade.warning).toBeUndefined();
  });

  it('uses oldest remaining FIFO lot date for TLH holding period, not dateOfFirstActivity', async () => {
    // Scenario: user bought 100 shares in 2020 (long-term), sold all 100 in 2023,
    // then re-bought 50 shares in early 2025 (short-term — only ~2 months old).
    // dateOfFirstActivity is 2020-01-01 (stale), but the correct holding period
    // should reflect the 2025 re-buy (short-term).
    const taxEstimateTool = new TaxEstimateTool(
      {
        getOrders: jest.fn().mockResolvedValue({
          activities: [
            {
              SymbolProfile: { dataSource: 'YAHOO', symbol: 'AAPL' },
              date: new Date('2020-01-01T00:00:00.000Z'),
              feeInBaseCurrency: 0,
              quantity: 100,
              type: 'BUY',
              valueInBaseCurrency: 10000 // $100 each
            },
            {
              SymbolProfile: { dataSource: 'YAHOO', symbol: 'AAPL' },
              date: new Date('2023-06-01T00:00:00.000Z'),
              feeInBaseCurrency: 0,
              quantity: 100,
              type: 'SELL',
              valueInBaseCurrency: 15000 // sold all — lots consumed
            },
            {
              SymbolProfile: { dataSource: 'YAHOO', symbol: 'AAPL' },
              // Recent re-buy: only ~5 months ago (short-term, < 12 months)
              date: new Date('2025-10-01T00:00:00.000Z'),
              feeInBaseCurrency: 0,
              quantity: 50,
              type: 'BUY',
              valueInBaseCurrency: 15000 // $300 each — bought high, now down
            }
          ],
          count: 3
        })
      } as any,
      {
        getDetails: jest.fn().mockResolvedValue({
          holdings: {
            AAPL: {
              // dateOfFirstActivity is from the 2020 purchase — stale (> 5 years)
              dateOfFirstActivity: new Date('2020-01-01T00:00:00.000Z'),
              name: 'Apple',
              // current value $250 × 50 = $12 500, cost was $15 000 → unrealized loss
              netPerformanceWithCurrencyEffect: -2500,
              symbol: 'AAPL',
              valueInBaseCurrency: 12500
            }
          }
        })
      } as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: { settings: { baseCurrency: 'USD' } }
        })
      } as any
    );

    const result = await taxEstimateTool.execute(
      { jurisdiction: 'US', taxYear: 2025 },
      { userId: 'user-1' }
    );

    expect(result.taxLossHarvestingCandidates).toHaveLength(1);
    const candidate = result.taxLossHarvestingCandidates[0];

    // The remaining lot is from 2025-01-15 — short-term (< 12 months)
    expect(candidate.isLongTerm).toBe(false);
    // Holding period should reflect the Jan 2025 re-buy, not the 2020 original purchase
    expect(candidate.holdingPeriodDays).toBeLessThan(365);
  });

  it('returns undefined hypotheticalImpact when no hypotheticalTrades provided', async () => {
    const tool = buildHypotheticalTool({ activities: [], holdings: {} });

    const result = await tool.execute(
      { jurisdiction: 'US', taxYear: 2025 },
      { userId: 'user-1' }
    );

    expect(result.hypotheticalImpact).toBeUndefined();
  });

  it('adds warning when market price is unavailable for notional-based trade', async () => {
    const tool = buildHypotheticalTool({
      activities: [
        {
          SymbolProfile: { dataSource: 'YAHOO', symbol: 'NVDA' },
          date: new Date('2020-01-01T00:00:00.000Z'),
          feeInBaseCurrency: 0,
          quantity: 10,
          type: 'BUY',
          valueInBaseCurrency: 1000
        }
      ],
      holdings: {
        // marketPrice missing
        NVDA: { name: 'NVIDIA', symbol: 'NVDA', valueInBaseCurrency: 3000 }
      }
    });

    const result = await tool.execute(
      {
        hypotheticalTrades: [
          { action: 'sell', notionalValueInBaseCurrency: 1500, symbol: 'NVDA' }
        ],
        jurisdiction: 'US',
        taxYear: 2025
      },
      { userId: 'user-1' }
    );

    const trade = result.hypotheticalImpact.trades[0];

    expect(trade.quantitySold).toBe(0);
    expect(trade.warning).toMatch(/market price/i);
  });
});
