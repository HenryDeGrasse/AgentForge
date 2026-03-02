import {
  ANALYZE_RISK_INPUT_SCHEMA,
  COMPLIANCE_CHECK_INPUT_SCHEMA,
  MARKET_DATA_LOOKUP_INPUT_SCHEMA,
  PERFORMANCE_COMPARE_INPUT_SCHEMA,
  PORTFOLIO_SUMMARY_INPUT_SCHEMA,
  REBALANCE_SUGGEST_INPUT_SCHEMA,
  SIMULATE_TRADES_INPUT_SCHEMA,
  STRESS_TEST_INPUT_SCHEMA,
  TAX_ESTIMATE_INPUT_SCHEMA,
  TRANSACTION_HISTORY_INPUT_SCHEMA
} from '@ghostfolio/api/app/endpoints/ai/tools/schemas';
import { ToolRegistry } from '@ghostfolio/api/app/endpoints/ai/tools/tool.registry';
import { ToolJsonSchema } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

const ALL_INPUT_SCHEMAS: [string, ToolJsonSchema][] = [
  ['analyze_risk', ANALYZE_RISK_INPUT_SCHEMA],
  ['compliance_check', COMPLIANCE_CHECK_INPUT_SCHEMA],
  ['market_data_lookup', MARKET_DATA_LOOKUP_INPUT_SCHEMA],
  ['performance_compare', PERFORMANCE_COMPARE_INPUT_SCHEMA],
  ['get_portfolio_summary', PORTFOLIO_SUMMARY_INPUT_SCHEMA],
  ['rebalance_suggest', REBALANCE_SUGGEST_INPUT_SCHEMA],
  ['simulate_trades', SIMULATE_TRADES_INPUT_SCHEMA],
  ['stress_test', STRESS_TEST_INPUT_SCHEMA],
  ['tax_estimate', TAX_ESTIMATE_INPUT_SCHEMA],
  ['get_transaction_history', TRANSACTION_HISTORY_INPUT_SCHEMA]
];

describe('Tool input schema descriptions', () => {
  it.each(ALL_INPUT_SCHEMAS)(
    '%s — every top-level property has a description',
    (_toolName, schema) => {
      const properties = schema.properties ?? {};

      for (const [, def] of Object.entries(properties)) {
        expect((def as any).description).toBeTruthy();
      }
    }
  );
});

