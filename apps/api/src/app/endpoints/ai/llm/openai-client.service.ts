import {
  LLMClient,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMFinishReason,
  LLMStreamChunk,
  LLMToolCall,
  LLMUsage
} from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';

import { Inject, Injectable, Optional } from '@nestjs/common';
import OpenAI from 'openai';

export const OPENAI_SDK_CLIENT_TOKEN = 'OPENAI_SDK_CLIENT_TOKEN';

@Injectable()
export class OpenAiClientService implements LLMClient {
  private readonly estimatedCostPer1kTokensUsd = Number(
    process.env.OPENAI_COST_PER_1K_TOKENS_USD ?? '0.002'
  );
  private readonly model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  private openAIClient: OpenAI;

  public constructor(
    @Inject(OPENAI_SDK_CLIENT_TOKEN)
    @Optional()
    private readonly injectedOpenAIClient?: OpenAI
  ) {}

  public async complete(
    request: LLMCompletionRequest
  ): Promise<LLMCompletionResponse> {
    const response = await this.getClient().chat.completions.create(
      this.buildRequestParams(request)
    );

    const firstChoice = response.choices?.[0];
    const content = this.getMessageContent(firstChoice?.message?.content);

    const usage = this.mapUsage(response.usage);

    return {
      finishReason: this.mapFinishReason(firstChoice?.finish_reason),
      ...(request.response
        ? {
            structuredResponse: this.parseJsonObject(content)
          }
        : {}),
      text: content,
      toolCalls: this.mapToolCalls(firstChoice?.message?.tool_calls),
      ...(usage ? { usage } : {})
    };
  }

  public async *completeStream(
    request: LLMCompletionRequest,
    signal?: AbortSignal
  ): AsyncIterable<LLMStreamChunk> {
    const stream = await this.getClient().chat.completions.create({
      ...this.buildRequestParams(request),
      stream: true as const,
      stream_options: { include_usage: true }
    });

    // Accumulate tool call deltas by index
    const toolCallAccumulator = new Map<
      number,
      { argumentsString: string; id: string; name: string }
    >();

    for await (const chunk of stream) {
      if (signal?.aborted) {
        break;
      }

      const delta = chunk.choices?.[0]?.delta;
      const finishReason = chunk.choices?.[0]?.finish_reason;

      // Accumulate tool call deltas
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallAccumulator.get(tc.index);

          if (existing) {
            existing.argumentsString += tc.function?.arguments ?? '';

            if (tc.function?.name) {
              existing.name = tc.function.name;
            }
          } else {
            toolCallAccumulator.set(tc.index, {
              argumentsString: tc.function?.arguments ?? '',
              id: tc.id ?? '',
              name: tc.function?.name ?? ''
            });
          }
        }
      }

      // Yield text deltas
      const textDelta = delta?.content ?? '';

