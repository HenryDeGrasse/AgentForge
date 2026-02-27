import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { InsiderCacheService } from './insider-cache.service';
import {
  INSIDER_DATA_PROVIDER_TOKEN,
  type InsiderDataProvider,
  type NormalizedInsiderTx
} from './providers/insider-data-provider.interface';

@Injectable()
export class InsiderService {
  public constructor(
    private readonly cacheService: InsiderCacheService,
    @Inject(INSIDER_DATA_PROVIDER_TOKEN)
    private readonly dataProvider: InsiderDataProvider,
    private readonly portfolioService: PortfolioService,
    private readonly prismaService: PrismaService
  ) {}

  /**
   * Fetch insider activity for given symbols. Fetches from provider,
   * caches results, and returns normalized data.
   */
  public async getInsiderActivity({
    days = 30,
    symbols
  }: {
    days?: number;
    symbols: string[];
  }): Promise<{
    providerName: string;
    transactions: NormalizedInsiderTx[];
    warnings: string[];
  }> {
    const warnings: string[] = [];

    if (symbols.length === 0) {
      return {
        providerName: this.dataProvider.name,
        transactions: [],
        warnings: ['No symbols provided']
      };
    }

    // Fetch from provider
    let transactions: NormalizedInsiderTx[] = [];

    try {
      transactions = await this.dataProvider.fetchInsiderActivity({
        days,
        symbols
      });
    } catch (error) {
      Logger.warn(
        `Provider ${this.dataProvider.name} failed: ${error instanceof Error ? error.message : error}`,
        'InsiderService'
      );
      warnings.push(
        `Provider ${this.dataProvider.name} returned an error. Results may be incomplete.`
      );
    }

    // Cache results
    if (transactions.length > 0) {
      const { inserted } =
        await this.cacheService.upsertTransactions(transactions);
      Logger.log(
        `Cached ${inserted} new insider transactions`,
        'InsiderService'
      );
    }

    // Check for unknown symbols (no results)
    for (const symbol of symbols) {
      const hasResults = transactions.some(
        (tx) => tx.symbol.toUpperCase() === symbol.toUpperCase()
      );
      if (!hasResults) {
        warnings.push(
          `No insider activity found for ${symbol.toUpperCase()} in the last ${days} days.`
        );
      }
    }

    return {
      providerName: this.dataProvider.name,
      transactions,
      warnings
    };
  }

  /**
   * Fetch insider activity for a user's portfolio holdings.
   */
  public async getPortfolioInsiderActivity({
    days = 30,
    topN = 10,
    userId
  }: {
    days?: number;
    topN?: number;
    userId: string;
  }) {
    const symbols = await this.resolvePortfolioSymbols({ topN, userId });

    if (symbols.length === 0) {
      return {
        providerName: this.dataProvider.name,
        symbols: [],
        transactions: [],
        warnings: ['No portfolio holdings found.']
      };
    }

    const result = await this.getInsiderActivity({ days, symbols });
    return { ...result, symbols };
  }

  /**
   * Resolve user's top portfolio symbols.
   */
  public async resolvePortfolioSymbols({
    topN = 10,
    userId
  }: {
    topN?: number;
    userId: string;
  }): Promise<string[]> {
    try {
      const portfolioDetails = await this.portfolioService.getDetails({
        impersonationId: undefined,
        userId
      });

      const holdings = Object.values(portfolioDetails.holdings ?? {});

      return holdings
        .sort(
          (a, b) =>
            (b.valueInBaseCurrency ?? 0) - (a.valueInBaseCurrency ?? 0)
        )
        .slice(0, topN)
        .map((h) => h.symbol);
    } catch (error) {
      Logger.warn(
        `Failed to resolve portfolio symbols: ${error instanceof Error ? error.message : error}`,
        'InsiderService'
      );
      return [];
    }
  }

  // ─── Monitoring Rules CRUD ──────────────────────────────────────────

