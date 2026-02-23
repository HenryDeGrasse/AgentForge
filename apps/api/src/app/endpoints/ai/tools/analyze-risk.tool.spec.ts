import { AnalyzeRiskTool } from './analyze-risk.tool';

describe('AnalyzeRiskTool', () => {
  it('flags concentration, sector concentration and elevated volatility risk', async () => {
    const analyzeRiskTool = new AnalyzeRiskTool(
      {
        getDetails: jest.fn().mockResolvedValue({
          createdAt: new Date('2025-02-01T00:00:00.000Z'),
          holdings: {
            AAPL: {
              allocationInPercentage: 0.45,
              assetClass: 'EQUITY',
              currency: 'USD',
              name: 'Apple',
              sectors: [{ name: 'Technology', weight: 1 }],
              symbol: 'AAPL',
              valueInBaseCurrency: 450
            },
            BND: {
              allocationInPercentage: 0.2,
              assetClass: 'FIXED_INCOME',
              currency: 'USD',
              name: 'Vanguard Total Bond',
              sectors: [],
              symbol: 'BND',
              valueInBaseCurrency: 200
            },
            MSFT: {
              allocationInPercentage: 0.35,
              assetClass: 'EQUITY',
              currency: 'USD',
              name: 'Microsoft',
              sectors: [{ name: 'Technology', weight: 1 }],
              symbol: 'MSFT',
              valueInBaseCurrency: 350
            }
          },
          summary: {
            cash: 0,
            totalValueInBaseCurrency: 1000
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

    const result = await analyzeRiskTool.execute(
      {},
      {
        userId: 'user-1'
      }
    );

    expect(result.status).toBe('success');

    expect(result.data).toMatchObject({
      baseCurrency: 'USD',
      exposures: {
        top3AllocationInPortfolio: 1
      },
      holdingsCount: 3,
      overallRiskLevel: 'HIGH'
    });

    expect(result.data.flags.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'single_position_concentration',
        'top3_concentration',
        'sector_concentration',
        'volatility_proxy_high'
      ])
    );
  });

  it('returns a safe partial response for sparse portfolios', async () => {
    const analyzeRiskTool = new AnalyzeRiskTool(
      {
        getDetails: jest.fn().mockResolvedValue({
          createdAt: new Date('2025-02-01T00:00:00.000Z'),
          holdings: {
            AAPL: {
              allocationInPercentage: 1,
              assetClass: 'EQUITY',
              currency: 'USD',
              name: 'Apple',
              sectors: [],
              symbol: 'AAPL',
              valueInBaseCurrency: 1000
            }
          },
          summary: {
            cash: 0,
            totalValueInBaseCurrency: 1000
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

    const result = await analyzeRiskTool.execute(
      {},
      {
        userId: 'user-1'
      }
    );

    expect(result.status).toBe('partial');
    expect(result.data.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'sparse_portfolio',
          message:
            'Risk analysis is less reliable because fewer than 3 holdings are available.'
        }
      ])
    );
  });

  it('returns a safe partial response when no holdings are available', async () => {
    const analyzeRiskTool = new AnalyzeRiskTool(
      {
        getDetails: jest.fn().mockResolvedValue({
          createdAt: new Date('2025-02-01T00:00:00.000Z'),
          holdings: {},
          summary: {
            cash: 0,
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

    const result = await analyzeRiskTool.execute(
      {},
      {
        userId: 'user-1'
      }
    );

    expect(result.status).toBe('partial');
    expect(result.data.flags).toEqual([]);
    expect(result.data.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'no_holdings_data',
          message: 'No holdings are available to analyze portfolio risk.'
        },
        {
          code: 'non_positive_portfolio_total',
          message:
            'Total portfolio value is zero or negative; allocations may be unstable.'
        }
      ])
    );
  });
});
