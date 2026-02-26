import { Injectable } from '@nestjs/common';

import type {
  InsiderDataProvider,
  InsiderDataProviderQuery,
  NormalizedInsiderTx
} from './insider-data-provider.interface';

const STUB_DATA: NormalizedInsiderTx[] = [
  {
    insiderName: 'Jensen Huang',
    insiderRelation: 'CEO',
    price: 135.5,
    shares: 100000,
    side: 'sell',
    sourceKey: 'stub-nvda-sell-1',
    sourceProvider: 'stub',
    sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=NVDA',
    symbol: 'NVDA',
    txDate: new Date(Date.now() - 5 * 86400000),
    valueUsd: 13550000,
    warnings: []
  },
  {
    insiderName: 'Lisa Su',
    insiderRelation: 'CEO',
    price: 178.25,
    shares: 50000,
    side: 'sell',
    sourceKey: 'stub-amd-sell-1',
    sourceProvider: 'stub',
    sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=AMD',
    symbol: 'AMD',
    txDate: new Date(Date.now() - 3 * 86400000),
    valueUsd: 8912500,
    warnings: []
  },
  {
    insiderName: 'Tim Cook',
    insiderRelation: 'CEO',
    price: 225.0,
    shares: 75000,
    side: 'sell',
    sourceKey: 'stub-aapl-sell-1',
    sourceProvider: 'stub',
    sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=AAPL',
    symbol: 'AAPL',
    txDate: new Date(Date.now() - 7 * 86400000),
    valueUsd: 16875000,
    warnings: []
  },
  {
    insiderName: 'Satya Nadella',
    insiderRelation: 'CEO',
    price: 420.0,
    shares: 10000,
    side: 'buy',
    sourceKey: 'stub-msft-buy-1',
    sourceProvider: 'stub',
    sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=MSFT',
    symbol: 'MSFT',
    txDate: new Date(Date.now() - 2 * 86400000),
    valueUsd: 4200000,
    warnings: []
  },
  {
    insiderName: 'Andy Jassy',
    insiderRelation: 'CEO',
    price: 185.0,
    shares: 20000,
    side: 'sell',
    sourceKey: 'stub-amzn-sell-1',
    sourceProvider: 'stub',
    sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=AMZN',
    symbol: 'AMZN',
    txDate: new Date(Date.now() - 10 * 86400000),
    valueUsd: 3700000,
    warnings: []
  }
];

@Injectable()
export class StubInsiderDataProvider implements InsiderDataProvider {
  public readonly name = 'stub';

  public async fetchInsiderActivity(
    query: InsiderDataProviderQuery
  ): Promise<NormalizedInsiderTx[]> {
    const cutoff = new Date(
      Date.now() - (query.days ?? 30) * 86400000
    );

    return STUB_DATA.filter((tx) => {
      const symbolMatch =
        query.symbols.length === 0 ||
        query.symbols.some(
          (s) => s.toUpperCase() === tx.symbol.toUpperCase()
        );
      const dateMatch = tx.txDate >= cutoff;
      return symbolMatch && dateMatch;
    });
  }
}
