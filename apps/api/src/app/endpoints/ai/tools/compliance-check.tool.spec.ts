import { ComplianceCheckTool } from './compliance-check.tool';

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
  return new ComplianceCheckTool(
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

describe('ComplianceCheckTool', () => {
  it('returns COMPLIANT when all default rules pass', async () => {
    const tool = buildTool({
      holdings: {
        AAPL: {
          assetClass: 'EQUITY',
          name: 'Apple',
          sectors: [{ name: 'Technology', weight: 1 }],
          symbol: 'AAPL',
          valueInBaseCurrency: 200
        },
        MSFT: {
          assetClass: 'EQUITY',
          name: 'Microsoft',
          sectors: [{ name: 'Technology', weight: 1 }],
          symbol: 'MSFT',
          valueInBaseCurrency: 150
        },
        BND: {
          assetClass: 'FIXED_INCOME',
          name: 'Total Bond',
          sectors: [{ name: 'Government', weight: 1 }],
          symbol: 'BND',
          valueInBaseCurrency: 150
        },
        VNQ: {
          assetClass: 'REAL_ESTATE',
          name: 'REIT',
          sectors: [{ name: 'Real Estate', weight: 1 }],
          symbol: 'VNQ',
          valueInBaseCurrency: 150
        },
        VEA: {
          assetClass: 'ETF',
          name: 'Developed Markets',
          sectors: [{ name: 'Industrials', weight: 1 }],
          symbol: 'VEA',
          valueInBaseCurrency: 150
        }
      },
      summary: {
        cash: 100,
        totalValueInBaseCurrency: 900
      }
    });

    const result = await tool.execute({}, { userId: 'u1' });

    expect(result.baseCurrency).toBe('USD');
    expect(result.overallStatus).toBe('COMPLIANT');
    expect(result.rulesFailed).toBe(0);
    expect(
      result.results.every((ruleResult) => ruleResult.status !== 'fail')
    ).toBe(true);
  });

  it('flags single-position concentration breach', async () => {
    const tool = buildTool({
      holdings: {
        TSLA: {
          assetClass: 'EQUITY',
          name: 'Tesla',
          sectors: [{ name: 'Auto', weight: 1 }],
          symbol: 'TSLA',
          valueInBaseCurrency: 400
        },
        BND: {
          assetClass: 'FIXED_INCOME',
          name: 'BND',
          sectors: [{ name: 'Government', weight: 1 }],
          symbol: 'BND',
          valueInBaseCurrency: 100
        },
        VEA: {
          assetClass: 'ETF',
          name: 'VEA',
          sectors: [{ name: 'Industrials', weight: 1 }],
          symbol: 'VEA',
          valueInBaseCurrency: 100
        },
        VNQ: {
          assetClass: 'REAL_ESTATE',
          name: 'VNQ',
          sectors: [{ name: 'Real Estate', weight: 1 }],
          symbol: 'VNQ',
          valueInBaseCurrency: 100
        },
        GLD: {
          assetClass: 'COMMODITY',
          name: 'GLD',
          sectors: [{ name: 'Metals', weight: 1 }],
          symbol: 'GLD',
          valueInBaseCurrency: 200
        }
      },
      summary: {
        cash: 100,
        totalValueInBaseCurrency: 1000
      }
    });

    const result = await tool.execute({}, { userId: 'u1' });

    const singlePositionRule = result.results.find((ruleResult) => {
      return ruleResult.ruleId === 'max_single_position';
    });

    expect(singlePositionRule.status).toBe('fail');
    expect(result.overallStatus).toBe('NON_COMPLIANT');
  });

  it('flags restricted symbols when present', async () => {
    const tool = buildTool({
      holdings: {
        TSLA: {
          assetClass: 'EQUITY',
          name: 'Tesla',
          sectors: [{ name: 'Auto', weight: 1 }],
          symbol: 'TSLA',
          valueInBaseCurrency: 100
        },
        BND: {
          assetClass: 'FIXED_INCOME',
          name: 'BND',
          sectors: [{ name: 'Government', weight: 1 }],
          symbol: 'BND',
          valueInBaseCurrency: 100
        },
        VEA: {
          assetClass: 'ETF',
          name: 'VEA',
          sectors: [{ name: 'Industrials', weight: 1 }],
          symbol: 'VEA',
          valueInBaseCurrency: 100
        },
        VNQ: {
          assetClass: 'REAL_ESTATE',
          name: 'VNQ',
          sectors: [{ name: 'Real Estate', weight: 1 }],
          symbol: 'VNQ',
          valueInBaseCurrency: 100
        },
        GLD: {
          assetClass: 'COMMODITY',
          name: 'GLD',
          sectors: [{ name: 'Metals', weight: 1 }],
          symbol: 'GLD',
          valueInBaseCurrency: 100
        }
      },
      summary: {
        cash: 0,
        totalValueInBaseCurrency: 500
      }
    });

    const result = await tool.execute(
      {
        rules: {
          restrictedSymbols: ['TSLA']
        }
      },
      { userId: 'u1' }
    );

    const restrictedSymbolsRule = result.results.find((ruleResult) => {
      return ruleResult.ruleId === 'restricted_symbols';
    });

    expect(restrictedSymbolsRule.status).toBe('fail');
    expect(result.overallStatus).toBe('NON_COMPLIANT');
  });

  it('fails minimum holdings rule for sparse portfolios', async () => {
    const tool = buildTool({
      holdings: {
        AAPL: {
          assetClass: 'EQUITY',
          name: 'Apple',
          sectors: [{ name: 'Technology', weight: 1 }],
          symbol: 'AAPL',
          valueInBaseCurrency: 500
        },
        BND: {
          assetClass: 'FIXED_INCOME',
          name: 'BND',
          sectors: [{ name: 'Government', weight: 1 }],
          symbol: 'BND',
          valueInBaseCurrency: 500
        }
      },
      summary: {
        cash: 0,
        totalValueInBaseCurrency: 1000
      }
    });

    const result = await tool.execute({}, { userId: 'u1' });

    const minHoldingsRule = result.results.find((ruleResult) => {
      return ruleResult.ruleId === 'min_holdings_count';
    });

    expect(minHoldingsRule.status).toBe('fail');
    expect(result.overallStatus).toBe('NON_COMPLIANT');
  });

  it('fails cash allocation rule when cash is above threshold', async () => {
    const tool = buildTool({
      holdings: {
        AAPL: {
          assetClass: 'EQUITY',
          name: 'Apple',
          sectors: [{ name: 'Technology', weight: 1 }],
          symbol: 'AAPL',
          valueInBaseCurrency: 500
        },
        BND: {
          assetClass: 'FIXED_INCOME',
          name: 'BND',
          sectors: [{ name: 'Government', weight: 1 }],
          symbol: 'BND',
          valueInBaseCurrency: 500
        },
        VEA: {
          assetClass: 'ETF',
          name: 'VEA',
          sectors: [{ name: 'Industrials', weight: 1 }],
          symbol: 'VEA',
          valueInBaseCurrency: 500
        },
        VNQ: {
          assetClass: 'REAL_ESTATE',
          name: 'VNQ',
          sectors: [{ name: 'Real Estate', weight: 1 }],
          symbol: 'VNQ',
          valueInBaseCurrency: 500
        },
        GLD: {
          assetClass: 'COMMODITY',
          name: 'GLD',
          sectors: [{ name: 'Metals', weight: 1 }],
          symbol: 'GLD',
          valueInBaseCurrency: 500
        }
      },
      summary: {
        cash: 2500,
        totalValueInBaseCurrency: 5000
      }
    });

    const result = await tool.execute({}, { userId: 'u1' });

    const cashRule = result.results.find((ruleResult) => {
      return ruleResult.ruleId === 'max_cash_allocation';
    });

    expect(cashRule.status).toBe('fail');
    expect(result.overallStatus).toBe('NON_COMPLIANT');
  });

  it('returns NEEDS_REVIEW with warnings for empty portfolio', async () => {
    const tool = buildTool({
      holdings: {},
      summary: {
        cash: 0,
        totalValueInBaseCurrency: 0
      }
    });

    const result = await tool.execute({}, { userId: 'u1' });

    expect(result.overallStatus).toBe('NEEDS_REVIEW');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'empty_portfolio',
          message:
            'No holdings are available; concentration and diversification checks are limited.'
        }
      ])
    );

    expect(
      result.results
        .filter((ruleResult) => {
          return [
            'max_single_position',
            'max_top3_concentration',
            'max_sector_concentration',
            'max_asset_class_concentration'
          ].includes(ruleResult.ruleId);
        })
        .every((ruleResult) => ruleResult.status === 'skip')
    ).toBe(true);
  });
});
