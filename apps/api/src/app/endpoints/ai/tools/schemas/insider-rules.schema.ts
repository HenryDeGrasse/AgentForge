import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const CREATE_INSIDER_RULE_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    lookbackDays: {
      description: 'Number of days to look back (default: 30)',
      maximum: 90,
      minimum: 1,
      type: 'number'
    },
    minValueUsd: {
      description: 'Minimum transaction value in USD to trigger alert',
      minimum: 0,
      type: 'number'
    },
    scope: {
      description:
        'Scope of the monitoring rule: all_holdings, symbols, or top_n',
      enum: ['all_holdings', 'symbols', 'top_n'],
      type: 'string'
    },
    side: {
      description: 'Which transaction side to monitor',
      enum: ['buy', 'sell', 'any'],
      type: 'string'
    },
    symbols: {
      description: 'Specific symbols to monitor (required when scope = symbols)',
      items: { type: 'string' },
      type: 'array'
    },
    topN: {
      description:
        'Number of top holdings to monitor (used when scope = top_n)',
      maximum: 50,
      minimum: 1,
      type: 'number'
    }
  },
  required: ['scope', 'side'],
  type: 'object'
};

export const CREATE_INSIDER_RULE_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    message: { type: 'string' },
    rule: {
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        isActive: { type: 'boolean' },
        lookbackDays: { type: 'number' },
        minValueUsd: { type: 'number' },
        scope: { type: 'string' },
        side: { type: 'string' },
        symbols: { type: 'array', items: { type: 'string' } },
        topN: { type: 'number' }
      },
      required: ['id', 'scope', 'side', 'isActive'],
      type: 'object'
    }
  },
  required: ['rule', 'message'],
  type: 'object'
};

export const LIST_INSIDER_RULES_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {},
  type: 'object'
};

export const LIST_INSIDER_RULES_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    rules: {
      items: {
        additionalProperties: false,
        properties: {
          agentNotes: { type: 'string' },
          id: { type: 'string' },
          isActive: { type: 'boolean' },
          lastCheckedAt: { type: 'string' },
          lastNotifiedAt: { type: 'string' },
          lookbackDays: { type: 'number' },
          minValueUsd: { type: 'number' },
          scope: { type: 'string' },
          side: { type: 'string' },
          symbols: { type: 'array', items: { type: 'string' } },
          topN: { type: 'number' }
        },
        required: ['id', 'scope', 'side', 'isActive'],
        type: 'object'
      },
      type: 'array'
    },
    total: { type: 'number' }
  },
  required: ['rules', 'total'],
  type: 'object'
};

export const UPDATE_INSIDER_RULE_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    id: { description: 'Rule ID to update', type: 'string' },
    isActive: { type: 'boolean' },
    lookbackDays: { maximum: 90, minimum: 1, type: 'number' },
    minValueUsd: { minimum: 0, type: 'number' },
    scope: { enum: ['all_holdings', 'symbols', 'top_n'], type: 'string' },
    side: { enum: ['buy', 'sell', 'any'], type: 'string' },
    symbols: { items: { type: 'string' }, type: 'array' },
    topN: { maximum: 50, minimum: 1, type: 'number' }
  },
  required: ['id'],
  type: 'object'
};

export const UPDATE_INSIDER_RULE_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    message: { type: 'string' },
    updatedCount: { type: 'number' }
  },
  required: ['updatedCount', 'message'],
  type: 'object'
};

export const DELETE_INSIDER_RULE_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    id: { description: 'Rule ID to delete', type: 'string' }
  },
  required: ['id'],
  type: 'object'
};

export const DELETE_INSIDER_RULE_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    deletedCount: { type: 'number' },
    message: { type: 'string' }
  },
  required: ['deletedCount', 'message'],
  type: 'object'
};
