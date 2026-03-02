import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const ANALYZE_RISK_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    concentrationSingleThreshold: {
      description:
        'Max fraction (0–1) a single position may occupy. Default 0.3.',
      maximum: 1,
      minimum: 0,
      type: 'number'
    },
    concentrationTop3Threshold: {
      description:
        'Max combined fraction (0–1) of top 3 holdings. Default 0.6.',
      maximum: 1,
      minimum: 0,
      type: 'number'
    },
    dateRange: {
      description:
        'Period for statistical metrics (Sharpe, Sortino, drawdown, VaR). ' +
        'Supported: "1d", "wtd", "mtd", "ytd", "1y", "5y", "max". Default "1y".',
      enum: ['1d', 'wtd', 'mtd', 'ytd', '1y', '5y', 'max'],
      type: 'string'
    },
    riskFreeRatePct: {
      description:
        'Annual risk-free rate as a fraction (e.g. 0.04 = 4%). Used for Sharpe/Sortino/alpha. Default 0.04.',
      maximum: 1,
      minimum: 0,
      type: 'number'
    },
    sectorConcentrationThreshold: {
      description: 'Max fraction (0–1) any one sector may occupy. Default 0.4.',
      maximum: 1,
      minimum: 0,
      type: 'number'
    }
  },
  type: 'object'
};

export const ANALYZE_RISK_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    assumptions: { items: { type: 'string' }, type: 'array' },
    baseCurrency: { type: 'string' },
    exposures: {
      additionalProperties: false,
      properties: {
        assetClassExposures: {
          items: {
            additionalProperties: false,
            properties: {
              allocationInPortfolio: { type: 'number' },
              assetClass: { type: 'string' }
            },
            required: ['allocationInPortfolio', 'assetClass'],
            type: 'object'
          },
          type: 'array'
        },
        sectorCoverageInPortfolio: { type: 'number' },
        top3AllocationInPortfolio: { type: 'number' },
        topHoldings: {
          items: {
            additionalProperties: false,
            properties: {
              allocationInPortfolio: { type: 'number' },
              assetClass: { type: 'string' },
              name: { type: 'string' },
              symbol: { type: 'string' },
              valueInBaseCurrency: { type: 'number' }
            },
            required: [
              'allocationInPortfolio',
              'assetClass',
              'name',
              'symbol',
              'valueInBaseCurrency'
            ],
            type: 'object'
          },
          type: 'array'
        },
        topSectorExposures: {
          items: {
            additionalProperties: false,
            properties: {
              allocationInPortfolio: { type: 'number' },
              sector: { type: 'string' }
            },
            required: ['allocationInPortfolio', 'sector'],
            type: 'object'
          },
          type: 'array'
        }
      },
      required: [
        'assetClassExposures',
        'sectorCoverageInPortfolio',
        'top3AllocationInPortfolio',
        'topHoldings',
        'topSectorExposures'
      ],
      type: 'object'
    },
    flags: {
      items: {
        additionalProperties: false,
        properties: {
          code: { type: 'string' },
          description: { type: 'string' },
          metricName: { type: 'string' },
          metricValue: { type: 'number' },
          severity: { enum: ['high', 'medium', 'low'], type: 'string' },
          threshold: { type: 'number' },
          title: { type: 'string' }
        },
        required: [
          'code',
          'description',
          'metricName',
          'metricValue',
          'severity',
          'threshold',
          'title'
        ],
        type: 'object'
      },
      type: 'array'
    },
    generatedAt: { type: 'string' },
    statisticalMetrics: {
      additionalProperties: false,
      description:
        'Portfolio statistical risk metrics computed from historical return data. ' +
        'Only present when sufficient chart data is available (≥5 data points).',
      properties: {
        alpha: {
          description:
            "Jensen's alpha (annualized). Only present when benchmark data is available.",
          type: 'number'
        },
        annualizedReturnPct: {
          description: 'Annualized return as a fraction (0.15 = 15%).',
          type: 'number'
        },
        annualizedVolatilityPct: {
          description:
            'Annualized volatility (daily stddev × √252) as a fraction.',
          type: 'number'
        },
        beta: {
          description:
            'Portfolio beta vs benchmark. Only present when benchmark data is available.',
          type: 'number'
        },
        currentDrawdownPct: {
          description:
            'Current decline from peak as a positive fraction (0.05 = 5% below peak).',
          type: 'number'
        },
        cvarPct95: {
          description:
            'Conditional Value at Risk at 95% confidence (expected shortfall) as a positive fraction.',
          type: 'number'
        },
        dataPointCount: { type: 'number' },
        maxDrawdownPct: {
          description:
            'Maximum peak-to-trough decline as a positive fraction (0.25 = 25%).',
          type: 'number'
        },
        periodEndDate: { type: 'string' },
        periodStartDate: { type: 'string' },
        sharpeRatio: {
          description: 'Annualized Sharpe ratio.',
          type: 'number'
        },
        sortinoRatio: {
          description: 'Annualized Sortino ratio.',
          type: 'number'
        },
        varPct95: {
          description:
            'Historical 1-day Value at Risk at 95% confidence as a positive fraction.',
          type: 'number'
        }
      },
      required: [
        'annualizedReturnPct',
        'annualizedVolatilityPct',
        'currentDrawdownPct',
        'cvarPct95',
        'dataPointCount',
        'maxDrawdownPct',
        'periodEndDate',
        'periodStartDate',
        'sharpeRatio',
        'sortinoRatio',
        'varPct95'
      ],
      type: 'object'
    },
    holdingsCount: { type: 'number' },
    overallRiskLevel: { enum: ['LOW', 'MEDIUM', 'HIGH'], type: 'string' },
    portfolioValueInBaseCurrency: { type: 'number' },
    volatilityProxyScore: { type: 'number' },
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
    'exposures',
    'flags',
    'generatedAt',
    'holdingsCount',
    'overallRiskLevel',
    'portfolioValueInBaseCurrency',
    'volatilityProxyScore',
    'warnings'
  ],
  type: 'object'
};
