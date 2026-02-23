export type ToolExecutionStatus = 'error' | 'partial' | 'success';

export type ToolSchemaType =
  | 'array'
  | 'boolean'
  | 'number'
  | 'object'
  | 'string';

export interface ToolJsonSchema {
  additionalProperties?: boolean;
  description?: string;
  enum?: readonly unknown[];
  items?: ToolJsonSchema;
  maximum?: number;
  minimum?: number;
  properties?: Record<string, ToolJsonSchema>;
  required?: readonly string[];
  type: ToolSchemaType;
}

export interface ToolValidationIssue {
  code:
    | 'invalid_enum'
    | 'invalid_type'
    | 'invalid_value'
    | 'missing_required'
    | 'unknown_property';
  expected?: string;
  message: string;
  path: string;
  received?: string;
}

export interface ToolValidationResult {
  errors: ToolValidationIssue[];
  isValid: boolean;
}

export interface ToolExecutionContext {
  requestId?: string;
  userId: string;
}

export interface ToolError {
  code: string;
  details?: Record<string, unknown>;
  issues?: ToolValidationIssue[];
  message: string;
}

export interface ToolResultEnvelope<TData = Record<string, unknown>> {
  data?: TData;
  error?: ToolError;
  meta?: {
    durationMs: number;
    toolName: string;
  };
  status: ToolExecutionStatus;
}

export interface ToolDescriptor {
  description: string;
  inputSchema: ToolJsonSchema;
  name: string;
}

export interface ToolDefinition<
  TInput = Record<string, unknown>,
  TOutput = Record<string, unknown>
> extends ToolDescriptor {
  execute(
    input: TInput,
    context: ToolExecutionContext
  ):
    | Promise<TOutput | ToolResultEnvelope<TOutput> | string>
    | TOutput
    | ToolResultEnvelope<TOutput>
    | string;
  outputSchema?: ToolJsonSchema;
}

export interface ToolExecutionRequest {
  context: ToolExecutionContext;
  input: Record<string, unknown>;
  name: string;
}

export const AI_TOOL_DEFINITIONS_TOKEN = 'AI_TOOL_DEFINITIONS_TOKEN';
