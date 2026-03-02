import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const COMPLIANCE_CHECK_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    rules: {
      description: 'Optional compliance rule overrides. Omit to use defaults.',
      additionalProperties: false,
      properties: {
        maxAssetClassPct: {
          description:
            'Decimal fraction 0.0–1.0. Max allowed allocation for a single asset class (e.g. 0.4 = 40%).',
          maximum: 1,
          minimum: 0,
          type: 'number'
        },
        maxCashPct: {
          description:
            'Decimal fraction 0.0–1.0. Max allowed cash allocation (e.g. 0.1 = 10%).',
          maximum: 1,
          minimum: 0,
          type: 'number'
        },
        maxSectorPct: {
          description:
            'Decimal fraction 0.0–1.0. Max allowed allocation for a single sector (e.g. 0.3 = 30%).',
          maximum: 1,
          minimum: 0,
          type: 'number'
        },
        maxSinglePositionPct: {
          description:
            'Decimal fraction 0.0–1.0. Max allowed allocation for a single position (e.g. 0.2 = 20%).',
          maximum: 1,
          minimum: 0,
          type: 'number'
        },
        maxTop3Pct: {
          description:
            'Decimal fraction 0.0–1.0. Max combined allocation for the top 3 positions (e.g. 0.6 = 60%).',
          maximum: 1,
          minimum: 0,
          type: 'number'
        },
        minHoldingsCount: { maximum: 1000, minimum: 0, type: 'number' },
        restrictedAssetClasses: { items: { type: 'string' }, type: 'array' },
        restrictedSymbols: { items: { type: 'string' }, type: 'array' }
      },
      type: 'object'
    }
  },
  type: 'object'
};

export const COMPLIANCE_CHECK_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    assumptions: { items: { type: 'string' }, type: 'array' },
    baseCurrency: { type: 'string' },
    generatedAt: { type: 'string' },
    holdingsCount: { type: 'number' },
    overallStatus: {
      enum: ['COMPLIANT', 'NON_COMPLIANT', 'NEEDS_REVIEW'],
      type: 'string'
    },
    portfolioValueInBaseCurrency: { type: 'number' },
    results: {
      items: {
        additionalProperties: false,
        properties: {
          currentValue: {
            description:
              'The measured value for this rule. For allocation rules this is a decimal fraction 0.0–1.0 (multiply by 100 for %). For count rules this is a whole number.',
            type: 'number'
          },
          description: { type: 'string' },
          details: { type: 'string' },
          ruleId: { type: 'string' },
          ruleName: { type: 'string' },
          status: { enum: ['pass', 'fail', 'warn', 'skip'], type: 'string' },
          threshold: {
            description:
              'The rule limit. For allocation rules this is a decimal fraction 0.0–1.0. For count rules this is a whole number.',
            type: 'number'
          }
        },
        required: [
          'currentValue',
          'description',
          'details',
          'ruleId',
          'ruleName',
          'status',
          'threshold'
        ],
        type: 'object'
      },
      type: 'array'
    },
    rulesChecked: { type: 'number' },
    rulesFailed: { type: 'number' },
    rulesPassed: { type: 'number' },
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
    'generatedAt',
    'holdingsCount',
    'overallStatus',
    'portfolioValueInBaseCurrency',
    'results',
    'rulesChecked',
    'rulesFailed',
    'rulesPassed',
    'warnings'
  ],
  type: 'object'
};
