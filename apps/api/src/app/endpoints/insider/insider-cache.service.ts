import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Injectable, Logger } from '@nestjs/common';

import type { NormalizedInsiderTx } from './providers/insider-data-provider.interface';

@Injectable()
export class InsiderCacheService {
  public constructor(private readonly prismaService: PrismaService) {}

  /**
   * Upsert normalized transactions into the cache by sourceKey.
   * Returns count of newly inserted records.
   */
  public async upsertTransactions(
    transactions: NormalizedInsiderTx[]
  ): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;

    for (const tx of transactions) {
      try {
        const existing =
          await this.prismaService.insiderTransaction.findUnique({
            where: { sourceKey: tx.sourceKey }
          });

        if (existing) {
          await this.prismaService.insiderTransaction.update({
            data: {
              insiderName: tx.insiderName,
              insiderRelation: tx.insiderRelation,
              price: tx.price,
              shares: tx.shares,
              side: tx.side,
              sourceUrl: tx.sourceUrl,
              valueUsd: tx.valueUsd
            },
            where: { sourceKey: tx.sourceKey }
          });
          updated++;
        } else {
          await this.prismaService.insiderTransaction.create({
            data: {
              insiderName: tx.insiderName,
              insiderRelation: tx.insiderRelation,
              price: tx.price,
              shares: tx.shares,
              side: tx.side,
              sourceKey: tx.sourceKey,
              sourceProvider: tx.sourceProvider,
              sourceUrl: tx.sourceUrl,
              symbol: tx.symbol.toUpperCase(),
              txDate: tx.txDate,
              valueUsd: tx.valueUsd
            }
          });
          inserted++;
        }
      } catch (error) {
        Logger.warn(
          `Failed to upsert insider tx ${tx.sourceKey}: ${error instanceof Error ? error.message : error}`,
          'InsiderCacheService'
        );
      }
    }

    return { inserted, updated };
  }

  /**
   * Query cached transactions by symbols and date range.
   */
  public async queryTransactions({
    days = 30,
    minValueUsd,
    side,
    symbols
  }: {
    days?: number;
    minValueUsd?: number;
    side?: 'any' | 'buy' | 'sell';
    symbols: string[];
  }) {
    const cutoff = new Date(Date.now() - days * 86400000);

    const where: Record<string, unknown> = {
      txDate: { gte: cutoff }
    };

    if (symbols.length > 0) {
      where.symbol = {
        in: symbols.map((s) => s.toUpperCase())
      };
    }

    if (side && side !== 'any') {
      where.side = side;
    }

    if (minValueUsd != null && minValueUsd > 0) {
      where.valueUsd = { gte: minValueUsd };
    }

    return this.prismaService.insiderTransaction.findMany({
      orderBy: { txDate: 'desc' },
      where: where as any
    });
  }
}