      // On finish, yield final chunk with accumulated data
      if (finishReason) {
        const mappedFinishReason = this.mapFinishReason(finishReason);
        const usage = this.mapUsage(chunk.usage);
        const toolCalls =
          finishReason === 'tool_calls'
            ? this.finalizeToolCalls(toolCallAccumulator)
            : undefined;

        yield {
          delta: textDelta,
          finishReason: mappedFinishReason,
          ...(toolCalls ? { toolCalls } : {}),
          ...(usage ? { usage } : {})
        };
      } else if (textDelta) {
        yield { delta: textDelta };
      }
    }
  }

  private buildRequestParams(request: LLMCompletionRequest) {
    return {
      messages: request.messages.map(
        ({ content, name, role, toolCallId, toolCalls }) => {
          return {
            ...(name ? { name } : {}),
            ...(toolCallId ? { tool_call_id: toolCallId } : {}),
            ...(toolCalls?.length
              ? {
                  tool_calls: toolCalls.map((tc) => ({
                    id: tc.id,
                    type: 'function' as const,
                    function: {
                      name: tc.name,
                      arguments: JSON.stringify(tc.arguments)
                    }
                  }))
                }
              : {}),
            content,
            role
          };
        }
      ) as any,
      model: this.model,
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(request.tools?.length
        ? {
            ...(request.toolChoice ? { tool_choice: request.toolChoice } : {}),
            tools: request.tools.map(({ description, inputSchema, name }) => {
              return {
                function: {
                  description,
                  name,
                  parameters: inputSchema
                },
                type: 'function' as const
              };
            })
          }
        : {}),
      ...(request.response
        ? {
            response_format: {
              json_schema: {
                name: request.response.name,
                schema: request.response.schema,
                strict: true
              },
              type: 'json_schema' as const
            }
          }
        : {})
    };
  }

  private finalizeToolCalls(
    accumulator: Map<
      number,
      { argumentsString: string; id: string; name: string }
    >
  ): LLMToolCall[] {
    const toolCalls: LLMToolCall[] = [];

    for (const [, entry] of [...accumulator.entries()].sort(
      (a, b) => a[0] - b[0]
    )) {
      if (!entry.id || !entry.name) {
        continue;
      }

      toolCalls.push({
        arguments: this.parseJsonObject(entry.argumentsString),
        id: entry.id,
        name: entry.name
      });
    }

    return toolCalls;
  }

  private getClient() {
    if (this.injectedOpenAIClient) {
      return this.injectedOpenAIClient;
    }

    if (this.openAIClient) {
      return this.openAIClient;
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable.');
    }

    this.openAIClient = new OpenAI({ apiKey });

    return this.openAIClient;
  }

  private getMessageContent(content: unknown) {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part !== 'object' || part === null) {
            return '';
          }

          const contentPart = part as Record<string, unknown>;

          return typeof contentPart.text === 'string' ? contentPart.text : '';
        })
        .join('');
    }

    return '';
  }

  private mapFinishReason(finishReason: unknown): LLMFinishReason {
    if (
      finishReason === 'length' ||
      finishReason === 'stop' ||
      finishReason === 'tool_calls'
    ) {
      return finishReason;
    }

    return 'unknown';
  }

  private mapToolCalls(toolCalls: unknown): LLMToolCall[] {
    if (!Array.isArray(toolCalls)) {
      return [];
    }

    return toolCalls.reduce((response, currentToolCall) => {
      if (typeof currentToolCall !== 'object' || currentToolCall === null) {
        return response;
      }

      const openAiToolCall = currentToolCall as Record<string, unknown>;

      const id =
        typeof openAiToolCall.id === 'string' ? openAiToolCall.id : undefined;

      if (
        typeof openAiToolCall.function !== 'object' ||
        openAiToolCall.function === null
      ) {
        return response;
      }

      const currentFunction = openAiToolCall.function as Record<
        string,
        unknown
      >;

      const name =
        typeof currentFunction.name === 'string'
          ? currentFunction.name
          : undefined;

      const serializedArguments =
        typeof currentFunction.arguments === 'string'
          ? currentFunction.arguments
          : '{}';

      if (!id || !name) {
        return response;
      }

      response.push({
        arguments: this.parseJsonObject(serializedArguments),
        id,
        name
      });

      return response;
    }, [] as LLMToolCall[]);
  }

  private mapUsage(usage: unknown): LLMUsage | undefined {
    if (typeof usage !== 'object' || usage === null) {
      return undefined;
    }

    const openAiUsage = usage as Record<string, unknown>;

    const promptTokens =
      typeof openAiUsage.prompt_tokens === 'number'
        ? openAiUsage.prompt_tokens
        : undefined;

    const completionTokens =
      typeof openAiUsage.completion_tokens === 'number'
        ? openAiUsage.completion_tokens
        : undefined;

    const totalTokens =
      typeof openAiUsage.total_tokens === 'number'
        ? openAiUsage.total_tokens
        : promptTokens !== undefined && completionTokens !== undefined
          ? promptTokens + completionTokens
          : undefined;

    const estimatedCostUsd =
      totalTokens !== undefined
        ? Number(
            ((totalTokens / 1000) * this.estimatedCostPer1kTokensUsd).toFixed(6)
          )
        : undefined;

    if (
      completionTokens === undefined &&
      promptTokens === undefined &&
      totalTokens === undefined
    ) {
      return undefined;
    }

    return {
      completionTokens,
      estimatedCostUsd,
      promptTokens,
      totalTokens
    };
  }

  private parseJsonObject(value: string): Record<string, unknown> {
    try {
      const parsedValue = JSON.parse(value);

      if (
        typeof parsedValue === 'object' &&
        parsedValue !== null &&
        !Array.isArray(parsedValue)
      ) {
        return parsedValue as Record<string, unknown>;
      }
    } catch {}

    return {};
  }
}
