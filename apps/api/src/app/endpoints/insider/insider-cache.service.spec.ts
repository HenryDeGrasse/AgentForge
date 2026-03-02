import type { NormalizedInsiderTx } from './providers/insider-data-provider.interface';

import { InsiderCacheService } from './insider-cache.service';

function buildTx(
  overrides: Partial<NormalizedInsiderTx> = {}
): NormalizedInsiderTx {
  return {
    insiderName: 'Jane Doe',
    insiderRelation: 'CEO',
    price: 100,
    shares: 1000,
    side: 'sell',
    sourceKey: `key-${Math.random()}`,
    sourceProvider: 'stub',
    sourceUrl: 'https://sec.gov/example',
    symbol: 'AAPL',
    txDate: new Date('2026-02-20'),
    valueUsd: 100_000,
    warnings: [],
    ...overrides
  };
}

function buildPrisma() {
  return {
    insiderTransaction: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({})
    }
  };
}

describe('InsiderCacheService', () => {
  describe('upsertTransactions', () => {
    it('inserts new transactions when sourceKey does not exist', async () => {
      const prisma = buildPrisma();
      const cache = new InsiderCacheService(prisma as any);
      const tx = buildTx({ sourceKey: 'unique-key-1' });

      const result = await cache.upsertTransactions([tx]);

      expect(result.inserted).toBe(1);
      expect(result.updated).toBe(0);
      expect(prisma.insiderTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceKey: 'unique-key-1',
            symbol: 'AAPL'
          })
        })
      );
    });

    it('updates existing transactions when sourceKey exists', async () => {
      const prisma = buildPrisma();
      prisma.insiderTransaction.findUnique.mockResolvedValue({
        id: 'existing-id',
        sourceKey: 'existing-key'
      });

      const cache = new InsiderCacheService(prisma as any);
      const tx = buildTx({ sourceKey: 'existing-key' });

      const result = await cache.upsertTransactions([tx]);

      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(1);
      expect(prisma.insiderTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sourceKey: 'existing-key' }
        })
      );
    });

    it('handles errors gracefully and continues processing', async () => {
      const prisma = buildPrisma();
      prisma.insiderTransaction.findUnique.mockRejectedValueOnce(
        new Error('DB error')
      );

      const cache = new InsiderCacheService(prisma as any);
      const tx1 = buildTx({ sourceKey: 'bad-key' });
      const tx2 = buildTx({ sourceKey: 'good-key' });

      const result = await cache.upsertTransactions([tx1, tx2]);

      // First failed, second succeeded
      expect(result.inserted).toBe(1);
    });

    it('uppercases symbol on insert', async () => {
      const prisma = buildPrisma();
      const cache = new InsiderCacheService(prisma as any);
      const tx = buildTx({ sourceKey: 'k1', symbol: 'aapl' });

      await cache.upsertTransactions([tx]);

      expect(prisma.insiderTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ symbol: 'AAPL' })
        })
      );
    });
  });

  describe('queryTransactions', () => {
    it('queries with symbol and date filter', async () => {
      const prisma = buildPrisma();
      const cache = new InsiderCacheService(prisma as any);

      await cache.queryTransactions({
        days: 30,
        symbols: ['AAPL', 'NVDA']
      });

      expect(prisma.insiderTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { txDate: 'desc' },
          where: expect.objectContaining({
            symbol: { in: ['AAPL', 'NVDA'] },
            txDate: { gte: expect.any(Date) }
          })
        })
      );
    });

    it('adds side filter when not "any"', async () => {
      const prisma = buildPrisma();
      const cache = new InsiderCacheService(prisma as any);

      await cache.queryTransactions({
        side: 'sell',
        symbols: ['AAPL']
      });

      const call = prisma.insiderTransaction.findMany.mock.calls[0][0];
      expect(call.where.side).toBe('sell');
    });

    it('does not add side filter for "any"', async () => {
      const prisma = buildPrisma();
      const cache = new InsiderCacheService(prisma as any);

      await cache.queryTransactions({
        side: 'any',
        symbols: ['AAPL']
      });

      const call = prisma.insiderTransaction.findMany.mock.calls[0][0];
      expect(call.where.side).toBeUndefined();
    });

    it('adds minValueUsd filter when provided', async () => {
      const prisma = buildPrisma();
      const cache = new InsiderCacheService(prisma as any);

      await cache.queryTransactions({
        minValueUsd: 100_000,
        symbols: ['AAPL']
      });

      const call = prisma.insiderTransaction.findMany.mock.calls[0][0];
      expect(call.where.valueUsd).toEqual({ gte: 100_000 });
    });
  });
});
