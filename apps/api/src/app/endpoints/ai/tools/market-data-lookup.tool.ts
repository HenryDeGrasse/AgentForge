import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { SymbolService } from '@ghostfolio/api/app/symbol/symbol.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { SymbolProfileService } from '@ghostfolio/api/services/symbol-profile/symbol-profile.service';

import { Injectable } from '@nestjs/common';

interface MarketDataLookupInput {
  dataSource?: string;
  historyDays?: number;
  includeHistory?: boolean;
  symbol: string;
}

interface MarketDataLookupOutput {
  assetClass: string;
  assetSubClass: string;
  countries: {
    code: string;
    weight: number;
  }[];
  currency: string;
  dataSource: string;
  historicalData: {
    date: string;
    marketPrice: number;
  }[];
  marketPrice: number;
  name: string;
  priceChange: {
    absoluteChange: number;
    percentChange: number;
    periodDays: number;
  } | null;
  priceUpdatedAt: string;
  sectors: {
    name: string;
    weight: number;
  }[];
  symbol: string;
  warnings: {
    code: string;
    message: string;
  }[];
}

const DEFAULT_DATA_SOURCE = 'YAHOO';
const DEFAULT_HISTORY_DAYS = 30;
const MAX_HISTORY_DAYS = 365;
const MIN_HISTORY_DAYS = 1;

@Injectable()
export class MarketDataLookupTool implements ToolDefinition<
  MarketDataLookupInput,
  MarketDataLookupOutput
