import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const MARKET_DATA_LOOKUP_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    dataSource: {
      description: 'Data provider (e.g. "YAHOO"). Auto-resolved if omitted.',
      type: 'string'
    },
    historyDays: {
      description:
        'Number of days of price history to include (1–365). Only used when includeHistory is true.',
      maximum: 365,
      minimum: 1,
      type: 'number'
    },
    includeHistory: {
      description:
        'If true, include daily historical prices for the last historyDays.',
      type: 'boolean'
    },
    symbol: {
      description: 'Ticker symbol to look up (e.g. "AAPL", "MSFT", "BTC-USD").',
      type: 'string'
    }
  },
  required: ['symbol'],
  type: 'object'
};

export const MARKET_DATA_LOOKUP_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    assetClass: { type: 'string' },
    assetSubClass: { type: 'string' },
    countries: {
      items: {
        additionalProperties: false,
        properties: {
          code: { type: 'string' },
          weight: { type: 'number' }
        },
        required: ['code', 'weight'],
        type: 'object'
      },
      type: 'array'
    },
    currency: { type: 'string' },
    dataSource: { type: 'string' },
    historicalData: {
      items: {
        additionalProperties: false,
        properties: {
          date: { type: 'string' },
          marketPrice: { type: 'number' }
        },
        required: ['date', 'marketPrice'],
        type: 'object'
      },
      type: 'array'
    },
    marketPrice: { type: 'number' },
    name: { type: 'string' },
    priceChange: {
      additionalProperties: false,
      properties: {
        absoluteChange: { type: 'number' },
        percentChange: { type: 'number' },
        periodDays: { type: 'number' }
      },
      required: ['absoluteChange', 'percentChange', 'periodDays'],
      type: 'object'
    },
    priceUpdatedAt: { type: 'string' },
    sectors: {
      items: {
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          weight: { type: 'number' }
        },
        required: ['name', 'weight'],
        type: 'object'
      },
      type: 'array'
    },
    symbol: { type: 'string' },
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
