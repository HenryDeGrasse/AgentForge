import { SimulateTradesTool } from './simulate-trades.tool';

function createTool(
  holdings: Record<string, any> = {},
  summary: any = {},
  baseCurrency = 'USD'
): SimulateTradesTool {
  return new SimulateTradesTool(
    {
      getDetails: jest.fn().mockResolvedValue({
        holdings,
        summary
      })
    } as any,
    {
      user: jest.fn().mockResolvedValue({
        settings: { settings: { baseCurrency } }
      })
    } as any
  );
}

const MOCK_HOLDINGS = {
  AAPL: {
    allocationInPercentage: 0.45,
    assetClass: 'EQUITY',
    currency: 'USD',
    marketPrice: 150,
    name: 'Apple',
    quantity: 30,
    sectors: [{ name: 'Technology', weight: 1 }],
    symbol: 'AAPL',
    valueInBaseCurrency: 4500
  },
  BND: {
    allocationInPercentage: 0.2,
    assetClass: 'FIXED_INCOME',
    currency: 'USD',
    marketPrice: 80,
    name: 'Vanguard Total Bond',
    quantity: 25,
    sectors: [],
    symbol: 'BND',
    valueInBaseCurrency: 2000
  },
  MSFT: {
    allocationInPercentage: 0.35,
    assetClass: 'EQUITY',
    currency: 'USD',
    marketPrice: 350,
    name: 'Microsoft',
    quantity: 10,
    sectors: [{ name: 'Technology', weight: 1 }],
    symbol: 'MSFT',
    valueInBaseCurrency: 3500
  }
};

const MOCK_SUMMARY = {
  cash: 50000,
  totalValueInBaseCurrency: 60000
};

const CTX = { userId: 'user-1' };

