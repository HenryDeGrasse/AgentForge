export interface NormalizedInsiderTx {
  insiderName: string;
  insiderRelation?: string;
  price?: number;
  shares?: number;
  side: 'buy' | 'other' | 'sell';
  sourceKey: string;
  sourceProvider: string;
  sourceUrl?: string;
  symbol: string;
  txDate: Date;
  valueUsd?: number;
  warnings: string[];
}

export interface InsiderDataProviderQuery {
  days?: number;
  symbols: string[];
}

export interface InsiderDataProvider {
  readonly name: string;
  fetchInsiderActivity(
    query: InsiderDataProviderQuery
  ): Promise<NormalizedInsiderTx[]>;
}

export const INSIDER_DATA_PROVIDER_TOKEN = 'INSIDER_DATA_PROVIDER_TOKEN';
