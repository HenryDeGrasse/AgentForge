import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  InsiderDataProvider,
  InsiderDataProviderQuery,
  NormalizedInsiderTx
} from './insider-data-provider.interface';

@Injectable()
export class SecApiInsiderDataProvider implements InsiderDataProvider {
  public readonly name = 'sec_api';

  private readonly apiKey: string | undefined;
  private readonly baseUrl = 'https://api.sec-api.io';

  public constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SEC_API_KEY');
  }

  public async fetchInsiderActivity(
    query: InsiderDataProviderQuery
  ): Promise<NormalizedInsiderTx[]> {
    if (!this.apiKey) {
      Logger.warn(
        'SEC_API_KEY not configured — returning empty results',
        'SecApiInsiderDataProvider'
      );
      return [];
    }

    const results: NormalizedInsiderTx[] = [];

    for (const symbol of query.symbols) {
      try {
        const url = `${this.baseUrl}/insider-trading?token=${this.apiKey}&ticker=${encodeURIComponent(symbol)}&limit=20`;

        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
          Logger.warn(
            `SEC API returned ${response.status} for ${symbol}`,
            'SecApiInsiderDataProvider'
          );
          continue;
        }

        const data = await response.json();
        const transactions = Array.isArray(data) ? data : data?.transactions ?? [];

        for (const tx of transactions) {
          const side = this.normalizeSide(tx.transactionType ?? tx.acquisitionOrDisposition);
          const shares = parseFloat(tx.securitiesTransacted) || undefined;
          const price = parseFloat(tx.price) || undefined;
          const valueUsd =
            shares != null && price != null ? shares * price : undefined;

          results.push({
            insiderName: tx.reportingOwner ?? tx.insiderName ?? 'Unknown',
            insiderRelation: tx.relationship ?? tx.ownerRelationship,
            price,
            shares,
            side,
            sourceKey: `sec-${symbol}-${tx.filingDate ?? tx.periodOfReport}-${tx.reportingOwner ?? 'unknown'}`,
            sourceProvider: this.name,
            sourceUrl: tx.filingUrl ?? tx.linkToFilingDetails,
            symbol: symbol.toUpperCase(),
            txDate: new Date(tx.periodOfReport ?? tx.filingDate ?? Date.now()),
            valueUsd,
            warnings: []
          });
        }
      } catch (error) {
        Logger.warn(
          `Failed to fetch insider data for ${symbol}: ${error instanceof Error ? error.message : error}`,
          'SecApiInsiderDataProvider'
        );
      }
    }

    // Filter by days
    const cutoff = new Date(Date.now() - (query.days ?? 30) * 86400000);
    return results.filter((tx) => tx.txDate >= cutoff);
  }

  private normalizeSide(
    raw: string | undefined
  ): 'buy' | 'other' | 'sell' {
    if (!raw) return 'other';
    const lower = raw.toLowerCase();
    if (lower.includes('purchase') || lower === 'a' || lower === 'buy') {
      return 'buy';
    }
    if (lower.includes('sale') || lower === 'd' || lower === 'sell' || lower.includes('dispos')) {
      return 'sell';
    }
    return 'other';
  }
}
