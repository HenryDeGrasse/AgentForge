import { GetInsiderActivityTool } from './get-insider-activity.tool';

function buildInsiderService(overrides: Record<string, jest.Mock> = {}) {
  return {
    getInsiderActivity: jest.fn().mockResolvedValue({
      providerName: 'stub',
      transactions: [
        {
          insiderName: 'Jensen Huang',
          insiderRelation: 'CEO',
          price: 135.5,
          shares: 100_000,
          side: 'sell',
          sourceUrl: 'https://sec.gov/example',
          symbol: 'NVDA',
          txDate: new Date('2026-02-25'),
          valueUsd: 13_550_000
        }
      ],
      warnings: []
    }),
    getPortfolioInsiderActivity: jest.fn().mockResolvedValue({
      providerName: 'stub',
      symbols: ['NVDA', 'AAPL'],
      transactions: [],
      warnings: []
    }),
    ...overrides
  };
}

const CONTEXT = { userId: 'user-1' };

describe('GetInsiderActivityTool', () => {
  it('has correct name and description', () => {
    const tool = new GetInsiderActivityTool(buildInsiderService() as any);
    expect(tool.name).toBe('get_insider_activity');
    expect(tool.description).toBeTruthy();
  });

  it('fetches activity for specific symbols', async () => {
    const insiderService = buildInsiderService();
    const tool = new GetInsiderActivityTool(insiderService as any);

    const result = await tool.execute({ symbols: ['NVDA'] }, CONTEXT);

    expect(insiderService.getInsiderActivity).toHaveBeenCalledWith({
      days: 30,
      symbols: ['NVDA']
    });
    expect(result.status).toBe('success');
    expect(result.data.transactions).toHaveLength(1);
    expect(result.data.transactions[0].symbol).toBe('NVDA');
    expect(result.data.disclaimers).toHaveLength(2);
  });

  it('falls back to portfolio when no symbols provided', async () => {
    const insiderService = buildInsiderService();
    const tool = new GetInsiderActivityTool(insiderService as any);

    await tool.execute({ symbols: [] }, CONTEXT);

    expect(insiderService.getPortfolioInsiderActivity).toHaveBeenCalledWith({
      days: 30,
      topN: 10,
      userId: 'user-1'
    });
  });

  it('caps days at 90', async () => {
    const insiderService = buildInsiderService();
    const tool = new GetInsiderActivityTool(insiderService as any);

    await tool.execute({ days: 365, symbols: ['AAPL'] }, CONTEXT);

    expect(insiderService.getInsiderActivity).toHaveBeenCalledWith({
      days: 90,
      symbols: ['AAPL']
    });
  });

  it('returns partial status when warnings present and no transactions', async () => {
    const insiderService = buildInsiderService({
      getInsiderActivity: jest.fn().mockResolvedValue({
        providerName: 'stub',
        transactions: [],
        warnings: ['No insider activity found for ZZZZ in the last 30 days.']
      })
    });
    const tool = new GetInsiderActivityTool(insiderService as any);

    const result = await tool.execute({ symbols: ['ZZZZ'] }, CONTEXT);

    expect(result.status).toBe('partial');
    expect(result.data.warnings).toHaveLength(1);
  });

  it('formats txDate as YYYY-MM-DD string', async () => {
    const insiderService = buildInsiderService();
    const tool = new GetInsiderActivityTool(insiderService as any);

    const result = await tool.execute({ symbols: ['NVDA'] }, CONTEXT);

    expect(result.data.transactions[0].txDate).toBe('2026-02-25');
  });
});
