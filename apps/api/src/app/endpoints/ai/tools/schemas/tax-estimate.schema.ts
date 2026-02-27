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

export const TAX_ESTIMATE_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    assumptions: { items: { type: 'string' }, type: 'array' },
    baseCurrency: { type: 'string' },
    disclaimers: { items: { type: 'string' }, type: 'array' },
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
