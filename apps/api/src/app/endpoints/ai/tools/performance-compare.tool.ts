import {
  PERFORMANCE_COMPARE_INPUT_SCHEMA,
  PERFORMANCE_COMPARE_OUTPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolJsonSchema
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { BenchmarkService } from '@ghostfolio/api/services/benchmark/benchmark.service';
import { MarketDataService } from '@ghostfolio/api/services/market-data/market-data.service';
import { getIntervalFromDateRange } from '@ghostfolio/common/calculation-helper';
import { DEFAULT_CURRENCY } from '@ghostfolio/common/config';
import { DateRange } from '@ghostfolio/common/types';

import { Injectable } from '@nestjs/common';
import { DataSource } from '@prisma/client';

interface PerformanceCompareInput {
  benchmarkSymbols?: string[];
  dateRange?: DateRange;
}

interface PerformanceCompareOutput {
  assumptions: string[];
  baseCurrency: string;
  benchmarks: {
    dataSource: string;
    marketCondition: string;
    name: string;
    performances: {
      allTimeHigh: {
        date: string;
        performancePercent: number;
      };
      periodReturn?: {
        dataPoints: number;
        endDate: string;
        periodReturnPct: number;
        startDate: string;
      };
    };
    symbol: string;
    trend200d: string;
    trend50d: string;
  }[];
  comparison: {
    outperformingBenchmarks: string[];
    underperformingBenchmarks: string[];
  };
  dateRange: string;
  period: {
    endDate: string;
    startDate: string;
  };
  portfolio: {
    currentNetWorth: number;
    currentValueInBaseCurrency: number;
    firstOrderDate: string;
    hasErrors: boolean;
    netPerformance: number;
    netPerformancePercentage: number;
    netPerformancePercentageWithCurrencyEffect: number;
    netPerformanceWithCurrencyEffect: number;
    totalInvestment: number;
  };
  warnings: {
    code: string;
    message: string;
  }[];
}

const SUPPORTED_DATE_RANGES = [
  '1d',
  'wtd',
  'mtd',
  'ytd',
  '1y',
  '5y',
  'max'
] as const;
const DEFAULT_DATE_RANGE: DateRange = 'ytd';

@Injectable()
export class PerformanceCompareTool implements ToolDefinition<
  PerformanceCompareInput,
  PerformanceCompareOutput
> {
  public readonly description =
    'Compare deterministic portfolio performance against configured benchmarks for a selected date range.';

  public readonly inputSchema: ToolJsonSchema =
    PERFORMANCE_COMPARE_INPUT_SCHEMA;

  public readonly name = 'performance_compare';

  public readonly outputSchema: ToolJsonSchema =
    PERFORMANCE_COMPARE_OUTPUT_SCHEMA;

  public constructor(
    private readonly portfolioService: PortfolioService,
    private readonly benchmarkService: BenchmarkService,
    private readonly marketDataService: MarketDataService,
    private readonly userService: UserService
  ) {}

  public async execute(
    input: PerformanceCompareInput,
    context: ToolExecutionContext
  ): Promise<PerformanceCompareOutput> {
    const dateRange = this.resolveDateRange(input.dateRange);
    const { endDate, startDate } = getIntervalFromDateRange(dateRange);

    const [portfolioResponse, benchmarkResponse, user] = await Promise.all([
      this.portfolioService.getPerformance({
        dateRange,
        impersonationId: undefined,
        userId: context.userId
      }),
      this.benchmarkService.getBenchmarks(),
      this.userService.user({ id: context.userId })
    ]);

    const warnings: PerformanceCompareOutput['warnings'] = [];

    const selectedSymbols = new Set(
      (input.benchmarkSymbols ?? [])
        .map((benchmarkSymbol) => {
          return benchmarkSymbol?.trim().toUpperCase();
        })
        .filter(Boolean)
    );

    const filteredBenchmarks =
      selectedSymbols.size > 0
        ? benchmarkResponse.filter((benchmark) => {
            return selectedSymbols.has(benchmark.symbol.toUpperCase());
          })
        : benchmarkResponse;

    if (selectedSymbols.size > 0 && filteredBenchmarks.length === 0) {
      warnings.push({
        code: 'benchmark_filter_no_matches',
        message:
          'No configured benchmarks matched the requested benchmarkSymbols.'
      });
    }

    // Fetch period return market data for all filtered benchmarks in a single query
    const periodReturnMap = await this.getBenchmarkPeriodReturns(
      filteredBenchmarks,
      startDate,
      endDate
    );

    const benchmarks = await Promise.all(
      filteredBenchmarks.map(async (benchmark) => {
        let trend50d = benchmark.trend50d;
        let trend200d = benchmark.trend200d;

        try {
          const trends = await this.benchmarkService.getBenchmarkTrends({
            dataSource: benchmark.dataSource,
            symbol: benchmark.symbol
          });

          trend50d = trends.trend50d;
          trend200d = trends.trend200d;
        } catch {
          warnings.push({
            code: 'benchmark_trend_unavailable',
            message: `Benchmark trend data unavailable for ${benchmark.symbol}.`
          });
        }

        const periodReturn = periodReturnMap.get(benchmark.symbol);

        return {
          dataSource: benchmark.dataSource.toString(),
          marketCondition: benchmark.marketCondition,
          name: benchmark.name ?? benchmark.symbol,
          performances: {
            allTimeHigh: {
              date: this.toIsoStringOrEmpty(
                benchmark.performances?.allTimeHigh?.date
              ),
              performancePercent:
                benchmark.performances?.allTimeHigh?.performancePercent ?? 0
            },
            ...(periodReturn ? { periodReturn } : {})
          },
          symbol: benchmark.symbol,
          trend200d,
          trend50d
        };
      })
    );

    if (benchmarks.length === 0) {
      warnings.push({
        code: 'no_benchmark_data',
        message: 'No benchmark data is configured or available.'
      });
    }

    const portfolio = {
      currentNetWorth: portfolioResponse.performance.currentNetWorth ?? 0,
      currentValueInBaseCurrency:
        portfolioResponse.performance.currentValueInBaseCurrency ?? 0,
      firstOrderDate: this.toIsoStringOrEmpty(portfolioResponse.firstOrderDate),
      hasErrors: !!portfolioResponse.hasErrors,
      netPerformance: portfolioResponse.performance.netPerformance ?? 0,
      netPerformancePercentage:
        portfolioResponse.performance.netPerformancePercentage ?? 0,
      netPerformancePercentageWithCurrencyEffect:
        portfolioResponse.performance
          .netPerformancePercentageWithCurrencyEffect ?? 0,
      netPerformanceWithCurrencyEffect:
        portfolioResponse.performance.netPerformanceWithCurrencyEffect ?? 0,
      totalInvestment: portfolioResponse.performance.totalInvestment ?? 0
    };

    if (
      portfolio.currentValueInBaseCurrency <= 0 &&
      portfolio.totalInvestment <= 0
    ) {
      warnings.push({
        code: 'empty_portfolio',
        message: 'Portfolio has no investment data for the selected range.'
      });
    }

    if (portfolio.hasErrors) {
      warnings.push({
        code: 'calculation_errors',
        message:
          'Portfolio performance calculation reported internal errors; values may be incomplete.'
      });
    }

    // Track whether any benchmark used period return for the assumptions text
    let anyBenchmarkUsedPeriodReturn = false;

    const comparison = benchmarks.reduce(
      (response, benchmark) => {
        const periodReturn = benchmark.performances.periodReturn;

        if (periodReturn) {
          // Period return available — use direct apples-to-apples comparison
          anyBenchmarkUsedPeriodReturn = true;
          const benchmarkReturnPct = periodReturn.periodReturnPct;

          if (portfolio.netPerformancePercentage > benchmarkReturnPct) {
            response.outperformingBenchmarks.push(benchmark.symbol);
          } else {
            response.underperformingBenchmarks.push(benchmark.symbol);
          }
        } else {
          // Fall back to ATH-drawdown comparison with warning
          warnings.push({
            code: 'benchmark_period_return_unavailable',
            message: `Period return data unavailable for ${benchmark.symbol}; comparison uses ATH drawdown as a proxy (less reliable).`
          });

          const benchmarkMetric =
            benchmark.performances.allTimeHigh.performancePercent;

          if (
            portfolio.netPerformancePercentage > 0 &&
            portfolio.netPerformancePercentage >= benchmarkMetric
          ) {
            response.outperformingBenchmarks.push(benchmark.symbol);
          } else {
            response.underperformingBenchmarks.push(benchmark.symbol);
          }
        }

        return response;
      },
      {
        outperformingBenchmarks: [],
        underperformingBenchmarks: []
      } as PerformanceCompareOutput['comparison']
    );

    return {
      assumptions: anyBenchmarkUsedPeriodReturn
        ? [
            'Benchmark comparison uses period return when historical price data is available for the selected date range. ' +
              'When period return data is insufficient (< 2 data points), comparison falls back to ATH drawdown as a proxy metric, with a warning. ' +
              'Period return is a simple (end/start - 1) calculation and does not account for dividends or splits beyond what the data provider captures.'
          ]
        : [
            'Benchmark comparison uses all-time-high drawdown as benchmark metric, not period return. ' +
              'Outperformance is reported only when the portfolio has positive net returns AND exceeds the ' +
              'benchmark ATH-drawdown value. For direct period-return comparisons, use a data provider ' +
              'that exposes benchmark period returns directly.'
          ],
      baseCurrency:
        user?.settings?.settings?.baseCurrency?.toString() ?? DEFAULT_CURRENCY,
      benchmarks,
      comparison,
      dateRange,
      period: {
        endDate: endDate.toISOString(),
        startDate: startDate.toISOString()
      },
      portfolio,
      warnings
    };
  }

  /**
   * Fetch period returns for all benchmarks in a single MarketData query.
   * Returns a Map from symbol to period return data, or omits symbols
   * where insufficient data exists (< 2 data points or first price <= 0).
   */
  private async getBenchmarkPeriodReturns(
    benchmarks: { dataSource: DataSource | string; symbol: string }[],
    startDate: Date,
    endDate: Date
  ): Promise<
    Map<
      string,
      {
        dataPoints: number;
        endDate: string;
        periodReturnPct: number;
        startDate: string;
      }
    >
  > {
    const result = new Map<
      string,
      {
        dataPoints: number;
        endDate: string;
        periodReturnPct: number;
        startDate: string;
      }
    >();

    if (benchmarks.length === 0) {
      return result;
    }

    const assetProfileIdentifiers = benchmarks.map((benchmark) => ({
      dataSource: benchmark.dataSource as DataSource,
      symbol: benchmark.symbol
    }));

    const marketData = await this.marketDataService.getRange({
      assetProfileIdentifiers,
      dateQuery: { gte: startDate, lt: endDate }
    });

    // Group by symbol
    const bySymbol = new Map<string, { date: Date; marketPrice: number }[]>();

    for (const entry of marketData) {
      const existing = bySymbol.get(entry.symbol) ?? [];
      existing.push({ date: entry.date, marketPrice: entry.marketPrice });
      bySymbol.set(entry.symbol, existing);
    }

    for (const [symbol, prices] of bySymbol) {
      if (prices.length < 2) {
        continue;
      }

      const sorted = prices.sort((a, b) => a.date.getTime() - b.date.getTime());
      const firstPrice = sorted[0].marketPrice;
      const lastPrice = sorted[sorted.length - 1].marketPrice;

      if (firstPrice <= 0) {
        continue;
      }

      result.set(symbol, {
        dataPoints: sorted.length,
        endDate: sorted[sorted.length - 1].date.toISOString(),
        periodReturnPct: (lastPrice - firstPrice) / firstPrice,
        startDate: sorted[0].date.toISOString()
      });
    }

    return result;
  }

  private resolveDateRange(dateRange?: string): DateRange {
    if (!dateRange) {
      return DEFAULT_DATE_RANGE;
    }

    if (SUPPORTED_DATE_RANGES.includes(dateRange as never)) {
      return dateRange;
    }

    return DEFAULT_DATE_RANGE;
  }

  private toIsoStringOrEmpty(value?: Date | string | null): string {
    if (!value) {
      return '';
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      return '';
    }

    return parsedDate.toISOString();
  }
}
