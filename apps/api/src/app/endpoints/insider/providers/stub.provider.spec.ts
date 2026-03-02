import { StubInsiderDataProvider } from './stub.provider';

describe('StubInsiderDataProvider', () => {
  let provider: StubInsiderDataProvider;

  beforeEach(() => {
    provider = new StubInsiderDataProvider();
  });

  it('has name "stub"', () => {
    expect(provider.name).toBe('stub');
  });

  it('returns transactions for known symbols', async () => {
    const result = await provider.fetchInsiderActivity({
      days: 30,
      symbols: ['NVDA']
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].symbol).toBe('NVDA');
    expect(result[0].insiderName).toBe('Jensen Huang');
  });

  it('returns empty for unknown symbols', async () => {
    const result = await provider.fetchInsiderActivity({
      days: 30,
      symbols: ['ZZZZZZ']
    });

    expect(result).toEqual([]);
  });

  it('filters by date range', async () => {
    const result = await provider.fetchInsiderActivity({
      days: 1, // Very short window - may exclude some stub data
      symbols: ['AAPL']
    });

    // Stub AAPL tx is 7 days ago, so 1-day window should exclude it
    expect(result).toEqual([]);
  });

  it('returns all stub symbols when no symbol filter given', async () => {
    const result = await provider.fetchInsiderActivity({
      days: 30,
      symbols: []
    });

    // Stub has 5 entries: NVDA, AMD, AAPL, MSFT, AMZN
    expect(result.length).toBeGreaterThanOrEqual(3);
    const symbols = [...new Set(result.map((tx) => tx.symbol))];
    expect(symbols.length).toBeGreaterThan(1);
  });

  it('returns properly shaped NormalizedInsiderTx objects', async () => {
    const result = await provider.fetchInsiderActivity({
      days: 30,
      symbols: ['NVDA']
    });

    const tx = result[0];
    expect(tx).toMatchObject({
      insiderName: expect.any(String),
      side: expect.stringMatching(/^(buy|sell|other)$/),
      sourceKey: expect.any(String),
      sourceProvider: 'stub',
      symbol: 'NVDA',
      txDate: expect.any(Date),
      warnings: expect.any(Array)
    });
  });
});
