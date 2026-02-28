import {
  TAX_ESTIMATE_INPUT_SCHEMA,
  TAX_ESTIMATE_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
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

interface HypotheticalTradeInput {
  action: 'sell';
  fractionOfPosition?: number;
  notionalValueInBaseCurrency?: number;
  quantity?: number;
  symbol: string;
}

interface HypotheticalTradeResult {
  estimatedCostBasisInBaseCurrency: number;
  estimatedGainInBaseCurrency: number;
  estimatedProceedsInBaseCurrency: number;
  isLongTerm: boolean;
  longTermGainInBaseCurrency: number;
  oldestLotHoldingPeriodDays: number;
  quantitySold: number;
  shortTermGainInBaseCurrency: number;
  symbol: string;
  warning?: string;
}

interface HypotheticalImpact {
  totalEstimatedGainInBaseCurrency: number;
  totalLongTermGainInBaseCurrency: number;
  totalShortTermGainInBaseCurrency: number;
  trades: HypotheticalTradeResult[];
}

interface TaxEstimateInput {
  holdingPeriodMonths?: number;
  hypotheticalTrades?: HypotheticalTradeInput[];
  jurisdiction?: string;
  taxYear?: number;
}

interface TaxEstimateOutput {
  assumptions: string[];
  baseCurrency: string;
  disclaimers: string[];
  hypotheticalImpact?: HypotheticalImpact;
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

  public readonly inputSchema: ToolJsonSchema = TAX_ESTIMATE_INPUT_SCHEMA;

  public readonly name = 'tax_estimate';

  public readonly outputSchema: ToolJsonSchema = TAX_ESTIMATE_OUTPUT_SCHEMA;

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

    // ─── Hypothetical trade impact ────────────────────────────────────────────
    const hypotheticalImpact = this.computeHypotheticalImpact({
      holdingPeriodMonths,
      hypotheticalTrades: input.hypotheticalTrades,
      lotBook,
      portfolioDetails
    });

    return {
      ...(hypotheticalImpact !== undefined ? { hypotheticalImpact } : {}),
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

  private computeHypotheticalImpact({
    holdingPeriodMonths,
    hypotheticalTrades,
    lotBook,
    portfolioDetails
  }: {
    holdingPeriodMonths: number;
    hypotheticalTrades: HypotheticalTradeInput[] | undefined;
    lotBook: Map<string, BuyLot[]>;
    portfolioDetails: {
      holdings?: Record<string, { marketPrice?: number; symbol?: string }>;
    };
  }): HypotheticalImpact | undefined {
    if (!hypotheticalTrades || hypotheticalTrades.length === 0) {
      return undefined;
    }

    // Build symbol → marketPrice lookup from current holdings
    const marketPriceBySymbol = new Map<string, number>();

    for (const holding of Object.values(portfolioDetails.holdings ?? {})) {
      if (holding.symbol && holding.marketPrice != null) {
        marketPriceBySymbol.set(
          holding.symbol.toUpperCase(),
          holding.marketPrice
        );
      }
    }

    const tradeResults: HypotheticalTradeResult[] = [];

    for (const trade of hypotheticalTrades) {
      if (trade.action !== 'sell') {
        continue;
      }

      const symbolUpper = trade.symbol?.trim().toUpperCase();

      if (!symbolUpper) {
        continue;
      }

      // Find the lot book entry by symbol (keys are "DATASOURCE:SYMBOL")
      const lotBookEntry = this.findLotsBySymbol(lotBook, symbolUpper);
      const remainingLots = (lotBookEntry ?? [])
        .filter((lot) => lot.remainingQuantity > Number.EPSILON)
        .map((lot) => ({ ...lot })); // clone — do not mutate real lot book

      const totalRemainingQuantity = remainingLots.reduce((sum, lot) => {
        return sum + lot.remainingQuantity;
      }, 0);

      const marketPrice = marketPriceBySymbol.get(symbolUpper) ?? 0;

      // Resolve sell quantity: quantity > notional > fraction
      let resolvedQuantity = 0;

      if (Number.isFinite(trade.quantity) && trade.quantity > 0) {
        resolvedQuantity = trade.quantity;
      } else if (
        Number.isFinite(trade.notionalValueInBaseCurrency) &&
        trade.notionalValueInBaseCurrency > 0
      ) {
        if (marketPrice <= 0) {
          tradeResults.push(
            this.buildZeroHypotheticalResult(
              trade.symbol,
              'Market price unavailable; cannot convert notional amount to shares.'
            )
          );
          continue;
        }

        resolvedQuantity = trade.notionalValueInBaseCurrency / marketPrice;
      } else if (
        Number.isFinite(trade.fractionOfPosition) &&
        trade.fractionOfPosition > 0
      ) {
        resolvedQuantity = totalRemainingQuantity * trade.fractionOfPosition;
      }

      if (resolvedQuantity <= 0 || remainingLots.length === 0) {
        tradeResults.push(
          this.buildZeroHypotheticalResult(
            trade.symbol,
            resolvedQuantity <= 0
              ? 'Could not resolve a positive sell quantity.'
              : 'No open lots available for this symbol.'
          )
        );
        continue;
      }

      // FIFO matching against cloned remaining lots
      const today = new Date();
      let remainingToSell = resolvedQuantity;
      let totalProceeds = 0;
      let totalCostBasis = 0;
      let longTermGain = 0;
      let shortTermGain = 0;
      let oldestLotHoldingPeriodDays = 0;
      let isLongTerm = false;
      let firstLot = true;
      let insufficientLots = false;

      while (remainingToSell > Number.EPSILON) {
        const lot = remainingLots[0];

        if (!lot) {
          insufficientLots = true;
          break;
        }

        const matchedQty = Math.min(remainingToSell, lot.remainingQuantity);
        const proceeds = matchedQty * marketPrice;
        const costBasis = matchedQty * lot.unitCostInBaseCurrency;
        const lotHoldingDays = Math.max(
          0,
          differenceInDays(today, lot.acquiredAt)
        );
        const lotIsLongTerm = lotHoldingDays >= holdingPeriodMonths * 30;
        const lotGain = proceeds - costBasis;

        totalProceeds += proceeds;
        totalCostBasis += costBasis;

        if (lotIsLongTerm) {
          longTermGain += lotGain;
        } else {
          shortTermGain += lotGain;
        }

        // Oldest lot (first FIFO match) determines top-level isLongTerm
        if (firstLot) {
          oldestLotHoldingPeriodDays = lotHoldingDays;
          isLongTerm = lotIsLongTerm;
          firstLot = false;
        }

        lot.remainingQuantity -= matchedQty;
        remainingToSell -= matchedQty;

        if (lot.remainingQuantity <= Number.EPSILON) {
          remainingLots.shift();
        }
      }

      const quantitySold = resolvedQuantity - remainingToSell;

      tradeResults.push({
        estimatedCostBasisInBaseCurrency: totalCostBasis,
        estimatedGainInBaseCurrency: totalProceeds - totalCostBasis,
        estimatedProceedsInBaseCurrency: totalProceeds,
        isLongTerm,
        longTermGainInBaseCurrency: longTermGain,
        oldestLotHoldingPeriodDays,
        quantitySold,
        shortTermGainInBaseCurrency: shortTermGain,
        symbol: trade.symbol,
        ...(insufficientLots
          ? {
              warning:
                'Insufficient lots to fill the full sell quantity; partial match only.'
            }
          : {})
      });
    }

    return {
      totalEstimatedGainInBaseCurrency: tradeResults.reduce((sum, t) => {
        return sum + t.estimatedGainInBaseCurrency;
      }, 0),
      totalLongTermGainInBaseCurrency: tradeResults.reduce((sum, t) => {
        return sum + t.longTermGainInBaseCurrency;
      }, 0),
      totalShortTermGainInBaseCurrency: tradeResults.reduce((sum, t) => {
        return sum + t.shortTermGainInBaseCurrency;
      }, 0),
      trades: tradeResults
    };
  }

  private buildZeroHypotheticalResult(
    symbol: string,
    warning: string
  ): HypotheticalTradeResult {
    return {
      estimatedCostBasisInBaseCurrency: 0,
      estimatedGainInBaseCurrency: 0,
      estimatedProceedsInBaseCurrency: 0,
      isLongTerm: false,
      longTermGainInBaseCurrency: 0,
      oldestLotHoldingPeriodDays: 0,
      quantitySold: 0,
      shortTermGainInBaseCurrency: 0,
      symbol,
      warning
    };
  }

  /** Find remaining lots in the lot book by ticker symbol (case-insensitive).
   *  Keys are stored as "DATASOURCE:SYMBOL". */
  private findLotsBySymbol(
    lotBook: Map<string, BuyLot[]>,
    symbolUpper: string
  ): BuyLot[] | undefined {
    for (const [key, lots] of lotBook.entries()) {
      if (key.toUpperCase().endsWith(`:${symbolUpper}`)) {
        return lots;
      }
    }

    return undefined;
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
