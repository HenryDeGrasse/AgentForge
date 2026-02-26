import { STRESS_SCENARIOS, StressTestTool } from './stress-test.tool';

function createTool(
  holdings: Record<string, any> = {},
  summary: any = {}
): StressTestTool {
  return new StressTestTool({
    getDetails: jest.fn().mockResolvedValue({
      holdings,
      summary
    })
  } as any);
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
  BTC: {
    allocationInPercentage: 0.1,
    assetClass: 'CRYPTOCURRENCY',
    currency: 'USD',
    marketPrice: 50000,
    name: 'Bitcoin',
    quantity: 0.02,
    sectors: [],
    symbol: 'BTC',
    valueInBaseCurrency: 1000
  },
  MSFT: {
    allocationInPercentage: 0.25,
    assetClass: 'EQUITY',
    currency: 'USD',
    marketPrice: 350,
    name: 'Microsoft',
    quantity: 7.14,
    sectors: [{ name: 'Technology', weight: 1 }],
    symbol: 'MSFT',
    valueInBaseCurrency: 2500
  }
};

const MOCK_SUMMARY = {
  cash: 0,
  totalValueInBaseCurrency: 10000
};

const CTX = { userId: 'user-1' };

describe('StressTestTool', () => {
  it('should have correct name and schemas', () => {
    const tool = createTool();
    expect(tool.name).toBe('stress_test');
    expect(tool.inputSchema).toBeDefined();
    expect(tool.outputSchema).toBeDefined();
  });

  it('applies market_crash_2008 scenario correctly', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute({ scenarioId: 'market_crash_2008' }, CTX);

    expect(result.status).toBe('success');
    expect(result.data.scenario.id).toBe('market_crash_2008');

    // AAPL (EQUITY -50%): 4500 * 0.5 = 2250
    const aaplImpact = result.data.positionImpacts.find(
      (p) => p.symbol === 'AAPL'
    );
    expect(aaplImpact.stressedValueInBaseCurrency).toBe(2250);
    expect(aaplImpact.lossPct).toBeCloseTo(-50, 0);

    // BND (FIXED_INCOME +5%): 2000 * 1.05 = 2100
    const bndImpact = result.data.positionImpacts.find(
      (p) => p.symbol === 'BND'
    );
    expect(bndImpact.stressedValueInBaseCurrency).toBe(2100);

    // BTC (CRYPTOCURRENCY -60%): 1000 * 0.4 = 400
    const btcImpact = result.data.positionImpacts.find(
      (p) => p.symbol === 'BTC'
    );
    expect(btcImpact.stressedValueInBaseCurrency).toBe(400);

    // Total: 2250 + 2100 + 400 + 1250 = 6000
    expect(result.data.stressedValueInBaseCurrency).toBeCloseTo(6000, 0);
    expect(result.data.totalLossPct).toBeCloseTo(-40, 0);
  });

  it('applies custom shocks correctly', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      {
        customShocks: [
          { assetClass: 'EQUITY', shockPercent: -20 },
          { assetClass: 'FIXED_INCOME', shockPercent: 10 }
        ]
      },
      CTX
    );

    expect(result.status).toBe('success');
    expect(result.data.scenario.id).toBe('custom');

    // AAPL (EQUITY -20%): 4500 * 0.8 = 3600
    const aaplImpact = result.data.positionImpacts.find(
      (p) => p.symbol === 'AAPL'
    );
    expect(aaplImpact.stressedValueInBaseCurrency).toBe(3600);

    // BND (FIXED_INCOME +10%): 2000 * 1.1 = 2200
    const bndImpact = result.data.positionImpacts.find(
      (p) => p.symbol === 'BND'
    );
    expect(bndImpact.stressedValueInBaseCurrency).toBe(2200);
  });

  it('returns partial with availableScenarioIds for unknown scenario', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute(
      { scenarioId: 'nonexistent_scenario' },
      CTX
    );

    expect(result.status).toBe('partial');
    expect(result.data.availableScenarioIds).toBeDefined();
    expect(result.data.availableScenarioIds.length).toBeGreaterThan(0);
    expect(result.data.availableScenarioIds).toContain('market_crash_2008');
    expect(result.data.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unknown_scenario' })
      ])
    );
  });

  it('applies differential shocks to mixed asset classes', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute({ scenarioId: 'crypto_winter' }, CTX);

    // crypto_winter: CRYPTO -80%, EQUITY -5%
    const btcImpact = result.data.positionImpacts.find(
      (p) => p.symbol === 'BTC'
    );
    expect(btcImpact.lossPct).toBeCloseTo(-80, 0);

    const aaplImpact = result.data.positionImpacts.find(
      (p) => p.symbol === 'AAPL'
    );
    expect(aaplImpact.lossPct).toBeCloseTo(-5, 0);
  });

  it('applies conservative default shock for UNKNOWN asset class', async () => {
    const holdingsWithUnknown = {
      ...MOCK_HOLDINGS,
      XYZ: {
        allocationInPercentage: 0.1,
        assetClass: 'UNKNOWN',
        currency: 'USD',
        marketPrice: 10,
        name: 'Unknown Asset',
        quantity: 100,
        sectors: [],
        symbol: 'XYZ',
        valueInBaseCurrency: 1000
      }
    };
    const tool = createTool(holdingsWithUnknown, {
      ...MOCK_SUMMARY,
      totalValueInBaseCurrency: 11000
    });
    const result = await tool.execute({ scenarioId: 'market_crash_2008' }, CTX);

    // UNKNOWN should get the default equity shock (-50%), not 0%
    const xyzImpact = result.data.positionImpacts.find(
      (p) => p.symbol === 'XYZ'
    );
    expect(xyzImpact.stressedValueInBaseCurrency).toBe(500);
    expect(xyzImpact.lossPct).toBeCloseTo(-50, 0);

    expect(result.data.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unknown_asset_class' })
      ])
    );
  });

  it('calculates recovery percentage correctly', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute({ scenarioId: 'market_crash_2008' }, CTX);

    // recovery = (current / stressed - 1) * 100
    const expected =
      (result.data.currentValueInBaseCurrency /
        result.data.stressedValueInBaseCurrency -
        1) *
      100;
    expect(result.data.recoveryNeededPct).toBeCloseTo(expected, 1);
  });

  it('handles stressedValue of 0 with Infinity recovery', async () => {
    const tinyHoldings = {
      DOGE: {
        allocationInPercentage: 1,
        assetClass: 'CRYPTOCURRENCY',
        currency: 'USD',
        marketPrice: 0.1,
        name: 'Dogecoin',
        quantity: 10000,
        sectors: [],
        symbol: 'DOGE',
        valueInBaseCurrency: 1000
      }
    };
    const tool = createTool(tinyHoldings, {
      cash: 0,
      totalValueInBaseCurrency: 1000
    });
    const result = await tool.execute(
      {
        customShocks: [{ assetClass: 'CRYPTOCURRENCY', shockPercent: -100 }]
      },
      CTX
    );

    expect(result.data.recoveryNeededPct).toBe(Infinity);
    expect(result.data.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'total_loss' })])
    );
  });

  it('sorts mostVulnerable by lossPct descending', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute({ scenarioId: 'market_crash_2008' }, CTX);

    expect(result.data.mostVulnerable.length).toBeGreaterThan(0);

    for (let i = 1; i < result.data.mostVulnerable.length; i++) {
      // More negative = more vulnerable, so lossPct should be ascending (more negative first)
      expect(result.data.mostVulnerable[i - 1].lossPct).toBeLessThanOrEqual(
        result.data.mostVulnerable[i].lossPct
      );
    }
  });

  it('handles empty portfolio gracefully', async () => {
    const tool = createTool({}, { cash: 0, totalValueInBaseCurrency: 0 });
    const result = await tool.execute({ scenarioId: 'market_crash_2008' }, CTX);

    expect(result.status).toBe('success');
    expect(result.data.positionImpacts).toHaveLength(0);
    expect(result.data.currentValueInBaseCurrency).toBe(0);
    expect(result.data.stressedValueInBaseCurrency).toBe(0);
  });

  it('returns error when no scenario or custom shocks provided', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute({}, CTX);

    expect(result.status).toBe('error');
  });

  it('always includes disclaimers', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute({ scenarioId: 'market_crash_2008' }, CTX);

    expect(result.data.disclaimers.length).toBeGreaterThan(0);
    expect(result.data.disclaimers.join(' ')).toContain('hypothetical');
  });

  it('aggregates assetClassImpacts correctly', async () => {
    const tool = createTool(MOCK_HOLDINGS, MOCK_SUMMARY);
    const result = await tool.execute({ scenarioId: 'market_crash_2008' }, CTX);

    expect(result.data.assetClassImpacts.length).toBeGreaterThan(0);

    // EQUITY class should aggregate AAPL + MSFT
    const equityImpact = result.data.assetClassImpacts.find(
      (a) => a.name === 'EQUITY'
    );
    expect(equityImpact).toBeDefined();
    // AAPL(4500) + MSFT(2500) = 7000 current
    expect(equityImpact.currentValueInBaseCurrency).toBe(7000);
  });

  it('exports STRESS_SCENARIOS for discoverability', () => {
    expect(STRESS_SCENARIOS).toBeDefined();
    expect(Object.keys(STRESS_SCENARIOS)).toContain('market_crash_2008');
    expect(Object.keys(STRESS_SCENARIOS)).toContain('covid_crash');
    expect(Object.keys(STRESS_SCENARIOS)).toContain('crypto_winter');
  });
});
