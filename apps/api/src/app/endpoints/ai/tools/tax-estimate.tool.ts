import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { DEFAULT_CURRENCY } from '@ghostfolio/common/config';

import { Injectable } from '@nestjs/common';
import { Type as ActivityType } from '@prisma/client';
import { differenceInDays } from 'date-fns';

interface TaxEstimateInput {
  holdingPeriodMonths?: number;
  jurisdiction?: string;
  taxYear?: number;
}

interface TaxEstimateOutput {
  assumptions: string[];
  baseCurrency: string;
  disclaimers: string[];
  jurisdiction: string;
  realizedGains: {
    longTerm: TaxEstimateBucket;
    shortTerm: TaxEstimateBucket;
    total: TaxEstimateBucket;
  };
  taxLossHarvestingCandidates: {
    costBasisInBaseCurrency: number;
    currentValueInBaseCurrency: number;
    holdingPeriodDays: number;
    isLongTerm: boolean;
    name: string;
    symbol: string;
    unrealizedLossInBaseCurrency: number;
  }[];
  taxYear: number;
  warnings: {
    code: string;
    message: string;
  }[];
}

interface TaxEstimateBucket {
  gainInBaseCurrency: number;
  lossInBaseCurrency: number;
  netInBaseCurrency: number;
  transactionCount: number;
}

interface BuyLot {
  acquiredAt: Date;
  remainingQuantity: number;
  unitCostInBaseCurrency: number;
}

const DEFAULT_HOLDING_PERIOD_MONTHS = 12;
const DEFAULT_JURISDICTION = 'GENERIC';
const DEFAULT_TAX_YEAR = new Date().getFullYear();
const MAX_HOLDING_PERIOD_MONTHS = 120;
const MIN_HOLDING_PERIOD_MONTHS = 1;

@Injectable()
export class TaxEstimateTool implements ToolDefinition<
  TaxEstimateInput,
  TaxEstimateOutput