  public async createRule({
    lookbackDays = 30,
    minValueUsd,
    scope,
    side,
    symbols,
    topN,
    userId
  }: {
    lookbackDays?: number;
    minValueUsd?: number;
    scope: string;
    side: string;
    symbols?: string[];
    topN?: number;
    userId: string;
  }) {
    return this.prismaService.insiderMonitoringRule.create({
      data: {
        lookbackDays,
        minValueUsd,
        scope,
        side,
        symbols: symbols ? JSON.stringify(symbols) : undefined,
        topN,
        userId
      }
    });
  }

  public async listRules({ userId }: { userId: string }) {
    return this.prismaService.insiderMonitoringRule.findMany({
      orderBy: { updatedAt: 'desc' },
      where: { userId }
    });
  }

  public async updateRule({
    id,
    updates,
    userId
  }: {
    id: string;
    updates: {
      agentNotes?: string;
      isActive?: boolean;
      lastCheckedAt?: Date;
      lastNotifiedAt?: Date;
      lookbackDays?: number;
      minValueUsd?: number;
      scope?: string;
      side?: string;
      symbols?: string[];
      topN?: number;
    };
    userId: string;
  }) {
    return this.prismaService.insiderMonitoringRule.updateMany({
      data: {
        ...updates,
        symbols: updates.symbols
          ? JSON.stringify(updates.symbols)
          : undefined
      },
      where: { id, userId }
    });
  }

  public async deleteRule({
    id,
    userId
  }: {
    id: string;
    userId: string;
  }) {
    return this.prismaService.insiderMonitoringRule.deleteMany({
      where: { id, userId }
    });
  }

  // ─── Session Briefing ──────────────────────────────────────────────

  /**
   * Evaluate active monitoring rules and return triggered briefing items.
   * Called on chat start for session briefing injection.
   */
  public async evaluateRulesForBriefing({ userId }: { userId: string }) {
    const rules = await this.prismaService.insiderMonitoringRule.findMany({
      where: { isActive: true, userId }
    });

    if (rules.length === 0) {
      return { briefingItems: [], rulesEvaluated: 0 };
    }

    const briefingItems: {
      insiderName: string;
      ruleId: string;
      side: string;
      symbol: string;
      txDate: string;
      valueUsd: number | null;
    }[] = [];

    for (const rule of rules) {
      // Resolve symbols based on scope
      let symbols: string[] = [];

      if (rule.scope === 'symbols' && rule.symbols) {
        symbols =
          typeof rule.symbols === 'string'
            ? JSON.parse(rule.symbols)
            : (rule.symbols as string[]);
      } else if (rule.scope === 'top_n' || rule.scope === 'all_holdings') {
        symbols = await this.resolvePortfolioSymbols({
          topN: rule.scope === 'top_n' ? (rule.topN ?? 10) : 100,
          userId
        });
      }

      if (symbols.length === 0) continue;

      // Query cached transactions
      const transactions = await this.cacheService.queryTransactions({
        days: rule.lookbackDays,
        minValueUsd: rule.minValueUsd ?? undefined,
        side: rule.side as 'any' | 'buy' | 'sell',
        symbols
      });

      for (const tx of transactions) {
        // Skip if already notified after this tx
        if (rule.lastNotifiedAt && tx.txDate <= rule.lastNotifiedAt) {
          continue;
        }

        briefingItems.push({
          insiderName: tx.insiderName,
          ruleId: rule.id,
          side: tx.side,
          symbol: tx.symbol,
          txDate: tx.txDate.toISOString().split('T')[0],
          valueUsd: tx.valueUsd
        });
      }

      // Update lastCheckedAt
      await this.prismaService.insiderMonitoringRule.update({
        data: { lastCheckedAt: new Date() },
        where: { id: rule.id }
      });
    }

    return {
      briefingItems: briefingItems.slice(0, 3), // Top 3 triggers
      rulesEvaluated: rules.length
    };
  }

  /**
   * Mark rules as notified after briefing was delivered.
   */
  public async markRulesNotified({
    notes,
    ruleIds,
    userId
  }: {
    notes?: string;
    ruleIds: string[];
    userId: string;
  }) {
    const now = new Date();

    for (const id of ruleIds) {
      await this.prismaService.insiderMonitoringRule.updateMany({
        data: {
          agentNotes: notes ?? `Briefing delivered at ${now.toISOString()}`,
          lastNotifiedAt: now
        },
        where: { id, userId }
      });
    }
  }
}
