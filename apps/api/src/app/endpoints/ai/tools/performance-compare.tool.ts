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
import { getIntervalFromDateRange } from '@ghostfolio/common/calculation-helper';
import { DEFAULT_CURRENCY } from '@ghostfolio/common/config';
import { DateRange } from '@ghostfolio/common/types';

import { Injectable } from '@nestjs/common';

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
    private readonly userService: UserService
  ) {}

  public async execute(
    input: PerformanceCompareInput,
    context: ToolExecutionContext
  ): Promise<PerformanceCompareOutput> {
    const dateRange = this.resolveDateRange(input.dateRange);
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
            }
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

    const comparison = benchmarks.reduce(
      (response, benchmark) => {
        const benchmarkMetric =
          benchmark.performances.allTimeHigh.performancePercent;

        // Outperformance requires the portfolio to have positive returns AND
        // to exceed the benchmark's ATH-drawdown metric. This prevents a
        // portfolio with negative returns from being classified as
        // "outperforming" simply because it lost less than the benchmark's
        // drawdown from its all-time-high.
        if (
          portfolio.netPerformancePercentage > 0 &&
          portfolio.netPerformancePercentage >= benchmarkMetric
        ) {
          response.outperformingBenchmarks.push(benchmark.symbol);
        } else {
          response.underperformingBenchmarks.push(benchmark.symbol);
        }

        return response;
      },
      {
        outperformingBenchmarks: [],
        underperformingBenchmarks: []
      } as PerformanceCompareOutput['comparison']
    );

    const { endDate, startDate } = getIntervalFromDateRange(dateRange);

    return {
      assumptions: [
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