> {
  public readonly description =
    'Estimate realized gains/losses deterministically with FIFO lot matching and identify potential tax-loss harvesting candidates.';

  public readonly inputSchema: ToolJsonSchema = {
    additionalProperties: false,
    properties: {
      holdingPeriodMonths: {
        maximum: MAX_HOLDING_PERIOD_MONTHS,
        minimum: MIN_HOLDING_PERIOD_MONTHS,
        type: 'number'
      },
      jurisdiction: {
        type: 'string'
      },
      taxYear: {
        maximum: 2100,
        minimum: 1900,
        type: 'number'
      }
    },
    type: 'object'
  };

  public readonly name = 'tax_estimate';

  public readonly outputSchema: ToolJsonSchema = {
    additionalProperties: false,
    properties: {
      assumptions: {
        items: {
          type: 'string'
        },
        type: 'array'
      },
      baseCurrency: {
        type: 'string'
      },
      disclaimers: {
        items: {
          type: 'string'
        },
        type: 'array'
      },
      jurisdiction: {
        type: 'string'
      },
      realizedGains: {
        additionalProperties: false,
        properties: {
          longTerm: {
            additionalProperties: false,
            properties: {
              gainInBaseCurrency: {
                type: 'number'
              },
              lossInBaseCurrency: {
                type: 'number'
              },
              netInBaseCurrency: {
                type: 'number'
              },
              transactionCount: {
                type: 'number'
              }
            },
            required: [
              'gainInBaseCurrency',
              'lossInBaseCurrency',
              'netInBaseCurrency',
              'transactionCount'
            ],
            type: 'object'
          },
          shortTerm: {
            additionalProperties: false,
            properties: {
              gainInBaseCurrency: {
                type: 'number'
              },
              lossInBaseCurrency: {
                type: 'number'
              },
              netInBaseCurrency: {
                type: 'number'
              },
              transactionCount: {
                type: 'number'
              }
            },
            required: [
              'gainInBaseCurrency',
              'lossInBaseCurrency',
              'netInBaseCurrency',
              'transactionCount'
            ],
            type: 'object'
          },
          total: {
            additionalProperties: false,
            properties: {
              gainInBaseCurrency: {
                type: 'number'
              },
              lossInBaseCurrency: {
                type: 'number'
              },
              netInBaseCurrency: {
                type: 'number'
              },
              transactionCount: {
                type: 'number'
              }
            },
            required: [
              'gainInBaseCurrency',
              'lossInBaseCurrency',
              'netInBaseCurrency',
              'transactionCount'
            ],
            type: 'object'
          }
        },
        required: ['longTerm', 'shortTerm', 'total'],
        type: 'object'
      },
      taxLossHarvestingCandidates: {
        items: {
          additionalProperties: false,
          properties: {
            costBasisInBaseCurrency: {
              type: 'number'
            },
            currentValueInBaseCurrency: {
              type: 'number'
            },
            holdingPeriodDays: {
              type: 'number'
            },
            isLongTerm: {
              type: 'boolean'
            },
            name: {
              type: 'string'
            },
            symbol: {
              type: 'string'
            },
            unrealizedLossInBaseCurrency: {
              type: 'number'
            }
          },
          required: [
            'costBasisInBaseCurrency',
            'currentValueInBaseCurrency',
            'holdingPeriodDays',
            'isLongTerm',
            'name',
            'symbol',
            'unrealizedLossInBaseCurrency'
          ],
          type: 'object'
        },
        type: 'array'
      },
      taxYear: {
        type: 'number'
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
      'assumptions',
      'baseCurrency',
      'disclaimers',
      'jurisdiction',
      'realizedGains',
      'taxLossHarvestingCandidates',
      'taxYear',
      'warnings'
    ],
    type: 'object'
  };

  public constructor(
    private readonly orderService: OrderService,
    private readonly portfolioService: PortfolioService,
    private readonly userService: UserService
  ) {}

  public async execute(
    input: TaxEstimateInput,
    context: ToolExecutionContext
  ): Promise<TaxEstimateOutput> {
    const taxYear = this.resolveTaxYear(input.taxYear);
    const holdingPeriodMonths = this.resolveHoldingPeriodMonths(
      input.holdingPeriodMonths
    );
    const jurisdiction =
      input.jurisdiction?.trim().toUpperCase() || DEFAULT_JURISDICTION;
    const warnings: TaxEstimateOutput['warnings'] = [];

    if (jurisdiction === DEFAULT_JURISDICTION) {
      warnings.push({
        code: 'no_jurisdiction_provided',
        message:
          'No jurisdiction was provided; tax estimate is generic and may omit local rules.'
      });
    }

    const user = await this.userService.user({ id: context.userId });
    const baseCurrency =
      user?.settings?.settings?.baseCurrency?.toString() ?? DEFAULT_CURRENCY;

    const [ordersResponse, portfolioDetails] = await Promise.all([
      this.orderService.getOrders({
        endDate: new Date(Date.UTC(taxYear, 11, 31, 23, 59, 59, 999)),
        sortColumn: 'date',
        sortDirection: 'asc',
        types: [ActivityType.BUY, ActivityType.SELL],
        userCurrency: baseCurrency,
        userId: context.userId,
        withExcludedAccountsAndActivities: false
      }),
      this.portfolioService.getDetails({
        impersonationId: undefined,
        userId: context.userId,
        withSummary: true
      })
    ]);

    const lotBook = new Map<string, BuyLot[]>();
    const shortTerm = this.createEmptyBucket();
    const longTerm = this.createEmptyBucket();
    let hasMissingCostBasis = false;

    const activities = [...(ordersResponse.activities ?? [])].sort(
      (activityA, activityB) => {
        const dateDelta =
          new Date(activityA.date).getTime() -
          new Date(activityB.date).getTime();

        if (dateDelta !== 0) {
          return dateDelta;
        }

        return (activityA.id ?? '').localeCompare(activityB.id ?? '');
      }
    );

    for (const activity of activities) {
      const symbol = activity.SymbolProfile?.symbol;
      const dataSource = activity.SymbolProfile?.dataSource;

      if (!symbol || !dataSource || !(activity.quantity > 0)) {
        continue;
      }

      const assetKey = `${dataSource}:${symbol}`;
      const activityDate = new Date(activity.date);

      if (activity.type === ActivityType.BUY) {
        const totalCostInBaseCurrency =
          (activity.valueInBaseCurrency ?? 0) +
          (activity.feeInBaseCurrency ?? 0);
        const unitCostInBaseCurrency =
          totalCostInBaseCurrency / activity.quantity;

        this.getOrCreateLots(lotBook, assetKey).push({
          acquiredAt: activityDate,
          remainingQuantity: activity.quantity,
          unitCostInBaseCurrency
        });

        continue;
      }

      if (activity.type !== ActivityType.SELL) {
        continue;
      }

      let remainingQuantity = activity.quantity;
      const unitProceedsInBaseCurrency =
        ((activity.valueInBaseCurrency ?? 0) -
          (activity.feeInBaseCurrency ?? 0)) /
        activity.quantity;
      const lots = this.getOrCreateLots(lotBook, assetKey);

      while (remainingQuantity > 0) {
        const openLot = lots[0];

        if (!openLot) {
          if (activityDate.getUTCFullYear() === taxYear) {
            hasMissingCostBasis = true;
          }

          break;
        }

        const matchedQuantity = Math.min(
          remainingQuantity,
          openLot.remainingQuantity
        );
        const proceedsInBaseCurrency =
          matchedQuantity * unitProceedsInBaseCurrency;
        const costBasisInBaseCurrency =
          matchedQuantity * openLot.unitCostInBaseCurrency;
        const realizedNet = proceedsInBaseCurrency - costBasisInBaseCurrency;

        openLot.remainingQuantity -= matchedQuantity;
        remainingQuantity -= matchedQuantity;

        if (openLot.remainingQuantity <= Number.EPSILON) {
          lots.shift();
        }

        if (activityDate.getUTCFullYear() !== taxYear) {
          continue;
        }

        const holdingPeriodDays = Math.max(
          0,
          differenceInDays(activityDate, openLot.acquiredAt)
        );
        const isLongTerm = holdingPeriodDays >= holdingPeriodMonths * 30;

        this.addRealizedAmount({
          amountInBaseCurrency: realizedNet,
          bucket: isLongTerm ? longTerm : shortTerm
        });
      }
    }

    if (hasMissingCostBasis) {
      warnings.push({
        code: 'missing_cost_basis',
        message:
          'Insufficient BUY history to match at least one SELL transaction via FIFO.'
      });
    }

    const total: TaxEstimateBucket = {
      gainInBaseCurrency:
        shortTerm.gainInBaseCurrency + longTerm.gainInBaseCurrency,
      lossInBaseCurrency:
        shortTerm.lossInBaseCurrency + longTerm.lossInBaseCurrency,
      netInBaseCurrency:
        shortTerm.netInBaseCurrency + longTerm.netInBaseCurrency,
      transactionCount: shortTerm.transactionCount + longTerm.transactionCount
    };

    const tlhCandidates: TaxEstimateOutput['taxLossHarvestingCandidates'] = [];

    for (const holding of Object.values(portfolioDetails.holdings ?? {})) {
      const currentValueInBaseCurrency = holding.valueInBaseCurrency ?? 0;
      const costBasisInBaseCurrency = this.getHoldingCostBasis(holding);

      if (!Number.isFinite(costBasisInBaseCurrency)) {
        continue;
      }

      const unrealizedLossInBaseCurrency =
        currentValueInBaseCurrency - costBasisInBaseCurrency;

      if (!(unrealizedLossInBaseCurrency < 0)) {
        continue;
      }

      const holdingPeriodDays = holding.dateOfFirstActivity
        ? Math.max(
            0,
            differenceInDays(new Date(), new Date(holding.dateOfFirstActivity))
          )
        : 0;

      tlhCandidates.push({
        costBasisInBaseCurrency,
        currentValueInBaseCurrency,
        holdingPeriodDays,
        isLongTerm: holdingPeriodDays >= holdingPeriodMonths * 30,
        name: holding.name ?? holding.symbol,
        symbol: holding.symbol,
        unrealizedLossInBaseCurrency
      });
    }

    tlhCandidates.sort((candidateA, candidateB) => {
      return (
        candidateA.unrealizedLossInBaseCurrency -
        candidateB.unrealizedLossInBaseCurrency
      );
    });

    return {
      assumptions: [
        'FIFO (first-in, first-out) lot matching is used to estimate cost basis.',
        'Holding period classification uses a month-to-day approximation (30 days per month).',
        'Realized estimates are derived from recorded transaction values in base currency.'
      ],
      baseCurrency,
      disclaimers: [
        'This is an estimate for informational purposes only, not tax advice.',
        'Consult a qualified tax professional for actual tax obligations.',
        'Wash sale rules and jurisdiction-specific rules are NOT applied.'
      ],
      jurisdiction,
      realizedGains: {
        longTerm,
        shortTerm,
        total
      },
      taxLossHarvestingCandidates: tlhCandidates,
      taxYear,
      warnings
    };
  }

  private addRealizedAmount({
    amountInBaseCurrency,
    bucket
  }: {
    amountInBaseCurrency: number;
    bucket: TaxEstimateBucket;
  }) {
    if (amountInBaseCurrency >= 0) {
      bucket.gainInBaseCurrency += amountInBaseCurrency;
    } else {
      bucket.lossInBaseCurrency += Math.abs(amountInBaseCurrency);
    }

    bucket.netInBaseCurrency =
      bucket.gainInBaseCurrency - bucket.lossInBaseCurrency;
    bucket.transactionCount += 1;
  }

  private createEmptyBucket(): TaxEstimateBucket {
    return {
      gainInBaseCurrency: 0,
      lossInBaseCurrency: 0,
      netInBaseCurrency: 0,
      transactionCount: 0
    };
  }

  private getHoldingCostBasis(holding: {
    investment?: number;
    netPerformanceWithCurrencyEffect?: number;
    valueInBaseCurrency?: number;
  }) {
    const valueInBaseCurrency = holding.valueInBaseCurrency;
    const netPerformanceWithCurrencyEffect =
      holding.netPerformanceWithCurrencyEffect;

    if (
      Number.isFinite(valueInBaseCurrency) &&
      Number.isFinite(netPerformanceWithCurrencyEffect)
    ) {
      return valueInBaseCurrency - netPerformanceWithCurrencyEffect;
    }

    if (Number.isFinite(holding.investment)) {
      return holding.investment;
    }

    return Number.NaN;
  }

  private getOrCreateLots(lotBook: Map<string, BuyLot[]>, assetKey: string) {
    if (!lotBook.has(assetKey)) {
      lotBook.set(assetKey, []);
    }

    return lotBook.get(assetKey);
  }

  private resolveHoldingPeriodMonths(holdingPeriodMonths?: number) {
    if (!Number.isFinite(holdingPeriodMonths)) {
      return DEFAULT_HOLDING_PERIOD_MONTHS;
    }

    return Math.max(
      MIN_HOLDING_PERIOD_MONTHS,
      Math.min(MAX_HOLDING_PERIOD_MONTHS, Math.floor(holdingPeriodMonths))
    );
  }

  private resolveTaxYear(taxYear?: number) {
    if (!Number.isFinite(taxYear)) {
      return DEFAULT_TAX_YEAR;
    }

    return Math.max(1900, Math.min(2100, Math.floor(taxYear)));
  }
}
