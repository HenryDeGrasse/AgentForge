import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const ANALYZE_RISK_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    concentrationSingleThreshold: { maximum: 1, minimum: 0, type: 'number' },
    concentrationTop3Threshold: { maximum: 1, minimum: 0, type: 'number' },
    sectorConcentrationThreshold: { maximum: 1, minimum: 0, type: 'number' }
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
            required: ['allocationInPortfolio', 'assetClass', 'name', 'symbol', 'valueInBaseCurrency'],
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
        'assetClassExposures', 'sectorCoverageInPortfolio',
        'top3AllocationInPortfolio', 'topHoldings', 'topSectorExposures'
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
        required: ['code', 'description', 'metricName', 'metricValue', 'severity', 'threshold', 'title'],
        type: 'object'
      },
      type: 'array'
    },
    generatedAt: { type: 'string' },
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
    'assumptions', 'baseCurrency', 'exposures', 'flags', 'generatedAt',
    'holdingsCount', 'overallRiskLevel', 'portfolioValueInBaseCurrency',
    'volatilityProxyScore', 'warnings'
  ],
  type: 'object'
};
