import {
  AI_TOOL_DEFINITIONS_TOKEN,
  ToolDefinition,
  ToolDescriptor,
  ToolExecutionRequest,
  ToolResultEnvelope
} from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import {
  validateToolInput,
  validateToolOutput
} from '@ghostfolio/api/app/endpoints/ai/tools/validators';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  public constructor(
    @Inject(AI_TOOL_DEFINITIONS_TOKEN)
    @Optional()
    tools?: ToolDefinition[]
  ) {
    for (const tool of tools ?? []) {
      this.register(tool);
    }
  }

  public execute({
    context,
    input,
    name
  }: ToolExecutionRequest): Promise<ToolResultEnvelope> {
    const tool = this.tools.get(name);

    if (!tool) {
      return Promise.resolve(
        this.getErrorResult({
          code: 'tool_not_found',
          message: `Tool "${name}" is not registered.`,
          toolName: name
        })
      );
    }

    const validation = validateToolInput({
      input,
      schema: tool.inputSchema
    });

    if (!validation.isValid) {
      return Promise.resolve(
        this.getErrorResult({
          code: 'tool_validation_error',
          details: {
            input
          },
          issues: validation.errors,
          message: `Tool "${name}" received invalid input.`,
          toolName: name
        })
      );
    }

    return this.executeTool({
      context,
      input,
      tool
    });
  }

  public list(toolNames?: string[]): ToolDescriptor[] {
    const activeToolNames = toolNames?.length
      ? toolNames.filter((currentToolName) => {
          return this.tools.has(currentToolName);
        })
      : [...this.tools.keys()];

    return activeToolNames.map((name) => {
      const tool = this.tools.get(name);

      return {
        description: tool.description,
        inputSchema: tool.inputSchema,
        name: tool.name
      };
    });
  }

  public register(tool: ToolDefinition) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }

    this.tools.set(tool.name, tool);
  }

  private async executeTool({
    context,
    input,
    tool
  }: {
    context: ToolExecutionRequest['context'];
    input: ToolExecutionRequest['input'];
    tool: ToolDefinition;
  }): Promise<ToolResultEnvelope> {
    const startedAt = Date.now();

    try {
      const response = await Promise.resolve(tool.execute(input, context));
      const normalizedResult = this.normalizeResponse({
        response,
        toolName: tool.name
      });

      if (normalizedResult.status === 'error') {
        return {
          ...normalizedResult,
          meta: {
            durationMs: Date.now() - startedAt,
            toolName: tool.name
          }
        };
      }

      const outputValidation = validateToolOutput({
        output: normalizedResult.data ?? {},
        schema: tool.outputSchema
      });

      if (!outputValidation.isValid) {
        return this.getErrorResult({
          code: 'tool_output_validation_error',
          details: {
            output: normalizedResult.data ?? {}
          },
          durationMs: Date.now() - startedAt,
          issues: outputValidation.errors,
          message: `Tool "${tool.name}" produced invalid output.`,
          toolName: tool.name
        });
      }

      return {
        ...normalizedResult,
        meta: {
          durationMs: Date.now() - startedAt,
          toolName: tool.name
        }
      };
    } catch (error) {
      Logger.error(
        `Tool "${tool.name}" threw an exception: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
        'ToolRegistry'
      );

      return this.getErrorResult({
        code: 'tool_execution_failed',
        durationMs: Date.now() - startedAt,
        message:
          error instanceof Error
            ? error.message
            : 'Unknown tool execution failure.',
        toolName: tool.name
      });
    }
  }

  private getErrorResult({
    code,
    details,
    durationMs = 0,
    issues,
    message,
    toolName
  }: {
    code: string;
    details?: Record<string, unknown>;
    durationMs?: number;
    issues?: ToolResultEnvelope['error']['issues'];
    message: string;
    toolName: string;
  }): ToolResultEnvelope {
    return {
      error: {
        code,
        ...(details ? { details } : {}),
        ...(issues?.length ? { issues } : {}),
        message
      },
      meta: {
        durationMs,
        toolName
      },
      status: 'error'
    };
  }

  private normalizeResponse({
    response,
    toolName
  }: {
    response: Awaited<ReturnType<ToolDefinition['execute']>>;
    toolName: string;
  }): ToolResultEnvelope {
    if (typeof response === 'string') {
      return {
        data: {
          message: response
        },
        status: 'success'
      };
    }

    if (
      typeof response === 'object' &&
      response !== null &&
      'status' in response
    ) {
      const envelope = response as ToolResultEnvelope;

      if (
        envelope.status === 'error' ||
        envelope.status === 'partial' ||
        envelope.status === 'success'
      ) {
        return {
          ...envelope,
          ...(envelope.status !== 'error' && envelope.data === undefined
            ? { data: {} }
            : {}),
          ...(envelope.status === 'error' && !envelope.error
            ? {
                error: {
                  code: 'tool_execution_failed',
                  message: `Tool "${toolName}" returned an error without details.`
                }
              }
            : {})
        };
      }
    }

    if (typeof response !== 'object' || response === null) {
      return {
        data: {},
        status: 'success'
      };
    }

    return {
      data: response as Record<string, unknown>,
      status: 'success'
    };
  }
}