> {
  public readonly description =
    'Look up deterministic symbol quote, profile metadata and optional historical market data.';

  public readonly inputSchema: ToolJsonSchema = {
    additionalProperties: false,
    properties: {
      dataSource: {
        type: 'string'
      },
      historyDays: {
        maximum: MAX_HISTORY_DAYS,
        minimum: MIN_HISTORY_DAYS,
        type: 'number'
      },
      includeHistory: {
        type: 'boolean'
      },
      symbol: {
        type: 'string'
      }
    },
    required: ['symbol'],
    type: 'object'
  };

  public readonly name = 'market_data_lookup';

  public readonly outputSchema: ToolJsonSchema = {
    additionalProperties: false,
    properties: {
      assetClass: {
        type: 'string'
      },
      assetSubClass: {
        type: 'string'
      },
      countries: {
        items: {
          additionalProperties: false,
          properties: {
            code: {
              type: 'string'
            },
            weight: {
              type: 'number'
            }
          },
          required: ['code', 'weight'],
          type: 'object'
        },
        type: 'array'
      },
      currency: {
        type: 'string'
      },
      dataSource: {
        type: 'string'
      },
      historicalData: {
        items: {
          additionalProperties: false,
          properties: {
            date: {
              type: 'string'
            },
            marketPrice: {
              type: 'number'
            }
          },
          required: ['date', 'marketPrice'],
          type: 'object'
        },
        type: 'array'
      },
      marketPrice: {
        type: 'number'
      },
      name: {
        type: 'string'
      },
      priceChange: {
        additionalProperties: false,
        properties: {
          absoluteChange: {
            type: 'number'
          },
          percentChange: {
            type: 'number'
          },
          periodDays: {
            type: 'number'
          }
        },
        required: ['absoluteChange', 'percentChange', 'periodDays'],
        type: 'object'
      },
      priceUpdatedAt: {
        type: 'string'
      },
      sectors: {
        items: {
          additionalProperties: false,
          properties: {
            name: {
              type: 'string'
            },
            weight: {
              type: 'number'
            }
          },
          required: ['name', 'weight'],
          type: 'object'
        },
        type: 'array'
      },
      symbol: {
        type: 'string'
      },
      warnings: {
        items: {
          additionalProperties: false,
          properties: {
            code: {
              type: 'string'
            },
            message: {
              type: 'string'
            }
          },
          required: ['code', 'message'],
          type: 'object'
        },
        type: 'array'
      }
    },
    required: [
      'assetClass',
      'assetSubClass',
      'countries',
      'currency',
      'dataSource',
      'historicalData',
      'marketPrice',
      'name',
      'priceChange',
      'priceUpdatedAt',
      'sectors',
      'symbol',
      'warnings'
    ],
    type: 'object'
  };

  public constructor(
    private readonly symbolService: SymbolService,
    private readonly symbolProfileService: SymbolProfileService,
    private readonly userService: UserService
  ) {}

  public async execute(
    input: MarketDataLookupInput,
    context: ToolExecutionContext
  ): Promise<MarketDataLookupOutput> {
    const warnings: MarketDataLookupOutput['warnings'] = [];
    const requestedSymbol = input.symbol?.trim();
    const includeHistory = input.includeHistory === true;
    const historyDays = this.getHistoryDays(input.historyDays);

    let dataSource = this.getDataSource(input.dataSource);
    let symbol = requestedSymbol?.toUpperCase() ?? '';

    let quote = await this.symbolService.get({
      dataGatheringItem: {
        dataSource: dataSource as never,
        symbol
      },
      includeHistoricalData: includeHistory ? historyDays : 0
    });

    if (!quote && requestedSymbol) {
      const lookupMatch = await this.resolveSymbolFromLookup({
        query: requestedSymbol,
        userId: context.userId
      });

      if (lookupMatch) {
        dataSource = lookupMatch.dataSource;
        symbol = lookupMatch.symbol;

        warnings.push({
          code: 'resolved_symbol_lookup',
          message: `Input symbol was resolved via symbol lookup to ${symbol} on ${dataSource}.`
        });

        quote = await this.symbolService.get({
          dataGatheringItem: {
            dataSource: dataSource as never,
            symbol
          },
          includeHistoricalData: includeHistory ? historyDays : 0
        });
      }
    }

    if (!quote) {
      warnings.push({
        code: 'symbol_not_found',
        message: `No quote was found for ${dataSource}:${symbol}.`
      });

      if (includeHistory) {
        warnings.push({
          code: 'no_historical_data',
          message: `No historical data was returned for ${dataSource}:${symbol}.`
        });
      }

      return {
        assetClass: '',
        assetSubClass: '',
        countries: [],
        currency: '',
        dataSource,
        historicalData: [],
        marketPrice: 0,
        name: symbol,
        priceChange: null,
        priceUpdatedAt: '',
        sectors: [],
        symbol,
        warnings
      };
    }

    dataSource = quote.dataSource;
    symbol = quote.symbol;

    const [profile] = await this.symbolProfileService.getSymbolProfiles([
      {
        dataSource: dataSource as never,
        symbol
      }
    ]);

    if (!profile) {
      warnings.push({
        code: 'missing_symbol_profile',
        message: `No symbol profile metadata was found for ${dataSource}:${symbol}.`
      });
    }

    if (!(quote.marketPrice > 0)) {
      warnings.push({
        code: 'missing_market_price',
        message: `Market price is missing or non-positive for ${dataSource}:${symbol}.`
      });
    }

    const historicalData = includeHistory
      ? (quote.historicalData ?? [])
          .map(({ date, value }) => {
            return {
              date: this.toIsoString(date),
              marketPrice: value
            };
          })
          .sort((entryA, entryB) => {
            return entryA.date.localeCompare(entryB.date);
          })
      : [];

    let priceChange: MarketDataLookupOutput['priceChange'] = null;

    if (includeHistory) {
      if (historicalData.length < 2) {
        warnings.push({
          code: 'no_historical_data',
          message: `No historical data was returned for ${dataSource}:${symbol}.`
        });
      } else {
        const firstPoint = historicalData[0];
        const lastPoint = historicalData[historicalData.length - 1];

        if (firstPoint.marketPrice > 0) {
          const absoluteChange = lastPoint.marketPrice - firstPoint.marketPrice;

          priceChange = {
            absoluteChange,
            percentChange: absoluteChange / firstPoint.marketPrice,
            periodDays: historyDays
          };
        }
      }
    }

    return {
      assetClass: profile?.assetClass?.toString() ?? '',
      assetSubClass: profile?.assetSubClass?.toString() ?? '',
      countries: this.mapCountries(profile?.countries),
      currency: quote.currency ?? profile?.currency?.toString() ?? '',
      dataSource,
      historicalData,
      marketPrice: quote.marketPrice ?? 0,
      name: profile?.name ?? symbol,
      priceChange,
      priceUpdatedAt:
        historicalData[historicalData.length - 1]?.date ??
        new Date().toISOString(),
      sectors: this.mapSectors(profile?.sectors),
      symbol,
      warnings
    };
  }

  private getDataSource(dataSource?: string) {
    if (!dataSource?.trim()) {
      return DEFAULT_DATA_SOURCE;
    }

    return dataSource.trim().toUpperCase();
  }

  private getHistoryDays(historyDays?: number) {
    if (!Number.isFinite(historyDays)) {
      return DEFAULT_HISTORY_DAYS;
    }

    return Math.max(
      MIN_HISTORY_DAYS,
      Math.min(MAX_HISTORY_DAYS, Math.floor(historyDays))
    );
  }

  private mapCountries(countries: { code?: string; weight?: number }[] = []) {
    return countries
      .map((country) => {
        return {
          code: country.code ?? '',
          weight: Number.isFinite(country.weight) ? country.weight : 0
        };
      })
      .filter(({ code }) => {
        return code.length > 0;
      });
  }

  private mapSectors(sectors: { name?: string; weight?: number }[] = []) {
    return sectors
      .map((sector) => {
        return {
          name: sector.name ?? '',
          weight: Number.isFinite(sector.weight) ? sector.weight : 0
        };
      })
      .filter(({ name }) => {
        return name.length > 0;
      });
  }

  private async resolveSymbolFromLookup({
    query,
    userId
  }: {
    query: string;
    userId: string;
  }): Promise<
    | {
        dataSource: string;
        symbol: string;
      }
    | undefined
  > {
    const user = await this.userService.user({ id: userId });

    if (!user) {
      return undefined;
    }

    try {
      const lookupResponse = await this.symbolService.lookup({
        includeIndices: false,
        query,
        user
      });

      const lookupItem = lookupResponse.items?.[0];

      if (!lookupItem) {
        return undefined;
      }

      return {
        dataSource: lookupItem.dataSource.toString(),
        symbol: lookupItem.symbol
      };
    } catch {
      return undefined;
    }
  }

  private toIsoString(value: Date | string) {
    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      return '';
    }

    return parsedDate.toISOString();
  }
}