describe('ToolRegistry', () => {
  it('lists registered tools as descriptors and supports tool name filtering', () => {
    const toolRegistry = new ToolRegistry();

    toolRegistry.register({
      description: 'Get summary',
      execute: jest.fn(),
      inputSchema: {
        type: 'object'
      },
      name: 'get_summary'
    });

    toolRegistry.register({
      description: 'Get transactions',
      execute: jest.fn(),
      inputSchema: {
        type: 'object'
      },
      name: 'get_transactions'
    });

    expect(toolRegistry.list()).toHaveLength(2);

    expect(toolRegistry.list(['get_transactions'])).toEqual([
      {
        description: 'Get transactions',
        inputSchema: {
          type: 'object'
        },
        name: 'get_transactions'
      }
    ]);
  });

  it('rejects duplicate registrations', () => {
    const toolRegistry = new ToolRegistry();

    toolRegistry.register({
      description: 'Get summary',
      execute: jest.fn(),
      inputSchema: {
        type: 'object'
      },
      name: 'get_summary'
    });

    expect(() => {
      toolRegistry.register({
        description: 'Duplicate summary',
        execute: jest.fn(),
        inputSchema: {
          type: 'object'
        },
        name: 'get_summary'
      });
    }).toThrow('Tool "get_summary" is already registered.');
  });

  it('returns tool_not_found for unknown tools', async () => {
    const toolRegistry = new ToolRegistry();

    const result = await toolRegistry.execute({
      context: {
        userId: 'user-1'
      },
      input: {},
      name: 'missing_tool'
    });

    expect(result).toMatchObject({
      error: {
        code: 'tool_not_found'
      },
      status: 'error'
    });
  });

  it('returns tool_validation_error for invalid input payloads', async () => {
    const toolRegistry = new ToolRegistry();

    toolRegistry.register({
      description: 'Get summary',
      execute: jest.fn(),
      inputSchema: {
        additionalProperties: false,
        properties: {
          lookback: {
            enum: ['1m', '1y'],
            type: 'string'
          }
        },
        required: ['lookback'],
        type: 'object'
      },
      name: 'get_summary'
    });

    const result = await toolRegistry.execute({
      context: {
        userId: 'user-1'
      },
      input: {
        lookback: '5y',
        unknown: true
      },
      name: 'get_summary'
    });

    expect(result).toMatchObject({
      error: {
        code: 'tool_validation_error',
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'invalid_enum' }),
          expect.objectContaining({ code: 'unknown_property' })
        ])
      },
      status: 'error'
    });
  });

  it('returns tool_execution_failed when a tool throws', async () => {
    const toolRegistry = new ToolRegistry();

    toolRegistry.register({
      description: 'Fails',
      execute: jest.fn().mockRejectedValue(new Error('boom')),
      inputSchema: {
        type: 'object'
      },
      name: 'always_fail'
    });

    const result = await toolRegistry.execute({
      context: {
        userId: 'user-1'
      },
      input: {},
      name: 'always_fail'
    });

    expect(result).toMatchObject({
      error: {
        code: 'tool_execution_failed',
        message: 'boom'
      },
      status: 'error'
    });
  });

  it('normalizes successful execution and validates output schema', async () => {
    const toolRegistry = new ToolRegistry();

    toolRegistry.register({
      description: 'Get summary',
      execute: jest.fn().mockResolvedValue({
        totalValue: 123
      }),
      inputSchema: {
        type: 'object'
      },
      name: 'get_summary',
      outputSchema: {
        additionalProperties: false,
        properties: {
          totalValue: {
            type: 'number'
          }
        },
        required: ['totalValue'],
        type: 'object'
      }
    });

    const result = await toolRegistry.execute({
      context: {
        userId: 'user-1'
      },
      input: {},
      name: 'get_summary'
    });

    expect(result).toMatchObject({
      data: {
        totalValue: 123
      },
      status: 'success'
    });

    expect(result.meta).toEqual(
      expect.objectContaining({
        durationMs: expect.any(Number),
        toolName: 'get_summary'
      })
    );
  });

  it('returns tool_output_validation_error when output schema validation fails', async () => {
    const toolRegistry = new ToolRegistry();

    toolRegistry.register({
      description: 'Get summary',
      execute: jest.fn().mockResolvedValue({
        totalValue: 'wrong type'
      }),
      inputSchema: {
        type: 'object'
      },
      name: 'get_summary',
      outputSchema: {
        additionalProperties: false,
        properties: {
          totalValue: {
            type: 'number'
          }
        },
        required: ['totalValue'],
        type: 'object'
      }
    });

    const result = await toolRegistry.execute({
      context: {
        userId: 'user-1'
      },
      input: {},
      name: 'get_summary'
    });

    expect(result).toMatchObject({
      error: {
        code: 'tool_output_validation_error'
      },
      status: 'error'
    });
  });

  it('passes through partial envelopes returned by tools', async () => {
    const toolRegistry = new ToolRegistry();

    toolRegistry.register({
      description: 'Partial tool',
      execute: jest.fn().mockResolvedValue({
        data: {
          warnings: ['stale data']
        },
        status: 'partial'
      }),
      inputSchema: {
        type: 'object'
      },
      name: 'partial_tool'
    });

    const result = await toolRegistry.execute({
      context: {
        userId: 'user-1'
      },
      input: {},
      name: 'partial_tool'
    });

    expect(result).toMatchObject({
      data: {
        warnings: ['stale data']
      },
      status: 'partial'
    });
  });
});
