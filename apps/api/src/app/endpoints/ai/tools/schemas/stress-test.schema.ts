import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const STRESS_TEST_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    customShocks: {
      description:
        'Custom shock array. Each entry applies a percentage shock to an asset class. Use instead of scenarioId.',
      items: {
        additionalProperties: false,
        properties: {
          assetClass: { type: 'string' },
          shockPercent: {
            description:
              'Whole-number shock (e.g. -35 = 35% drop, +5 = 5% gain).',
            type: 'number'
          }
        },
        required: ['assetClass', 'shockPercent'],
        type: 'object'
      },
      type: 'array'
    },
    scenarioId: {
      description:
        'Predefined scenario: market_crash_2008, dot_com_bust, covid_crash, rising_rates, crypto_winter, or stagflation.',
      type: 'string'
    }
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
          lossPct: {
            description:
              'Whole-number percentage loss applied to this asset class (e.g. -35 = 35% drop). Already multiplied by 100; display as-is.',
            type: 'number'
          },
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
          lossPct: {
            description:
              'Whole-number percentage loss for this position (e.g. -35 = 35% drop). Already multiplied by 100; display as-is.',
            type: 'number'
          },
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
          lossPct: {
            description:
              'Whole-number percentage loss for this position (e.g. -35 = 35% drop). Already multiplied by 100; display as-is.',
            type: 'number'
          },
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
    recoveryNeededPct: {
      description:
        'Whole-number percentage gain needed to recover from the stressed value back to current (e.g. 54 = need a 54% gain). Already multiplied by 100; display as-is.',
      type: 'number'
    },
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
              shockPercent: {
                description:
                  'Whole-number shock applied to this asset class (e.g. -35 = 35% drop). Already multiplied by 100; display as-is.',
                type: 'number'
              }
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
