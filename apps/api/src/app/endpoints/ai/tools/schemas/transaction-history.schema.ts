import type { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

export const TRANSACTION_HISTORY_INPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    accountIds: {
      description: 'Filter to specific account IDs. Omit for all accounts.',
      items: { type: 'string' },
      type: 'array'
    },
    cursor: {
      description:
        'Pagination cursor (0-based offset). Use nextCursor from previous response.',
      minimum: 0,
      type: 'number'
    },
    endDate: {
      description: 'End date filter (ISO 8601, e.g. "2025-12-31").',
      type: 'string'
    },
    pageSize: {
      description: 'Results per page (1–100). Default 50.',
      maximum: 100,
      minimum: 1,
      type: 'number'
    },
    sortDirection: {
      description: 'Sort order by date.',
      enum: ['asc', 'desc'],
      type: 'string'
    },
    startDate: {
      description: 'Start date filter (ISO 8601, e.g. "2025-01-01").',
      type: 'string'
    },
    types: {
      description: 'Filter by transaction types.',
      items: {
        enum: ['BUY', 'DIVIDEND', 'FEE', 'INTEREST', 'LIABILITY', 'SELL'],
        type: 'string'
      },
      type: 'array'
    }
  },
  type: 'object'
};

export const TRANSACTION_HISTORY_OUTPUT_SCHEMA: ToolJsonSchema = {
  additionalProperties: false,
  properties: {
    page: {
      additionalProperties: false,
      properties: {
        cursor: { type: 'number' },
        hasMore: { type: 'boolean' },
        nextCursor: { type: 'number' },
        pageSize: { type: 'number' },
        returnedCount: { type: 'number' },
        totalCount: { type: 'number' }
      },
      required: [
        'cursor',
        'hasMore',
        'pageSize',
        'returnedCount',
        'totalCount'
      ],
      type: 'object'
    },
    summary: {
      additionalProperties: false,
      properties: {
        buyValueInBaseCurrency: { type: 'number' },
        byType: { type: 'object' },
        pageFeesInBaseCurrency: { type: 'number' },
        pageValueInBaseCurrency: { type: 'number' },
        sellValueInBaseCurrency: { type: 'number' }
      },
      required: [
        'buyValueInBaseCurrency',
        'byType',
        'pageFeesInBaseCurrency',
        'pageValueInBaseCurrency',
        'sellValueInBaseCurrency'
      ],
      type: 'object'
    },
    transactions: {
      items: {
        additionalProperties: false,
        properties: {
          accountId: { type: 'string' },
          accountName: { type: 'string' },
          currency: { type: 'string' },
          dataSource: { type: 'string' },
          date: { type: 'string' },
          fee: { type: 'number' },
          feeInBaseCurrency: { type: 'number' },
          id: { type: 'string' },
          quantity: { type: 'number' },
          symbol: { type: 'string' },
          type: { type: 'string' },
          unitPrice: { type: 'number' },
          value: { type: 'number' },
          valueInBaseCurrency: { type: 'number' }
        },
        required: [
          'accountId',
          'accountName',
          'currency',
          'dataSource',
          'date',
          'fee',
          'feeInBaseCurrency',
          'id',
          'quantity',
          'symbol',
          'type',
          'unitPrice',
          'value',
          'valueInBaseCurrency'
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
  required: ['page', 'summary', 'transactions', 'warnings'],
  type: 'object'
};
