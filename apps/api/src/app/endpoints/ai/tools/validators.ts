import {
  ToolJsonSchema,
  ToolValidationIssue,
  ToolValidationResult
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';

function getValueType(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }

  if (value === null) {
    return 'null';
  }

  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pushError(
  errors: ToolValidationIssue[],
  issue: ToolValidationIssue
): ToolValidationIssue[] {
  errors.push(issue);

  return errors;
}

function validateAgainstSchema({
  errors,
  path,
  schema,
  value
}: {
  errors: ToolValidationIssue[];
  path: string;
  schema: ToolJsonSchema;
  value: unknown;
}): ToolValidationIssue[] {
  const valueType = getValueType(value);

  if (schema.type === 'object') {
    if (!isPlainObject(value)) {
      return pushError(errors, {
        code: 'invalid_type',
        expected: 'object',
        message: `${path} must be an object`,
        path,
        received: valueType
      });
    }

    const properties = schema.properties ?? {};

    for (const requiredKey of schema.required ?? []) {
      if (!(requiredKey in value)) {
        pushError(errors, {
          code: 'missing_required',
          expected: requiredKey,
          message: `${path}.${requiredKey} is required`,
          path: `${path}.${requiredKey}`,
          received: 'undefined'
        });
      }
    }

    for (const [currentKey, currentValue] of Object.entries(value)) {
      const childSchema = properties[currentKey];
      const childPath = `${path}.${currentKey}`;

      if (!childSchema) {
        if (schema.additionalProperties === false) {
          pushError(errors, {
            code: 'unknown_property',
            message: `${childPath} is not allowed`,
            path: childPath,
            received: getValueType(currentValue)
          });
        }

        continue;
      }

      validateAgainstSchema({
        errors,
        path: childPath,
        schema: childSchema,
        value: currentValue
      });
    }

    return errors;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      return pushError(errors, {
        code: 'invalid_type',
        expected: 'array',
        message: `${path} must be an array`,
        path,
        received: valueType
      });
    }

    if (!schema.items) {
      return errors;
    }

    value.forEach((currentItem, index) => {
      validateAgainstSchema({
        errors,
        path: `${path}[${index}]`,
        schema: schema.items,
        value: currentItem
      });
    });

    return errors;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      return pushError(errors, {
        code: 'invalid_type',
        expected: 'string',
        message: `${path} must be a string`,
        path,
        received: valueType
      });
    }

    if (schema.enum && !schema.enum.includes(value)) {
      pushError(errors, {
        code: 'invalid_enum',
        expected: JSON.stringify(schema.enum),
        message: `${path} must be one of ${schema.enum.join(', ')}`,
        path,
        received: value
      });
    }

    return errors;
  }

  if (schema.type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return pushError(errors, {
        code: 'invalid_type',
        expected: 'number',
        message: `${path} must be a number`,
        path,
        received: valueType
      });
    }

    if (schema.minimum !== undefined && value < schema.minimum) {
      pushError(errors, {
        code: 'invalid_value',
        expected: `>= ${schema.minimum}`,
        message: `${path} must be greater than or equal to ${schema.minimum}`,
        path,
        received: String(value)
      });
    }

    if (schema.maximum !== undefined && value > schema.maximum) {
      pushError(errors, {
        code: 'invalid_value',
        expected: `<= ${schema.maximum}`,
        message: `${path} must be lower than or equal to ${schema.maximum}`,
        path,
        received: String(value)
      });
    }

    return errors;
  }

  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return pushError(errors, {
        code: 'invalid_type',
        expected: 'boolean',
        message: `${path} must be a boolean`,
        path,
        received: valueType
      });
    }

    return errors;
  }

  return errors;
}

export function validateToolPayload({
  payload,
  schema
}: {
  payload: unknown;
  schema: ToolJsonSchema;
}): ToolValidationResult {
  const errors = validateAgainstSchema({
    errors: [],
    path: '$',
    schema,
    value: payload
  });

  return {
    errors,
    isValid: errors.length === 0
  };
}

export function validateToolInput({
  input,
  schema
}: {
  input: unknown;
  schema: ToolJsonSchema;
}): ToolValidationResult {
  return validateToolPayload({ payload: input, schema });
}

export function validateToolOutput({
  output,
  schema
}: {
  output: unknown;
  schema?: ToolJsonSchema;
}): ToolValidationResult {
  if (!schema) {
    return {
      errors: [],
      isValid: true
    };
  }

  return validateToolPayload({ payload: output, schema });
}
