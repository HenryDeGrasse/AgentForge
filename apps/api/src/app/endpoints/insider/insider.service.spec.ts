import { InsiderCacheService } from './insider-cache.service';
import { InsiderService } from './insider.service';
import type {
  InsiderDataProvider,
  NormalizedInsiderTx
} from './providers/insider-data-provider.interface';

function buildStubTx(
  overrides: Partial<NormalizedInsiderTx> = {}
): NormalizedInsiderTx {
  return {
    insiderName: 'Jane Doe',
    insiderRelation: 'CEO',
    price: 100,
    shares: 1000,
    side: 'sell',
    sourceKey: `stub-${Date.now()}-${Math.random()}`,
    sourceProvider: 'stub',
    sourceUrl: 'https://sec.gov/example',
    symbol: 'AAPL',
    txDate: new Date(),
    valueUsd: 100_000,
    warnings: [],
    ...overrides
  };
}

function buildMocks() {
  const dataProvider: jest.Mocked<InsiderDataProvider> = {
    fetchInsiderActivity: jest.fn().mockResolvedValue([]),
    name: 'stub'
  };

  const cacheService = {
    queryTransactions: jest.fn().mockResolvedValue([]),
    upsertTransactions: jest.fn().mockResolvedValue({ inserted: 0, updated: 0 })
  } as jest.Mocked<
    Pick<InsiderCacheService, 'queryTransactions' | 'upsertTransactions'>
  >;

  const portfolioService = {
    getDetails: jest.fn().mockResolvedValue({
      holdings: {
        AAPL: { symbol: 'AAPL', valueInBaseCurrency: 10000 },
        NVDA: { symbol: 'NVDA', valueInBaseCurrency: 5000 }
      }
    })
  };

  const prismaService = {
    insiderMonitoringRule: {
      create: jest.fn().mockResolvedValue({
        id: 'rule-1',
        isActive: true,
        lookbackDays: 30,
        minValueUsd: null,
        scope: 'all_holdings',
        side: 'sell',
        symbols: null,
        topN: null,
        userId: 'user-1'
      }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 })
    }
  };

  const service = new InsiderService(
    cacheService as any,
    dataProvider,
    portfolioService as any,
    prismaService as any
  );

  return {
    cacheService,
    dataProvider,
    portfolioService,
    prismaService,
    service
  };
}

