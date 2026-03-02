import { SecApiInsiderDataProvider } from './sec-api.provider';

describe('SecApiInsiderDataProvider', () => {
  it('has name "sec_api"', () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) };
    const provider = new SecApiInsiderDataProvider(configService as any);
    expect(provider.name).toBe('sec_api');
  });

  it('returns empty results when SEC_API_KEY is not configured', async () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) };
    const provider = new SecApiInsiderDataProvider(configService as any);

    const result = await provider.fetchInsiderActivity({
      days: 30,
      symbols: ['AAPL']
    });

    expect(result).toEqual([]);
  });

  describe('normalizeSide (via fetch)', () => {
    let provider: SecApiInsiderDataProvider;

    beforeEach(() => {
      const configService = { get: jest.fn().mockReturnValue('test-key') };
      provider = new SecApiInsiderDataProvider(configService as any);
    });

    it('normalizes purchase transactions to "buy"', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue([
          {
            acquisitionOrDisposition: 'A',
            filingDate: '2026-02-25',
            periodOfReport: '2026-02-25',
            price: '150.00',
            relationship: 'CEO',
            reportingOwner: 'Tim Cook',
            securitiesTransacted: '10000',
            transactionType: 'Purchase'
          }
        ]),
        ok: true
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse as any);

      const result = await provider.fetchInsiderActivity({
        days: 30,
        symbols: ['AAPL']
      });

      expect(result[0].side).toBe('buy');
      expect(result[0].insiderName).toBe('Tim Cook');
      expect(result[0].valueUsd).toBe(1_500_000);

      (global.fetch as jest.Mock).mockRestore();
    });

    it('normalizes sale/disposition transactions to "sell"', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue([
          {
            acquisitionOrDisposition: 'D',
            filingDate: '2026-02-25',
            periodOfReport: '2026-02-25',
            price: '135.50',
            reportingOwner: 'Jensen Huang',
            securitiesTransacted: '100000',
            transactionType: 'Sale'
          }
        ]),
        ok: true
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse as any);

      const result = await provider.fetchInsiderActivity({
        days: 30,
        symbols: ['NVDA']
      });

      expect(result[0].side).toBe('sell');

      (global.fetch as jest.Mock).mockRestore();
    });

    it('generates unique sourceKeys including transactionCode', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue([
          {
            filingDate: '2026-02-25',
            periodOfReport: '2026-02-25',
            price: '100',
            reportingOwner: 'Jane Doe',
            securitiesTransacted: '1000',
            transactionCode: 'P',
            transactionType: 'Purchase'
          },
          {
            filingDate: '2026-02-25',
            periodOfReport: '2026-02-25',
            price: '100',
            reportingOwner: 'Jane Doe',
            securitiesTransacted: '2000',
            transactionCode: 'A',
            transactionType: 'Grant'
          }
        ]),
        ok: true
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse as any);

      const result = await provider.fetchInsiderActivity({
        days: 30,
        symbols: ['TEST']
      });

      expect(result).toHaveLength(2);
      expect(result[0].sourceKey).not.toBe(result[1].sourceKey);

      (global.fetch as jest.Mock).mockRestore();
    });

    it('handles API errors gracefully per symbol', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: false, status: 429 } as any)
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValue([]),
          ok: true
        } as any);

      const result = await provider.fetchInsiderActivity({
        days: 30,
        symbols: ['BAD', 'GOOD']
      });

      // Should not throw; returns results from successful calls
      expect(result).toEqual([]);

      (global.fetch as jest.Mock).mockRestore();
    });
  });
});
