import { RebalanceSuggestTool } from './rebalance-suggest.tool';

function buildTool({
  baseCurrency = 'USD',
  holdings = {},
  summary = { cash: 0, totalValueInBaseCurrency: 0 }
}: {
  baseCurrency?: string;
  holdings?: Record<string, Record<string, unknown>>;
  summary?: {
    cash: number;
    totalValueInBaseCurrency: number;
  };
} = {}) {
  return new RebalanceSuggestTool(
    {
      getDetails: jest.fn().mockResolvedValue({
        holdings,
        summary
      })
    } as any,
    {
      user: jest.fn().mockResolvedValue({
        settings: {
          settings: {
            baseCurrency
          }
        }
      })
    } as any
  );
}

describe('RebalanceSuggestTool', () => {
  it('generates equal-weight rebalance trades for 3 holdings', async () => {
    const tool = buildTool({
      holdings: {
        AAPL: {
          marketPrice: 200,
          name: 'Apple',
          symbol: 'AAPL',
          valueInBaseCurrency: 500
        },
        MSFT: {
          marketPrice: 100,
          name: 'Microsoft',
          symbol: 'MSFT',
          valueInBaseCurrency: 300
        },
        VOO: {
          marketPrice: 50,
          name: 'Vanguard S&P 500',
          symbol: 'VOO',
          valueInBaseCurrency: 200
        }
      },
      summary: {
        cash: 0,
        totalValueInBaseCurrency: 1000
      }
    });

    const result = await tool.execute(
      {
        constraints: {
          cashReservePct: 0.02,
          maxTrades: 10,
          maxTurnoverPct: 1,
          minTradeValueInBaseCurrency: 0
        },
        strategy: 'equal_weight'
      },
      { userId: 'u1' }
    );

    expect(result.strategy).toBe('equal_weight');
    expect(result.currentAllocations).toHaveLength(3);
    expect(result.targetAllocations).toHaveLength(3);

    expect(
      result.suggestedTrades.map(({ action, symbol }) => ({ action, symbol }))
    ).toEqual(
      expect.arrayContaining([
        { action: 'SELL', symbol: 'AAPL' },
        { action: 'BUY', symbol: 'MSFT' },
        { action: 'BUY', symbol: 'VOO' }
      ])
    );

    expect(result.summary.totalTradesCount).toBe(3);
    expect(result.summary.totalSellValueInBaseCurrency).toBeCloseTo(
      173.333333,
      5
    );
    expect(result.summary.totalBuyValueInBaseCurrency).toBeCloseTo(
      153.333333,
      5
    );
    expect(result.summary.tradesLimitedByConstraints).toBe(false);
  });

  it('applies custom targets to managed symbols while leaving unspecified symbols unchanged', async () => {
    const tool = buildTool({
      holdings: {
        AAPL: {
          marketPrice: 200,
          name: 'Apple',
          symbol: 'AAPL',
          valueInBaseCurrency: 500
        },
        MSFT: {
          marketPrice: 100,
          name: 'Microsoft',
          symbol: 'MSFT',
          valueInBaseCurrency: 300
        },
        VOO: {
          marketPrice: 50,
          name: 'Vanguard S&P 500',
          symbol: 'VOO',
          valueInBaseCurrency: 200
        }
      },
      summary: {
        cash: 0,
        totalValueInBaseCurrency: 1000
      }
    });

    const result = await tool.execute(
      {
        constraints: {
          cashReservePct: 0,
          maxTrades: 10,
          maxTurnoverPct: 1,
          minTradeValueInBaseCurrency: 0
        },
        strategy: 'custom',
        targetAllocations: [
          { symbol: 'AAPL', targetPct: 0.5 },
          { symbol: 'MSFT', targetPct: 0.5 }
        ]
      },
      { userId: 'u1' }
    );

    const targetVoo = result.targetAllocations.find(({ symbol }) => {
      return symbol === 'VOO';
    });

    expect(targetVoo.targetValueInBaseCurrency).toBe(200);

    expect(result.suggestedTrades).toHaveLength(2);
    expect(result.suggestedTrades).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'SELL',
          symbol: 'AAPL',
          valueInBaseCurrency: 100
        }),
        expect.objectContaining({
          action: 'BUY',
          symbol: 'MSFT',
          valueInBaseCurrency: 100
        })
      ])
    );
  });

  it('warns and returns no trades when custom targets do not sum to 1', async () => {
    const tool = buildTool({
      holdings: {
        AAPL: {
          marketPrice: 200,
          name: 'Apple',
          symbol: 'AAPL',
          valueInBaseCurrency: 500
        },
        MSFT: {
          marketPrice: 100,
          name: 'Microsoft',
          symbol: 'MSFT',
          valueInBaseCurrency: 500
        }
      },
      summary: {
        cash: 0,
        totalValueInBaseCurrency: 1000
      }
    });

    const result = await tool.execute(
      {
        strategy: 'custom',
        targetAllocations: [
          { symbol: 'AAPL', targetPct: 0.7 },
          { symbol: 'MSFT', targetPct: 0.2 }
        ]
      },
      { userId: 'u1' }
    );

    expect(result.suggestedTrades).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'custom_target_invalid_sum',
          message:
            'Custom target allocations must sum to 1.00 (±0.01 tolerance).'
        }
      ])
    );
  });

  it('respects maxTrades constraint', async () => {
    const tool = buildTool({
      holdings: {
        A: {
          marketPrice: 10,
          name: 'A',
          symbol: 'A',
          valueInBaseCurrency: 700
        },
        B: {
          marketPrice: 10,
          name: 'B',
          symbol: 'B',
          valueInBaseCurrency: 100
        },
        C: {
          marketPrice: 10,
          name: 'C',
          symbol: 'C',
          valueInBaseCurrency: 100
        },
        D: { marketPrice: 10, name: 'D', symbol: 'D', valueInBaseCurrency: 100 }
      },
      summary: {
        cash: 0,
        totalValueInBaseCurrency: 1000
      }
    });

    const result = await tool.execute(
      {
        constraints: {
          cashReservePct: 0,
          maxTrades: 2,
          maxTurnoverPct: 1,
          minTradeValueInBaseCurrency: 0
        },
        strategy: 'equal_weight'
      },
      { userId: 'u1' }
    );

    expect(result.suggestedTrades).toHaveLength(2);
    expect(result.summary.tradesLimitedByConstraints).toBe(true);
  });

  it('respects maxTurnoverPct constraint', async () => {
    const tool = buildTool({
      holdings: {
        AAPL: {
          marketPrice: 100,
          name: 'Apple',
          symbol: 'AAPL',
          valueInBaseCurrency: 500
        },
        MSFT: {
          marketPrice: 100,
          name: 'Microsoft',
          symbol: 'MSFT',
          valueInBaseCurrency: 300
        },
        VOO: {
          marketPrice: 100,
          name: 'Vanguard S&P 500',
          symbol: 'VOO',
          valueInBaseCurrency: 200
        }
      },
      summary: {
        cash: 0,
        totalValueInBaseCurrency: 1000
      }
    });

    const result = await tool.execute(
      {
        constraints: {
          cashReservePct: 0,
          maxTrades: 10,
          maxTurnoverPct: 0.2,
          minTradeValueInBaseCurrency: 0
        },
        strategy: 'equal_weight'
      },
      { userId: 'u1' }
    );

    expect(result.summary.estimatedTurnoverPct).toBeLessThanOrEqual(0.2);
    expect(result.summary.tradesLimitedByConstraints).toBe(true);
  });

  it('filters out tiny rebalances with minTradeValueInBaseCurrency', async () => {
    const tool = buildTool({
      holdings: {
        AAPL: {
          marketPrice: 100,
          name: 'Apple',
          symbol: 'AAPL',
          valueInBaseCurrency: 400
        },
        MSFT: {
          marketPrice: 100,
          name: 'Microsoft',
          symbol: 'MSFT',
          valueInBaseCurrency: 300
        },
        VOO: {
          marketPrice: 100,
          name: 'Vanguard S&P 500',
          symbol: 'VOO',
          valueInBaseCurrency: 300
        }
      },
      summary: {
        cash: 0,
        totalValueInBaseCurrency: 1000
      }
    });

    const result = await tool.execute(
      {
        constraints: {
          cashReservePct: 0,
          maxTrades: 10,
          maxTurnoverPct: 1,
          minTradeValueInBaseCurrency: 50
        },
        strategy: 'equal_weight'
      },
      { userId: 'u1' }
    );

    expect(result.suggestedTrades).toHaveLength(1);
    expect(result.suggestedTrades[0].symbol).toBe('AAPL');
    expect(result.summary.tradesLimitedByConstraints).toBe(true);
  });

  it('returns helpful warning for empty portfolio', async () => {
    const tool = buildTool({
      holdings: {},
      summary: {
        cash: 0,
        totalValueInBaseCurrency: 0
      }
    });

    const result = await tool.execute({}, { userId: 'u1' });

    expect(result.suggestedTrades).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'empty_portfolio',
          message: 'No holdings are available for rebalancing simulation.'
        }
      ])
    );
  });

  it('returns no trades for single-holding equal_weight with zero cash reserve', async () => {
    const tool = buildTool({
      holdings: {
        AAPL: {
          marketPrice: 100,
          name: 'Apple',
          symbol: 'AAPL',
          valueInBaseCurrency: 1000
        }
      },
      summary: {
        cash: 0,
        totalValueInBaseCurrency: 1000
      }
    });

    const result = await tool.execute(
      {
        constraints: {
          cashReservePct: 0,
          minTradeValueInBaseCurrency: 0
        },
        strategy: 'equal_weight'
      },
      { userId: 'u1' }
    );

    expect(result.suggestedTrades).toEqual([]);
    expect(result.summary.totalTradesCount).toBe(0);
  });

  it('applies cash reserve by reducing investable target value', async () => {
    const tool = buildTool({
      holdings: {
        AAPL: {
          marketPrice: 100,
          name: 'Apple',
          symbol: 'AAPL',
          valueInBaseCurrency: 600
        },
        MSFT: {
          marketPrice: 100,
          name: 'Microsoft',
          symbol: 'MSFT',
          valueInBaseCurrency: 400
        }
      },
      summary: {
        cash: 0,
        totalValueInBaseCurrency: 1000
      }
    });

    const result = await tool.execute(
      {
        constraints: {
          cashReservePct: 0.1,
          maxTrades: 10,
          maxTurnoverPct: 1,
          minTradeValueInBaseCurrency: 0
        },
        strategy: 'equal_weight'
      },
      { userId: 'u1' }
    );

    const targetTotal = result.targetAllocations.reduce(
      (sum, currentTarget) => {
        return sum + currentTarget.targetValueInBaseCurrency;
      },
      0
    );

    expect(targetTotal).toBeCloseTo(900, 5);
    expect(result.summary.totalSellValueInBaseCurrency).toBeCloseTo(150, 5);
    expect(result.summary.totalBuyValueInBaseCurrency).toBeCloseTo(50, 5);
  });
});
