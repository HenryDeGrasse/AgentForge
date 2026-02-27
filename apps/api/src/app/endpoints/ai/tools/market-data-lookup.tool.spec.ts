import { MarketDataLookupTool } from './market-data-lookup.tool';

describe('MarketDataLookupTool', () => {
  it('returns quote and profile metadata for a valid symbol', async () => {
    const symbolService = {
      get: jest.fn().mockResolvedValue({
        currency: 'USD',
        dataSource: 'YAHOO',
        historicalData: [],
        marketPrice: 182.42,
        symbol: 'AAPL'
      }),
      lookup: jest.fn()
    };

    const symbolProfileService = {
      getSymbolProfiles: jest.fn().mockResolvedValue([
        {
          assetClass: 'EQUITY',
          assetSubClass: 'US_EQUITY',
          countries: [{ code: 'US', weight: 1 }],
          name: 'Apple Inc.',
          sectors: [{ name: 'Technology', weight: 0.95 }]
        }
      ])
    };

    const marketDataLookupTool = new MarketDataLookupTool(
      symbolService as any,
      symbolProfileService as any,
      {
        user: jest.fn()
      } as any
    );

    const result = await marketDataLookupTool.execute(
      {
        symbol: 'AAPL'
      },
      { userId: 'user-1' }
    );

    expect(symbolService.get).toHaveBeenCalledWith({
      dataGatheringItem: {
        dataSource: 'YAHOO',
        symbol: 'AAPL'
      },
      includeHistoricalData: 0
    });

    expect(result).toMatchObject({
      assetClass: 'EQUITY',
      assetSubClass: 'US_EQUITY',
      countries: [{ code: 'US', weight: 1 }],
      currency: 'USD',
      dataSource: 'YAHOO',
      marketPrice: 182.42,
      name: 'Apple Inc.',
      sectors: [{ name: 'Technology', weight: 0.95 }],
      symbol: 'AAPL'
    });

    expect(result.priceChange).toEqual({
      absoluteChange: 0,
      percentChange: 0,
      periodDays: 0
    });
    expect(result.historicalData).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('includes historical prices and computes deterministic price change', async () => {
    const marketDataLookupTool = new MarketDataLookupTool(
      {
        get: jest.fn().mockResolvedValue({
          currency: 'USD',
          dataSource: 'YAHOO',
          historicalData: [
            {
              date: '2025-01-01T00:00:00.000Z',
              value: 100
            },
            {
              date: '2025-01-31T00:00:00.000Z',
              value: 125
            }
          ],
          marketPrice: 125,
          symbol: 'MSFT'
        }),
        lookup: jest.fn()
      } as any,
      {
        getSymbolProfiles: jest.fn().mockResolvedValue([
          {
            assetClass: 'EQUITY',
            assetSubClass: 'US_EQUITY',
            countries: [],
            name: 'Microsoft',
            sectors: []
          }
        ])
      } as any,
      {
        user: jest.fn()
      } as any
    );

    const result = await marketDataLookupTool.execute(
      {
        historyDays: 30,
        includeHistory: true,
        symbol: 'MSFT'
      },
      { userId: 'user-1' }
    );

    expect(result.historicalData).toEqual([
      {
        date: '2025-01-01T00:00:00.000Z',
        marketPrice: 100
      },
      {
        date: '2025-01-31T00:00:00.000Z',
        marketPrice: 125
      }
    ]);

    expect(result.priceChange).toEqual({
      absoluteChange: 25,
      percentChange: 25, // whole-number percentage: 25/100 * 100 = 25%
      periodDays: 30
    });

    expect(result.warnings).toEqual([]);
  });

  it('uses lookup fallback when direct symbol fetch misses', async () => {
    const symbolService = {
      get: jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce({
        currency: 'USD',
        dataSource: 'YAHOO',
        historicalData: [],
        marketPrice: 210,
        symbol: 'TSLA'
      }),
      lookup: jest.fn().mockResolvedValue({
        items: [
          {
            assetClass: 'EQUITY',
            assetSubClass: 'US_EQUITY',
            currency: 'USD',
            dataProviderInfo: {},
            dataSource: 'YAHOO',
            name: 'Tesla',
            symbol: 'TSLA'
          }
        ]
      })
    };

    const marketDataLookupTool = new MarketDataLookupTool(
      symbolService as any,
      {
        getSymbolProfiles: jest.fn().mockResolvedValue([
          {
            assetClass: 'EQUITY',
            assetSubClass: 'US_EQUITY',
            countries: [],
            name: 'Tesla',
            sectors: []
          }
        ])
      } as any,
      {
        user: jest.fn().mockResolvedValue({
          settings: { settings: { baseCurrency: 'USD' } }
        })
      } as any
    );

    const result = await marketDataLookupTool.execute(
      {
        symbol: 'Tesla'
      },
      { userId: 'user-1' }
    );

    expect(symbolService.lookup).toHaveBeenCalled();
    expect(result.symbol).toBe('TSLA');
    expect(result.warnings).toEqual([
      {
        code: 'resolved_symbol_lookup',
        message: 'Input symbol was resolved via symbol lookup to TSLA on YAHOO.'
      }
    ]);
  });

  it('returns safe defaults and warnings when profile metadata is missing', async () => {
    const marketDataLookupTool = new MarketDataLookupTool(
      {
        get: jest.fn().mockResolvedValue({
          currency: 'USD',
          dataSource: 'YAHOO',
          historicalData: [],
          marketPrice: 90,
          symbol: 'ABC'
        }),
        lookup: jest.fn()
      } as any,
      {
        getSymbolProfiles: jest.fn().mockResolvedValue([])
      } as any,
      {
        user: jest.fn()
      } as any
    );

    const result = await marketDataLookupTool.execute(
      {
        symbol: 'ABC'
      },
      { userId: 'user-1' }
    );

    expect(result.assetClass).toBe('');
    expect(result.assetSubClass).toBe('');
    expect(result.sectors).toEqual([]);
    expect(result.countries).toEqual([]);
    expect(result.priceChange).toEqual({
      absoluteChange: 0,
      percentChange: 0,
      periodDays: 0
    });
    expect(result.warnings).toEqual([
      {
        code: 'missing_symbol_profile',
        message: 'No symbol profile metadata was found for YAHOO:ABC.'
      }
    ]);
  });

  it('warns when market price is missing or non-positive', async () => {
    const marketDataLookupTool = new MarketDataLookupTool(
      {
        get: jest.fn().mockResolvedValue({
          currency: 'USD',
          dataSource: 'YAHOO',
          historicalData: [],
          marketPrice: 0,
          symbol: 'QQQ'
        }),
        lookup: jest.fn()
      } as any,
      {
        getSymbolProfiles: jest.fn().mockResolvedValue([
          {
            assetClass: 'ETF',
            assetSubClass: 'US_ETF',
            countries: [],
            name: 'Invesco QQQ',
            sectors: []
          }
        ])
      } as any,
      {
        user: jest.fn()
      } as any
    );

    const result = await marketDataLookupTool.execute(
      {
        symbol: 'QQQ'
      },
      { userId: 'user-1' }
    );

    expect(result.marketPrice).toBe(0);
    expect(result.warnings).toEqual([
      {
        code: 'missing_market_price',
        message: 'Market price is missing or non-positive for YAHOO:QQQ.'
      }
    ]);
  });
});
