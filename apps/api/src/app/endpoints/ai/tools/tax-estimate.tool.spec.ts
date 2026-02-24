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
