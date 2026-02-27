import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const REBALANCE_SUGGEST_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    constraints: {
      description:
        'Optional rebalancing constraints like cash reserve, max trades, and turnover limits.',
      additionalProperties: false,
      properties: {
        cashReservePct: {
          description:
            'Decimal fraction 0.0–1.0 of portfolio to keep as cash (e.g. 0.02 = 2%).',
          maximum: 1,
          minimum: 0,
          type: 'number'
        },
        maxTrades: { maximum: 1000, minimum: 0, type: 'number' },
        maxTurnoverPct: {
          description:
            'Decimal fraction 0.0–1.0 cap on total traded value relative to portfolio (e.g. 0.2 = 20%).',
          maximum: 1,
          minimum: 0,
          type: 'number'
        },
        minTradeValueInBaseCurrency: { minimum: 0, type: 'number' }
      },
      type: 'object'
    },
    strategy: {
      description:
        'Rebalancing strategy. Use "custom" with targetAllocations for specific targets.',
      enum: ['equal_weight', 'market_cap_weight', 'custom'],
      type: 'string'
    },
    targetAllocations: {
      description:
        'Target allocation per symbol (required when strategy is "custom"). Each targetPct is 0–1.',
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
          currentPct: {
            description:
              'Decimal fraction 0.0–1.0, multiply by 100 for percentage (e.g. 0.25 = 25%).',
            type: 'number'
          },
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
          currentPct: {
            description:
              'Decimal fraction 0.0–1.0, multiply by 100 for percentage.',
            type: 'number'
          },
          driftPct: {
            description:
              'Absolute deviation between currentPct and targetPct as a decimal fraction (e.g. 0.05 = 5 percentage points).',
            type: 'number'
          },
          name: { type: 'string' },
          quantityEstimate: { type: 'number' },
          symbol: { type: 'string' },
          targetPct: {
            description:
              'Decimal fraction 0.0–1.0, multiply by 100 for percentage.',
            type: 'number'
          },
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
        estimatedTurnoverPct: {
          description:
            'Decimal fraction 0.0–1.0 of portfolio value traded (e.g. 0.198 = 19.8%).',
          type: 'number'
        },
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
      description:
        'Ideal target for every position. Check tradeSuggested to know if an actual trade was generated — positions with tradeSuggested=false have a theoretical target only (constraints prevented a trade).',
      items: {
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          symbol: { type: 'string' },
          targetPct: {
            description:
              'Decimal fraction 0.0–1.0, multiply by 100 for percentage (e.g. 0.25 = 25%).',
            type: 'number'
          },
          targetValueInBaseCurrency: { type: 'number' },
          tradeAction: {
            description:
              'Trade direction for this position. Only present when tradeSuggested is true.',
            enum: ['BUY', 'SELL'],
            type: 'string'
          },
          tradeSuggested: {
            description:
              'True if an actual trade was generated for this position. False means the target is theoretical — constraints (turnover cap, max trades) prevented a trade. Do NOT imply this position will be rebalanced when false.',
            type: 'boolean'
          }
        },
        required: [
          'name',
          'symbol',
          'targetPct',
          'targetValueInBaseCurrency',
          'tradeSuggested'
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
