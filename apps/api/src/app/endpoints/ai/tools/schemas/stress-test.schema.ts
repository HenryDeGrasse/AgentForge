import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const STRESS_TEST_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    customShocks: {
      items: {
        additionalProperties: false,
        properties: {
          assetClass: { type: 'string' },
          shockPercent: { type: 'number' }
        },
        required: ['assetClass', 'shockPercent'],
        type: 'object'
      },
      type: 'array'
    },
    scenarioId: { type: 'string' }
  },
  type: 'object'
};

export const STRESS_TEST_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    assetClassImpacts: {
      items: {
        additionalProperties: false,
        properties: {
          currentValueInBaseCurrency: { type: 'number' },
          lossPct: { type: 'number' },
          name: { type: 'string' },
          stressedValueInBaseCurrency: { type: 'number' }
        },
        required: [
          'name',
          'currentValueInBaseCurrency',
          'stressedValueInBaseCurrency',
          'lossPct'
        ],
        type: 'object'
      },
      type: 'array'
    },
    availableScenarioIds: { items: { type: 'string' }, type: 'array' },
    currentValueInBaseCurrency: { type: 'number' },
    disclaimers: { items: { type: 'string' }, type: 'array' },
    mostVulnerable: {
      items: {
        additionalProperties: false,
        properties: {
          lossPct: { type: 'number' },
          symbol: { type: 'string' }
        },
        required: ['symbol', 'lossPct'],
        type: 'object'
      },
      type: 'array'
    },
    positionImpacts: {
      items: {
        additionalProperties: false,
        properties: {
          currentValueInBaseCurrency: { type: 'number' },
          lossInBaseCurrency: { type: 'number' },
          lossPct: { type: 'number' },
          stressedValueInBaseCurrency: { type: 'number' },
          symbol: { type: 'string' }
        },
        required: [
          'symbol',
          'currentValueInBaseCurrency',
          'stressedValueInBaseCurrency',
          'lossInBaseCurrency',
          'lossPct'
        ],
        type: 'object'
      },
      type: 'array'
    },
    recoveryNeededPct: { type: 'number' },
    scenario: {
      additionalProperties: false,
      properties: {
        description: { type: 'string' },
        id: { type: 'string' },
        name: { type: 'string' },
        shocks: {
          items: {
            additionalProperties: false,
            properties: {
              assetClass: { type: 'string' },
              shockPercent: { type: 'number' }
            },
            required: ['assetClass', 'shockPercent'],
            type: 'object'
          },
          type: 'array'
        }
      },
      required: ['id', 'name', 'description', 'shocks'],
      type: 'object'
    },
    status: { enum: ['success', 'partial'], type: 'string' },
    stressedValueInBaseCurrency: { type: 'number' },
    totalLossInBaseCurrency: { type: 'number' },
    totalLossPct: { type: 'number' },
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
    'scenario',
    'currentValueInBaseCurrency',
    'stressedValueInBaseCurrency',
    'totalLossInBaseCurrency',
    'totalLossPct',
    'positionImpacts',
    'assetClassImpacts',
    'mostVulnerable',
    'recoveryNeededPct',
    'disclaimers',
    'warnings'
  ],
  type: 'object'
};
