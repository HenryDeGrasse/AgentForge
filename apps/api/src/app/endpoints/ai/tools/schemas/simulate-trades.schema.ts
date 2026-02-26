import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const SIMULATE_TRADES_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    trades: {
      items: {
        additionalProperties: false,
        properties: {
          action: { enum: ['buy', 'sell'], type: 'string' },
          fractionOfPosition: { maximum: 1, minimum: 0, type: 'number' },
          notionalUsd: { minimum: 0, type: 'number' },
          price: { minimum: 0, type: 'number' },
          quantity: { minimum: 0, type: 'number' },
          symbol: { type: 'string' }
        },
        required: ['symbol', 'action'],
        type: 'object'
      },
      type: 'array'
    }
  },
  required: ['trades'],
  type: 'object'
};

export const SIMULATE_TRADES_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    disclaimers: { items: { type: 'string' }, type: 'array' },
    hypotheticalPortfolio: {
      additionalProperties: false,
      properties: {
        cashBalance: { type: 'number' },
        positions: {
          items: {
            additionalProperties: false,
            properties: {
              allocationPct: { type: 'number' },
              symbol: { type: 'string' },
              valueInBaseCurrency: { type: 'number' }
            },
            required: ['symbol', 'valueInBaseCurrency', 'allocationPct'],
            type: 'object'
          },
          type: 'array'
        },
        totalValueInBaseCurrency: { type: 'number' }
      },
      required: ['totalValueInBaseCurrency', 'cashBalance', 'positions'],
      type: 'object'
    },
    impact: {
      additionalProperties: false,
      properties: {
        allocationChanges: {
          items: {
            additionalProperties: false,
            properties: {
              changePct: { type: 'number' },
              currentPct: { type: 'number' },
              newPct: { type: 'number' },
              symbol: { type: 'string' }
            },
            required: ['symbol', 'currentPct', 'newPct', 'changePct'],
            type: 'object'
          },
          type: 'array'
        },
        cashDelta: { type: 'number' },
        concentrationWarnings: { items: { type: 'string' }, type: 'array' },
        totalValueChangeInBaseCurrency: { type: 'number' }
      },
      required: [
        'totalValueChangeInBaseCurrency',
        'cashDelta',
        'allocationChanges',
        'concentrationWarnings'
      ],
      type: 'object'
    },
    portfolioBefore: {
      additionalProperties: false,
      properties: {
        cashBalance: { type: 'number' },
        positions: {
          items: {
            additionalProperties: false,
            properties: {
              allocationPct: { type: 'number' },
              symbol: { type: 'string' },
              valueInBaseCurrency: { type: 'number' }
            },
            required: ['symbol', 'valueInBaseCurrency', 'allocationPct'],
            type: 'object'
          },
          type: 'array'
        },
        totalValueInBaseCurrency: { type: 'number' }
      },
      required: ['totalValueInBaseCurrency', 'cashBalance', 'positions'],
      type: 'object'
    },
    status: { enum: ['success', 'partial'], type: 'string' },
    tradeResults: {
      items: {
        additionalProperties: false,
        properties: {
          acceptedQuantity: { type: 'number' },
          action: { type: 'string' },
          costInBaseCurrency: { type: 'number' },
          priceUsed: { type: 'number' },
          requestedQuantity: { type: 'number' },
          status: { enum: ['executed', 'skipped', 'capped'], type: 'string' },
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
          'symbol',
          'action',
          'requestedQuantity',
          'acceptedQuantity',
          'priceUsed',
          'costInBaseCurrency',
          'status',
          'warnings'
        ],
        type: 'object'
      },
      type: 'array'
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
    'status',
    'portfolioBefore',
    'hypotheticalPortfolio',
    'tradeResults',
    'impact',
    'disclaimers',
    'warnings'
  ],
  type: 'object'
};