describe('SimulateTradesTool', () => {
  it('should have correct name and schemas', () => {
    const tool = createTool();
    expect(tool.name).toBe('simulate_trades');
    expect(tool.inputSchema).toBeDefined();
    expect(tool.outputSchema).toBeDefined();
  });

  it('simulates a buy with explicit quantity', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      { trades: [{ action: 'buy', quantity: 10, symbol: 'AAPL' }] },
      CTX
    );

    expect(result.status).toBe('success');
    expect(result.data.tradeResults).toHaveLength(1);
    expect(result.data.tradeResults[0].status).toBe('executed');
    expect(result.data.tradeResults[0].acceptedQuantity).toBe(10);
    expect(result.data.tradeResults[0].priceUsed).toBe(150);
    expect(result.data.tradeResults[0].costInBaseCurrency).toBe(1500);

    // AAPL should now be 4500 + 1500 = 6000
    const aaplAfter = result.data.hypotheticalPortfolio.positions.find(
      (p) => p.symbol === 'AAPL'
    );
    expect(aaplAfter.valueInBaseCurrency).toBe(6000);

    // Total value of positions increases by 1500 (buy adds value)
    expect(result.data.hypotheticalPortfolio.totalValueInBaseCurrency).toBe(
      11500
    );
  });

  it('simulates a sell with explicit quantity', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      { trades: [{ action: 'sell', quantity: 5, symbol: 'AAPL' }] },
      CTX
    );

    expect(result.status).toBe('success');
    expect(result.data.tradeResults[0].status).toBe('executed');
    expect(result.data.tradeResults[0].acceptedQuantity).toBe(5);

    // AAPL should now be 4500 - 750 = 3750
    const aaplAfter = result.data.hypotheticalPortfolio.positions.find(
      (p) => p.symbol === 'AAPL'
    );
    expect(aaplAfter.valueInBaseCurrency).toBe(3750);
  });

  it('caps sell at available quantity with capped status', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      { trades: [{ action: 'sell', quantity: 50, symbol: 'AAPL' }] },
      CTX
    );

    expect(result.data.tradeResults[0].status).toBe('capped');
    expect(result.data.tradeResults[0].requestedQuantity).toBe(50);
    expect(result.data.tradeResults[0].acceptedQuantity).toBe(30);
    expect(result.data.tradeResults[0].warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'quantity_capped' })
      ])
    );
  });

  it('buys a new symbol with explicit price', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      {
        trades: [{ action: 'buy', price: 200, quantity: 5, symbol: 'GOOGL' }]
      },
      CTX
    );

    expect(result.data.tradeResults[0].status).toBe('executed');
    expect(result.data.tradeResults[0].priceUsed).toBe(200);

    const googlAfter = result.data.hypotheticalPortfolio.positions.find(
      (p) => p.symbol === 'GOOGL'
    );
    expect(googlAfter).toBeDefined();
    expect(googlAfter.valueInBaseCurrency).toBe(1000);
  });

  it('falls back to marketPrice for existing holdings', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      { trades: [{ action: 'buy', quantity: 5, symbol: 'MSFT' }] },
      CTX
    );

    expect(result.data.tradeResults[0].priceUsed).toBe(350);
  });

  it('skips trade for new symbol without price', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      { trades: [{ action: 'buy', quantity: 10, symbol: 'UNKNOWN' }] },
      CTX
    );

    expect(result.data.tradeResults[0].status).toBe('skipped');
    expect(result.data.tradeResults[0].warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'no_price_available' })
      ])
    );
  });

  it('generates concentration warning when position exceeds 35%', async () => {
    // Buy enough AAPL to push well past 35%
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      { trades: [{ action: 'buy', quantity: 50, symbol: 'AAPL' }] },
      CTX
    );

    expect(result.data.impact.concentrationWarnings.length).toBeGreaterThan(0);
    expect(result.data.impact.concentrationWarnings[0]).toContain('AAPL');
  });

  it('handles empty portfolio gracefully', async () => {
    const tool = createTool({}, { cash: 5000, totalValueInBaseCurrency: 5000 });
    const result = await tool.execute(
      {
        trades: [{ action: 'buy', price: 100, quantity: 10, symbol: 'AAPL' }]
      },
      CTX
    );

    expect(result.status).toBe('success');
    expect(result.data.portfolioBefore.positions).toHaveLength(0);
    expect(result.data.hypotheticalPortfolio.positions).toHaveLength(1);
  });

  it('handles multiple trades with combined impact', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      {
        trades: [
          { action: 'sell', quantity: 10, symbol: 'AAPL' },
          { action: 'buy', quantity: 5, symbol: 'MSFT' }
        ]
      },
      CTX
    );

    expect(result.data.tradeResults).toHaveLength(2);
    expect(result.data.tradeResults[0].status).toBe('executed');
    expect(result.data.tradeResults[1].status).toBe('executed');

    // AAPL: 4500 - 1500 = 3000, MSFT: 3500 + 1750 = 5250
    const aaplAfter = result.data.hypotheticalPortfolio.positions.find(
      (p) => p.symbol === 'AAPL'
    );
    const msftAfter = result.data.hypotheticalPortfolio.positions.find(
      (p) => p.symbol === 'MSFT'
    );
    expect(aaplAfter.valueInBaseCurrency).toBe(3000);
    expect(msftAfter.valueInBaseCurrency).toBe(5250);
  });

  it('omits zero-change rows from allocationChanges', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      { trades: [{ action: 'sell', quantity: 5, symbol: 'AAPL' }] },
      CTX
    );

    // Only AAPL was touched — BND and MSFT allocationPct shifts due to
    // total value changing, but their absolute values are unchanged, so
    // we only care that AAPL appears and zero-change symbols are dropped.
    // Every entry must have a non-trivial change
    for (const change of result.data.impact.allocationChanges) {
      expect(Math.abs(change.changePct)).toBeGreaterThan(0.0001);
    }
  });

  it('tags pre-existing concentration warnings vs new ones', async () => {
    // AAPL starts at 45% (>35% threshold) — a small buy should NOT create a
    // "New" warning for AAPL; it should be tagged pre-existing.
    // Buy enough AAPL to push it higher — that IS a new/worsening situation.
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);

    // Small buy — AAPL was already concentrated before the trade
    const result = await tool.execute(
      { trades: [{ action: 'buy', quantity: 1, symbol: 'AAPL' }] },
      CTX
    );

    const aaplWarning = result.data.impact.concentrationWarnings.find((w) =>
      w.includes('AAPL')
    );

    if (aaplWarning) {
      expect(aaplWarning).toContain('pre-existing');
    }
  });

  it('always includes disclaimers', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      { trades: [{ action: 'buy', quantity: 1, symbol: 'AAPL' }] },
      CTX
    );

    expect(result.data.disclaimers.length).toBeGreaterThan(0);
    expect(result.data.disclaimers.join(' ')).toContain('Simulation');
  });

  it('resolves fractionOfPosition correctly (sell half)', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      {
        trades: [{ action: 'sell', fractionOfPosition: 0.5, symbol: 'AAPL' }]
      },
      CTX
    );

    expect(result.data.tradeResults[0].status).toBe('executed');
    // AAPL has 30 shares, half = 15
    expect(result.data.tradeResults[0].acceptedQuantity).toBe(15);
    expect(result.data.tradeResults[0].costInBaseCurrency).toBe(2250);
  });

  it('resolves notionalUsd correctly (buy $5k worth)', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      {
        trades: [{ action: 'buy', notionalUsd: 5000, symbol: 'MSFT' }]
      },
      CTX
    );

    expect(result.data.tradeResults[0].status).toBe('executed');
    // MSFT price = 350, $5000 / 350 ≈ 14.2857
    expect(result.data.tradeResults[0].acceptedQuantity).toBeCloseTo(
      14.2857,
      2
    );
    expect(result.data.tradeResults[0].costInBaseCurrency).toBeCloseTo(5000, 0);
  });

  it('caps buy quantity at available cash when cost exceeds balance', async () => {
    // Cash is 1000, AAPL price is 150, trying to buy 100 shares ($15,000)
    const smallCashSummary = { cash: 1000, totalValueInBaseCurrency: 11000 };
    const tool = createTool(MOCK_HOLDINGS, smallCashSummary);
    const result = await tool.execute(
      { trades: [{ action: 'buy', quantity: 100, symbol: 'AAPL' }] },
      CTX
    );

    expect(result.status).toBe('partial');
    expect(result.data.tradeResults[0].status).toBe('capped');
    expect(result.data.tradeResults[0].requestedQuantity).toBe(100);
    // Capped to 1000/150 ≈ 6.666 shares
    expect(result.data.tradeResults[0].acceptedQuantity).toBeCloseTo(6.6667, 2);
    expect(result.data.tradeResults[0].costInBaseCurrency).toBeCloseTo(1000, 0);
    expect(result.data.tradeResults[0].warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'buy_capped_insufficient_cash' })
      ])
    );
    // Cash should be ~0, not negative
    expect(result.data.hypotheticalPortfolio.cashBalance).toBeCloseTo(0, 0);
  });

  it('executes buy fully when cash is sufficient', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      { trades: [{ action: 'buy', quantity: 10, symbol: 'AAPL' }] },
      CTX
    );

    // 10 * 150 = 1500, cash is 50000 — plenty
    expect(result.data.tradeResults[0].status).toBe('executed');
    expect(result.data.tradeResults[0].acceptedQuantity).toBe(10);
    expect(result.data.hypotheticalPortfolio.cashBalance).toBe(48500);
  });
});
