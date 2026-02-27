import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const PORTFOLIO_SUMMARY_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    topN: {
      description: 'Number of top holdings to return (1–25). Default 10.',
      maximum: 25,
      minimum: 1,
      type: 'number'
    }
  },
  type: 'object'
};

export const PORTFOLIO_SUMMARY_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    baseCurrency: { type: 'string' },
    generatedAt: { type: 'string' },
    latestActivityDate: { type: 'string' },
    snapshotCreatedAt: { type: 'string' },
    topHoldings: {
      items: {
        additionalProperties: false,
        properties: {
          allocationInHoldings: { type: 'number' },
          allocationInPortfolio: { type: 'number' },
          assetClass: { type: 'string' },
          currency: { type: 'string' },
          dataSource: { type: 'string' },
          marketPrice: { type: 'number' },
          name: { type: 'string' },
          quantity: { type: 'number' },
          symbol: { type: 'string' },
          valueInBaseCurrency: { type: 'number' }
        },
        required: [
          'allocationInHoldings',
          'allocationInPortfolio',
          'assetClass',
          'currency',
          'dataSource',
          'marketPrice',
          'name',
          'quantity',
          'symbol',
          'valueInBaseCurrency'
        ],
        type: 'object'
      },
      type: 'array'
    },
    totals: {
      additionalProperties: false,
      properties: {
        activityCount: { type: 'number' },
        cashInBaseCurrency: { type: 'number' },
        holdingsCount: { type: 'number' },
        holdingsValueInBaseCurrency: { type: 'number' },
        totalPortfolioValueInBaseCurrency: { type: 'number' }
      },
      required: [
        'activityCount',
        'cashInBaseCurrency',
        'holdingsCount',
        'holdingsValueInBaseCurrency',
        'totalPortfolioValueInBaseCurrency'
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
    'baseCurrency',
    'generatedAt',
    'latestActivityDate',
    'snapshotCreatedAt',
    'topHoldings',
    'totals',
    'warnings'
  ],
  type: 'object'
};
