import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const PERFORMANCE_COMPARE_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    benchmarkSymbols: {
      description:
        'Benchmark ticker symbols to compare against (e.g. ["SPY", "QQQ"]).',
      items: { type: 'string' },
      type: 'array'
    },
    dateRange: {
      description:
        'Time range for comparison. Options: 1d, wtd, mtd, ytd, 1y, 5y, max.',
      enum: ['1d', 'wtd', 'mtd', 'ytd', '1y', '5y', 'max'],
      type: 'string'
    }
  },
  type: 'object'
};

export const PERFORMANCE_COMPARE_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    assumptions: { items: { type: 'string' }, type: 'array' },
    baseCurrency: { type: 'string' },
    benchmarks: {
      items: {
        additionalProperties: false,
        properties: {
          dataSource: { type: 'string' },
          marketCondition: { type: 'string' },
          name: { type: 'string' },
          performances: {
            additionalProperties: false,
            properties: {
              allTimeHigh: {
                additionalProperties: false,
                properties: {
                  date: { type: 'string' },
                  performancePercent: {
                    description:
                      'Whole-number percentage return (e.g. 12.4 = +12.4%). Already multiplied by 100; display as-is.',
                    type: 'number'
                  }
                },
                required: ['date', 'performancePercent'],
                type: 'object'
              }
            },
            required: ['allTimeHigh'],
            type: 'object'
          },
          symbol: { type: 'string' },
          trend200d: { type: 'string' },
          trend50d: { type: 'string' }
        },
        required: [
          'dataSource',
          'marketCondition',
          'name',
          'performances',
          'symbol',
          'trend200d',
          'trend50d'
        ],
        type: 'object'
      },
      type: 'array'
    },
    comparison: {
      additionalProperties: false,
      properties: {
        outperformingBenchmarks: { items: { type: 'string' }, type: 'array' },
        underperformingBenchmarks: { items: { type: 'string' }, type: 'array' }
      },
      required: ['outperformingBenchmarks', 'underperformingBenchmarks'],
      type: 'object'
    },
    dateRange: { type: 'string' },
    period: {
      additionalProperties: false,
      properties: {
        endDate: { type: 'string' },
        startDate: { type: 'string' }
      },
      required: ['endDate', 'startDate'],
      type: 'object'
    },
    portfolio: {
      additionalProperties: false,
      properties: {
        currentNetWorth: { type: 'number' },
        currentValueInBaseCurrency: { type: 'number' },
        firstOrderDate: { type: 'string' },
        hasErrors: { type: 'boolean' },
        netPerformance: { type: 'number' },
        netPerformancePercentage: {
          description:
            'Whole-number percentage net return (e.g. 8.2 = +8.2%). Already multiplied by 100; display as-is.',
          type: 'number'
        },
        netPerformancePercentageWithCurrencyEffect: {
          description:
            'Same as netPerformancePercentage but adjusted for currency effects. Already multiplied by 100.',
          type: 'number'
        },
        netPerformanceWithCurrencyEffect: { type: 'number' },
        totalInvestment: { type: 'number' }
      },
      required: [
        'currentNetWorth',
        'currentValueInBaseCurrency',
        'firstOrderDate',
        'hasErrors',
        'netPerformance',
        'netPerformancePercentage',
        'netPerformancePercentageWithCurrencyEffect',
        'netPerformanceWithCurrencyEffect',
        'totalInvestment'
      ],
      type: 'object'
    },
    warnings: {
      items: {
        additionalProperties: false,
        properties: {
          code: { type: 'string' },
          message: { type: 'string' }
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
    'benchmarks',
    'comparison',
    'dateRange',
    'period',
    'portfolio',
    'warnings'
  ],
  type: 'object'
};
