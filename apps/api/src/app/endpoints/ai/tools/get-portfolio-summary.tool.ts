import {
  PORTFOLIO_SUMMARY_INPUT_SCHEMA,
  PORTFOLIO_SUMMARY_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { DEFAULT_CURRENCY } from '@ghostfolio/common/config';

import { Injectable } from '@nestjs/common';

interface GetPortfolioSummaryInput {
  topN?: number;
}

interface GetPortfolioSummaryOutput {
  baseCurrency: string;
  generatedAt: string;
  latestActivityDate: string;
  snapshotCreatedAt: string;
  topHoldings: {
    allocationInHoldings: number;
    allocationInPortfolio: number;
    assetClass: string;
    currency: string;
    dataSource: string;
    marketPrice: number;
    name: string;
    quantity: number;
    symbol: string;
    valueInBaseCurrency: number;
  }[];
  totals: {
    activityCount: number;
    cashInBaseCurrency: number;
    holdingsCount: number;
    holdingsValueInBaseCurrency: number;
    totalPortfolioValueInBaseCurrency: number;
  };
  warnings: {
    code: string;
    message: string;
  }[];
}

const DEFAULT_TOP_N = 5;
const MAX_TOP_N = 25;
const MIN_TOP_N = 1;

@Injectable()
export class GetPortfolioSummaryTool implements ToolDefinition<
  GetPortfolioSummaryInput,
  GetPortfolioSummaryOutput
> {
  public readonly description =
    'Return deterministic portfolio totals, allocation percentages and top holdings for the authenticated user.';

  public readonly inputSchema: ToolJsonSchema = PORTFOLIO_SUMMARY_INPUT_SCHEMA;

  public readonly name = 'get_portfolio_summary';

  public readonly outputSchema: ToolJsonSchema =
    PORTFOLIO_SUMMARY_OUTPUT_SCHEMA;

  public constructor(
    private readonly portfolioService: PortfolioService,
    private readonly prismaService: PrismaService,
    private readonly userService: UserService
  ) {}

  public async execute(
    input: GetPortfolioSummaryInput,
    context: ToolExecutionContext
  ): Promise<GetPortfolioSummaryOutput> {
    const topN = this.clampTopN(input?.topN);

    const [portfolioDetails, activityStats, user] = await Promise.all([
      this.portfolioService.getDetails({
        impersonationId: undefined,
        userId: context.userId,
        withSummary: true
      }),
      this.prismaService.order.aggregate({
        _count: {
          _all: true
        },
        _max: {
          date: true
        },
        where: {
          isDraft: false,
          userId: context.userId
        }
      }),
      this.userService.user({ id: context.userId })
    ]);

    const holdings = Object.values(portfolioDetails.holdings ?? {}).sort(
      (holdingA, holdingB) => {
        return (
          (holdingB.valueInBaseCurrency ?? 0) -
          (holdingA.valueInBaseCurrency ?? 0)
        );
      }
    );

    const holdingsCount = holdings.length;

    const holdingsValueInBaseCurrency = holdings.reduce(
      (sum, currentHolding) => {
        return sum + (currentHolding.valueInBaseCurrency ?? 0);
      },
      0
    );

    const totalPortfolioValueInBaseCurrency =
      portfolioDetails.summary?.totalValueInBaseCurrency ??
      holdingsValueInBaseCurrency + (portfolioDetails.summary?.cash ?? 0);

    const topHoldings = holdings.slice(0, topN).map((holding) => {
      const valueInBaseCurrency = holding.valueInBaseCurrency ?? 0;

      return {
        allocationInHoldings:
          holdingsValueInBaseCurrency > 0
            ? valueInBaseCurrency / holdingsValueInBaseCurrency
            : 0,
        allocationInPortfolio:
          totalPortfolioValueInBaseCurrency > 0
            ? valueInBaseCurrency / totalPortfolioValueInBaseCurrency
            : 0,
        assetClass: holding.assetClass ?? '',
        currency: holding.currency,
        dataSource: holding.dataSource,
        marketPrice: holding.marketPrice ?? 0,
        name: holding.name ?? holding.symbol,
        quantity: holding.quantity ?? 0,
        symbol: holding.symbol,
        valueInBaseCurrency
      };
    });

    const warnings: GetPortfolioSummaryOutput['warnings'] = [];

    if (holdingsCount === 0) {
      warnings.push({
        code: 'no_holdings_data',
        message: 'No holdings were found for this user.'
      });
    }

    if (!activityStats._max.date) {
      warnings.push({
        code: 'no_activity_history',
        message: 'No activity timestamps were found for this user.'
      });
    }

    if (holdingsCount > topN) {
      warnings.push({
        code: 'top_holdings_truncated',
        message: `Top holdings are limited to ${topN} rows.`
      });
    }

    if (totalPortfolioValueInBaseCurrency <= 0) {
      warnings.push({
        code: 'non_positive_portfolio_total',
        message: 'The total portfolio value is zero or negative.'
      });
    }

    const missingMarketPriceCount = holdings.filter(({ marketPrice }) => {
      return !marketPrice || marketPrice <= 0;
    }).length;

    if (missingMarketPriceCount > 0) {
      warnings.push({
        code: 'missing_market_prices',
        message: `${missingMarketPriceCount} holding(s) have no valid market price.`
      });
    }

    return {
      baseCurrency:
        user?.settings?.settings?.baseCurrency?.toString() ?? DEFAULT_CURRENCY,
      generatedAt: new Date().toISOString(),
      latestActivityDate: activityStats._max.date
        ? new Date(activityStats._max.date).toISOString()
        : '',
      snapshotCreatedAt: portfolioDetails.createdAt
        ? new Date(portfolioDetails.createdAt).toISOString()
        : '',
      topHoldings,
      totals: {
        activityCount:
          portfolioDetails.summary?.activityCount ?? activityStats._count._all,
        cashInBaseCurrency: portfolioDetails.summary?.cash ?? 0,
        holdingsCount,
        holdingsValueInBaseCurrency,
        totalPortfolioValueInBaseCurrency
      },
      warnings
    };
  }

  private clampTopN(topN?: number) {
    if (!Number.isFinite(topN)) {
      return DEFAULT_TOP_N;
    }

    return Math.max(MIN_TOP_N, Math.min(MAX_TOP_N, Math.floor(topN)));
  }
}
