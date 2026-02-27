import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const COMPLIANCE_CHECK_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    rules: {
      description: 'Optional compliance rule overrides. Omit to use defaults.',
      additionalProperties: false,
      properties: {
        maxAssetClassPct: { maximum: 1, minimum: 0, type: 'number' },
        maxCashPct: { maximum: 1, minimum: 0, type: 'number' },
        maxSectorPct: { maximum: 1, minimum: 0, type: 'number' },
        maxSinglePositionPct: { maximum: 1, minimum: 0, type: 'number' },
        maxTop3Pct: { maximum: 1, minimum: 0, type: 'number' },
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
          currentValue: { type: 'number' },
          description: { type: 'string' },
          details: { type: 'string' },
          ruleId: { type: 'string' },
          ruleName: { type: 'string' },
          status: { enum: ['pass', 'fail', 'warn', 'skip'], type: 'string' },
          threshold: { type: 'number' }
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
