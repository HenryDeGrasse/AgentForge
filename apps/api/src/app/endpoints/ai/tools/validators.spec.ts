import {
  validateToolInput,
  validateToolOutput
} from '@ghostfolio/api/app/endpoints/ai/tools/validators';

describe('Tool validators', () => {
  const schema = {
    additionalProperties: false,
    properties: {
      includeDividends: {
        type: 'boolean'
      },
      lookback: {
        enum: ['1m', '6m', '1y'],
        type: 'string'
      },
      limit: {
        maximum: 100,
        minimum: 1,
        type: 'number'
      },
      symbols: {
        items: {
          type: 'string'
        },
        type: 'array'
      }
    },
    required: ['lookback', 'limit'],
    type: 'object'
  } as const;

  it('accepts valid inputs', () => {
    const validation = validateToolInput({
      input: {
        includeDividends: true,
        limit: 10,
        lookback: '1y',
        symbols: ['AAPL', 'MSFT']
      },
      schema
    });

    expect(validation).toEqual({
      errors: [],
      isValid: true
    });
  });

  it('rejects missing required fields, invalid enums, unknown properties and type mismatches', () => {
    const validation = validateToolInput({
      input: {
        extraField: 'not allowed',
        limit: '10',
        lookback: '2y',
        symbols: ['AAPL', 123]
      },
      schema
    });

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_enum',
          path: '$.lookback'
        }),
        expect.objectContaining({
          code: 'invalid_type',
          path: '$.limit'
        }),
        expect.objectContaining({
          code: 'invalid_type',
          path: '$.symbols[1]'
        }),
        expect.objectContaining({
          code: 'unknown_property',
          path: '$.extraField'
        })
      ])
    );
  });

  it('rejects number values outside minimum and maximum constraints', () => {
    const validation = validateToolInput({
      input: {
        limit: 101,
        lookback: '1m'
      },
      schema
    });

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_value',
          path: '$.limit'
        })
      ])
    );
  });

  it('skips output validation when no output schema is provided', () => {
    const validation = validateToolOutput({
      output: {
        anyShape: 'is accepted'
      }
    });

    expect(validation).toEqual({
      errors: [],
      isValid: true
    });
  });
});
