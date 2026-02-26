import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const INSIDER_ACTIVITY_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    days: {
      description: 'Lookback period in days (default: 30, max: 90)',
      maximum: 90,
      minimum: 1,
      type: 'number'
    },
    symbols: {
      description:
        'List of stock ticker symbols to check for insider activity. If empty, checks top portfolio holdings.',
      items: { type: 'string' },
      type: 'array'
    }
  },
  required: ['symbols'],
  type: 'object'
};

export const INSIDER_ACTIVITY_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    disclaimers: { items: { type: 'string' }, type: 'array' },
    providerName: { type: 'string' },
    transactions: {
      items: {
        additionalProperties: false,
        properties: {
          insiderName: { type: 'string' },
          insiderRelation: { type: 'string' },
          price: { type: 'number' },
          shares: { type: 'number' },
          side: { enum: ['buy', 'sell', 'other'], type: 'string' },
          sourceUrl: { type: 'string' },
          symbol: { type: 'string' },
          txDate: { type: 'string' },
          valueUsd: { type: 'number' }
        },
        required: ['symbol', 'txDate', 'insiderName', 'side'],
        type: 'object'
      },
      type: 'array'
    },
    warnings: { items: { type: 'string' }, type: 'array' }
  },
  required: ['transactions', 'providerName', 'disclaimers', 'warnings'],
  type: 'object'
};
