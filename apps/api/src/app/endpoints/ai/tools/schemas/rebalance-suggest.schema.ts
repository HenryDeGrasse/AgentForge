import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const REBALANCE_SUGGEST_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    constraints: {
      additionalProperties: false,
      properties: {
        cashReservePct: { maximum: 1, minimum: 0, type: 'number' },
        maxTrades: { maximum: 1000, minimum: 0, type: 'number' },
        maxTurnoverPct: { maximum: 1, minimum: 0, type: 'number' },
        minTradeValueInBaseCurrency: { minimum: 0, type: 'number' }
      },
      type: 'object'
    },
    strategy: {
      enum: ['equal_weight', 'market_cap_weight', 'custom'],
      type: 'string'
    },
    targetAllocations: {
      items: {
        additionalProperties: false,
        properties: {
          symbol: { type: 'string' },
          targetPct: { maximum: 1, minimum: 0, type: 'number' }
        },
        required: ['symbol', 'targetPct'],
        type: 'object'
      },
      type: 'array'
    }
  },
  type: 'object'
};

export const REBALANCE_SUGGEST_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    assumptions: { items: { type: 'string' }, type: 'array' },
    baseCurrency: { type: 'string' },
    currentAllocations: {
      items: {
        additionalProperties: false,
        properties: {
          currentPct: { type: 'number' },
          currentValueInBaseCurrency: { type: 'number' },
          name: { type: 'string' },
          symbol: { type: 'string' }
        },
        required: [
          'currentPct',
          'currentValueInBaseCurrency',
          'name',
          'symbol'
        ],
        type: 'object'
      },
      type: 'array'
    },
    disclaimers: { items: { type: 'string' }, type: 'array' },
    generatedAt: { type: 'string' },
    portfolioValueInBaseCurrency: { type: 'number' },
    strategy: { type: 'string' },
    suggestedTrades: {
      items: {
        additionalProperties: false,
        properties: {
          action: { enum: ['BUY', 'SELL'], type: 'string' },
          currentPct: { type: 'number' },
          driftPct: { type: 'number' },
          name: { type: 'string' },
          quantityEstimate: { type: 'number' },
          symbol: { type: 'string' },
          targetPct: { type: 'number' },
          valueInBaseCurrency: { type: 'number' }
        },
        required: [
          'action',
          'currentPct',
          'driftPct',
          'name',
          'quantityEstimate',
          'symbol',
          'targetPct',
          'valueInBaseCurrency'
        ],
        type: 'object'
      },
      type: 'array'
    },
    summary: {
      additionalProperties: false,
      properties: {
        constraintsApplied: { items: { type: 'string' }, type: 'array' },
        estimatedTurnoverPct: { type: 'number' },
        totalBuyValueInBaseCurrency: { type: 'number' },
        totalSellValueInBaseCurrency: { type: 'number' },
        totalTradesCount: { type: 'number' },
        tradesLimitedByConstraints: { type: 'boolean' }
      },
      required: [
        'constraintsApplied',
        'estimatedTurnoverPct',
        'totalBuyValueInBaseCurrency',
        'totalSellValueInBaseCurrency',
        'totalTradesCount',
        'tradesLimitedByConstraints'
      ],
      type: 'object'
    },
    targetAllocations: {
      items: {
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          symbol: { type: 'string' },
          targetPct: { type: 'number' },
          targetValueInBaseCurrency: { type: 'number' }
        },
        required: ['name', 'symbol', 'targetPct', 'targetValueInBaseCurrency'],
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
    'assumptions',
    'baseCurrency',
    'currentAllocations',
    'disclaimers',
    'generatedAt',
    'portfolioValueInBaseCurrency',
    'strategy',
    'suggestedTrades',
    'summary',
    'targetAllocations',
    'warnings'
  ],
  type: 'object'
};
