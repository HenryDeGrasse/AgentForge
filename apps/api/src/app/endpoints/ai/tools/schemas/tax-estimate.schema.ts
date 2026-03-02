import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const TAX_ESTIMATE_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    holdingPeriodMonths: {
      description: 'Short/long-term boundary in months (1–120). Default 12.',
      maximum: 120,
      minimum: 1,
      type: 'number'
    },
    hypotheticalTrades: {
      description:
        'Optional list of hypothetical future sells to estimate tax impact for. ' +
        'Useful when the user asks "what would my tax hit be if I sold X shares of Y?" ' +
        'Provide exactly one of: quantity, notionalValueInBaseCurrency, or fractionOfPosition.',
      items: {
        additionalProperties: false,
        properties: {
          action: {
            description: 'Must be "sell" — only sells generate tax events.',
            enum: ['sell'],
            type: 'string'
          },
          fractionOfPosition: {
            description:
              'Fraction of the current open position to sell (0–1). E.g. 0.5 = sell half.',
            maximum: 1,
            minimum: 0,
            type: 'number'
          },
          notionalValueInBaseCurrency: {
            description:
              'Dollar (base-currency) amount to sell. Converted to shares using current market price.',
            minimum: 0,
            type: 'number'
          },
          quantity: {
            description: 'Exact number of shares to sell.',
            minimum: 0,
            type: 'number'
          },
          symbol: {
            description: 'Ticker symbol of the holding to sell (e.g. "NVDA").',
            type: 'string'
          }
        },
        required: ['action', 'symbol'],
        type: 'object'
      },
      type: 'array'
    },
    jurisdiction: {
      description:
        'Tax jurisdiction code (e.g. "US", "UK", "DE"). Defaults to generic.',
      type: 'string'
    },
    taxYear: {
      description: 'Tax year (1900–2100). Defaults to current year.',
      maximum: 2100,
      minimum: 1900,
      type: 'number'
    }
  },
  type: 'object'
};

const GAIN_LOSS_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    gainInBaseCurrency: { type: 'number' },
    lossInBaseCurrency: { type: 'number' },
    netInBaseCurrency: { type: 'number' },
    transactionCount: { type: 'number' }
  },
  required: [
    'gainInBaseCurrency',
    'lossInBaseCurrency',
    'netInBaseCurrency',
    'transactionCount'
  ],
  type: 'object'
};

const HYPOTHETICAL_TRADE_RESULT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    estimatedCostBasisInBaseCurrency: { type: 'number' },
    estimatedGainInBaseCurrency: { type: 'number' },
    estimatedProceedsInBaseCurrency: { type: 'number' },
    isLongTerm: {
      description:
        'True when the oldest FIFO lot used has been held longer than holdingPeriodMonths.',
      type: 'boolean'
    },
    longTermGainInBaseCurrency: { type: 'number' },
    oldestLotHoldingPeriodDays: { type: 'number' },
    quantitySold: { type: 'number' },
    shortTermGainInBaseCurrency: { type: 'number' },
    symbol: { type: 'string' },
    warning: {
      description:
        'Present when lots were insufficient or market price was unavailable.',
      type: 'string'
    }
  },
  required: [
    'estimatedCostBasisInBaseCurrency',
    'estimatedGainInBaseCurrency',
    'estimatedProceedsInBaseCurrency',
    'isLongTerm',
    'longTermGainInBaseCurrency',
    'oldestLotHoldingPeriodDays',
    'quantitySold',
    'shortTermGainInBaseCurrency',
    'symbol'
  ],
  type: 'object'
};

export const TAX_ESTIMATE_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    assumptions: { items: { type: 'string' }, type: 'array' },
    baseCurrency: { type: 'string' },
    disclaimers: { items: { type: 'string' }, type: 'array' },
    hypotheticalImpact: {
      additionalProperties: false,
      description:
        'Present only when hypotheticalTrades were requested. Shows estimated tax impact of proposed future sells.',
      properties: {
        totalEstimatedGainInBaseCurrency: { type: 'number' },
        totalLongTermGainInBaseCurrency: { type: 'number' },
        totalShortTermGainInBaseCurrency: { type: 'number' },
        trades: { items: HYPOTHETICAL_TRADE_RESULT_SCHEMA, type: 'array' }
      },
      required: [
        'totalEstimatedGainInBaseCurrency',
        'totalLongTermGainInBaseCurrency',
        'totalShortTermGainInBaseCurrency',
        'trades'
      ],
      type: 'object'
    },
    jurisdiction: { type: 'string' },
    realizedGains: {
      additionalProperties: false,
      properties: {
        longTerm: GAIN_LOSS_SCHEMA,
        shortTerm: GAIN_LOSS_SCHEMA,
        total: GAIN_LOSS_SCHEMA
      },
      required: ['longTerm', 'shortTerm', 'total'],
      type: 'object'
    },
    taxLossHarvestingCandidates: {
      items: {
        additionalProperties: false,
        properties: {
          costBasisInBaseCurrency: { type: 'number' },
          currentValueInBaseCurrency: { type: 'number' },
          holdingPeriodDays: { type: 'number' },
          isLongTerm: { type: 'boolean' },
          name: { type: 'string' },
          symbol: { type: 'string' },
          unrealizedLossInBaseCurrency: { type: 'number' }
        },
        required: [
          'costBasisInBaseCurrency',
          'currentValueInBaseCurrency',
          'holdingPeriodDays',
          'isLongTerm',
          'name',
          'symbol',
          'unrealizedLossInBaseCurrency'
        ],
        type: 'object'
      },
      type: 'array'
    },
    taxYear: { type: 'number' },
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
    'disclaimers',
    'jurisdiction',
    'realizedGains',
    'taxLossHarvestingCandidates',
    'taxYear',
    'warnings'
  ],
  type: 'object'
};