describe('InsiderService', () => {
  // ─── getInsiderActivity ───────────────────────────────────────────────────

  describe('getInsiderActivity', () => {
    it('returns empty result with warning when no symbols provided', async () => {
      const { service } = buildMocks();
      const result = await service.getInsiderActivity({ symbols: [] });

      expect(result.transactions).toEqual([]);
      expect(result.warnings).toContain('No symbols provided');
    });

    it('fetches from provider and caches results', async () => {
      const tx = buildStubTx({ symbol: 'NVDA' });
      const { cacheService, dataProvider, service } = buildMocks();
      dataProvider.fetchInsiderActivity.mockResolvedValue([tx]);

      const result = await service.getInsiderActivity({
        days: 30,
        symbols: ['NVDA']
      });

      expect(dataProvider.fetchInsiderActivity).toHaveBeenCalledWith({
        days: 30,
        symbols: ['NVDA']
      });
      expect(cacheService.upsertTransactions).toHaveBeenCalledWith([tx]);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].symbol).toBe('NVDA');
    });

    it('adds warning for unknown symbols with no results', async () => {
      const { dataProvider, service } = buildMocks();
      dataProvider.fetchInsiderActivity.mockResolvedValue([]);

      const result = await service.getInsiderActivity({
        symbols: ['ZZZZ']
      });

      expect(result.warnings).toContain(
        'No insider activity found for ZZZZ in the last 30 days.'
      );
    });

    it('handles provider errors gracefully', async () => {
      const { dataProvider, service } = buildMocks();
      dataProvider.fetchInsiderActivity.mockRejectedValue(
        new Error('API timeout')
      );

      const result = await service.getInsiderActivity({
        symbols: ['AAPL']
      });

      expect(result.transactions).toEqual([]);
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('returned an error')])
      );
    });

    it('does not call cache upsert when no transactions returned', async () => {
      const { cacheService, dataProvider, service } = buildMocks();
      dataProvider.fetchInsiderActivity.mockResolvedValue([]);

      await service.getInsiderActivity({ symbols: ['AAPL'] });

      expect(cacheService.upsertTransactions).not.toHaveBeenCalled();
    });
  });

  // ─── getPortfolioInsiderActivity ──────────────────────────────────────────

  describe('getPortfolioInsiderActivity', () => {
    it('resolves symbols from portfolio and fetches activity', async () => {
      const tx = buildStubTx({ symbol: 'AAPL' });
      const { dataProvider, service } = buildMocks();
      dataProvider.fetchInsiderActivity.mockResolvedValue([tx]);

      const result = await service.getPortfolioInsiderActivity({
        userId: 'user-1'
      });

      expect(result.symbols).toEqual(['AAPL', 'NVDA']);
      expect(result.transactions).toHaveLength(1);
    });

    it('returns warning when portfolio has no holdings', async () => {
      const { portfolioService, service } = buildMocks();
      portfolioService.getDetails.mockResolvedValue({ holdings: {} });

      const result = await service.getPortfolioInsiderActivity({
        userId: 'user-1'
      });

      expect(result.warnings).toContain('No portfolio holdings found.');
      expect(result.symbols).toEqual([]);
    });
  });

  // ─── resolvePortfolioSymbols ──────────────────────────────────────────────

  describe('resolvePortfolioSymbols', () => {
    it('returns top N symbols sorted by value', async () => {
      const { service } = buildMocks();
      const symbols = await service.resolvePortfolioSymbols({
        topN: 1,
        userId: 'user-1'
      });

      expect(symbols).toEqual(['AAPL']); // AAPL has higher value
    });

    it('returns empty array on portfolio error', async () => {
      const { portfolioService, service } = buildMocks();
      portfolioService.getDetails.mockRejectedValue(new Error('Not found'));

      const symbols = await service.resolvePortfolioSymbols({
        userId: 'user-1'
      });

      expect(symbols).toEqual([]);
    });
  });

  // ─── Monitoring Rules CRUD ────────────────────────────────────────────────

  describe('createRule', () => {
    it('creates a monitoring rule via prisma', async () => {
      const { prismaService, service } = buildMocks();

      const result = await service.createRule({
        scope: 'all_holdings',
        side: 'sell',
        userId: 'user-1'
      });

      expect(prismaService.insiderMonitoringRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope: 'all_holdings',
            side: 'sell',
            userId: 'user-1'
          })
        })
      );
      expect(result.id).toBe('rule-1');
    });
  });

  describe('listRules', () => {
    it('returns rules for the given user', async () => {
      const { prismaService, service } = buildMocks();
      const mockRules = [
        { id: 'r1', isActive: true, scope: 'symbols', side: 'any' }
      ];
      prismaService.insiderMonitoringRule.findMany.mockResolvedValue(
        mockRules as any
      );

      const result = await service.listRules({ userId: 'user-1' });

      expect(result).toEqual(mockRules);
      expect(prismaService.insiderMonitoringRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      );
    });
  });

  describe('updateRule', () => {
    it('updates rule scoped to userId', async () => {
      const { prismaService, service } = buildMocks();

      await service.updateRule({
        id: 'rule-1',
        updates: { isActive: false },
        userId: 'user-1'
      });

      expect(
        prismaService.insiderMonitoringRule.updateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rule-1', userId: 'user-1' }
        })
      );
    });
  });

  describe('deleteRule', () => {
    it('deletes rule scoped to userId', async () => {
      const { prismaService, service } = buildMocks();

      const result = await service.deleteRule({
        id: 'rule-1',
        userId: 'user-1'
      });

      expect(result.count).toBe(1);
      expect(
        prismaService.insiderMonitoringRule.deleteMany
      ).toHaveBeenCalledWith({
        where: { id: 'rule-1', userId: 'user-1' }
      });
    });
  });

  // ─── Session Briefing ─────────────────────────────────────────────────────

  describe('evaluateRulesForBriefing', () => {
    it('returns empty when no active rules exist', async () => {
      const { service } = buildMocks();

      const result = await service.evaluateRulesForBriefing({
        userId: 'user-1'
      });

      expect(result.rulesEvaluated).toBe(0);
      expect(result.briefingItems).toEqual([]);
    });

    it('evaluates rules and returns triggered briefing items', async () => {
      const { cacheService, prismaService, service } = buildMocks();

      prismaService.insiderMonitoringRule.findMany.mockResolvedValue([
        {
          id: 'r1',
          isActive: true,
          lastNotifiedAt: null,
          lookbackDays: 30,
          minValueUsd: 100_000,
          scope: 'symbols',
          side: 'sell',
          symbols: '["NVDA"]',
          topN: null,
          userId: 'user-1'
        }
      ] as any);

      cacheService.queryTransactions.mockResolvedValue([
        {
          insiderName: 'Jensen Huang',
          side: 'sell',
          symbol: 'NVDA',
          txDate: new Date('2026-02-25'),
          valueUsd: 13_550_000
        }
      ] as any);

      const result = await service.evaluateRulesForBriefing({
        userId: 'user-1'
      });

      expect(result.rulesEvaluated).toBe(1);
      expect(result.briefingItems).toHaveLength(1);
      expect(result.briefingItems[0]).toMatchObject({
        insiderName: 'Jensen Huang',
        ruleId: 'r1',
        side: 'sell',
        symbol: 'NVDA'
      });

      // Should update lastCheckedAt
      expect(prismaService.insiderMonitoringRule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { lastCheckedAt: expect.any(Date) },
          where: { id: 'r1' }
        })
      );
    });

    it('limits briefing items to top 3', async () => {
      const { cacheService, prismaService, service } = buildMocks();

      prismaService.insiderMonitoringRule.findMany.mockResolvedValue([
        {
          id: 'r1',
          isActive: true,
          lastNotifiedAt: null,
          lookbackDays: 30,
          minValueUsd: null,
          scope: 'symbols',
          side: 'any',
          symbols: '["AAPL","NVDA","MSFT","AMZN"]',
          topN: null,
          userId: 'user-1'
        }
      ] as any);

      cacheService.queryTransactions.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({
          insiderName: `Insider ${i}`,
          side: 'sell',
          symbol: `SYM${i}`,
          txDate: new Date(),
          valueUsd: 100_000
        })) as any
      );

      const result = await service.evaluateRulesForBriefing({
        userId: 'user-1'
      });

      expect(result.briefingItems).toHaveLength(3);
    });

    it('skips transactions already notified', async () => {
      const { cacheService, prismaService, service } = buildMocks();

      const lastNotified = new Date('2026-02-28');

      prismaService.insiderMonitoringRule.findMany.mockResolvedValue([
        {
          id: 'r1',
          isActive: true,
          lastNotifiedAt: lastNotified,
          lookbackDays: 30,
          minValueUsd: null,
          scope: 'symbols',
          side: 'sell',
          symbols: '["AAPL"]',
          topN: null,
          userId: 'user-1'
        }
      ] as any);

      cacheService.queryTransactions.mockResolvedValue([
        {
          insiderName: 'Old Trade',
          side: 'sell',
          symbol: 'AAPL',
          txDate: new Date('2026-02-27'), // Before lastNotifiedAt
          valueUsd: 500_000
        }
      ] as any);

      const result = await service.evaluateRulesForBriefing({
        userId: 'user-1'
      });

      expect(result.briefingItems).toHaveLength(0);
    });
  });

  // ─── markRulesNotified ────────────────────────────────────────────────────

  describe('markRulesNotified', () => {
    it('updates lastNotifiedAt and agentNotes for given rule IDs', async () => {
      const { prismaService, service } = buildMocks();

      await service.markRulesNotified({
        notes: 'Briefing delivered',
        ruleIds: ['r1', 'r2'],
        userId: 'user-1'
      });

      expect(
        prismaService.insiderMonitoringRule.updateMany
      ).toHaveBeenCalledTimes(2);

      for (const call of prismaService.insiderMonitoringRule.updateMany.mock
        .calls) {
        expect(call[0].data).toMatchObject({
          agentNotes: 'Briefing delivered',
          lastNotifiedAt: expect.any(Date)
        });
        expect(call[0].where.userId).toBe('user-1');
      }
    });
  });
});
