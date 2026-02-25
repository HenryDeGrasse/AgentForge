export type LLMFinishReason = 'length' | 'stop' | 'tool_calls' | 'unknown';

export type LLMRole = 'assistant' | 'system' | 'tool' | 'user';

export interface LLMMessage {
  content: string;
  name?: string;
  role: LLMRole;
  toolCallId?: string;
  toolCalls?: LLMToolCall[];
}

export interface LLMToolDefinition {
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
}

export interface LLMStructuredResponseDefinition {
  name: string;
  schema: Record<string, unknown>;
}

export interface LLMCompletionRequest {
  messages: LLMMessage[];
  response?: LLMStructuredResponseDefinition;
  temperature?: number;
  toolChoice?: 'auto' | 'none' | 'required';
  tools?: LLMToolDefinition[];
}

export interface LLMToolCall {
  arguments: Record<string, unknown>;
  id: string;
  name: string;
}

export interface LLMUsage {
  completionTokens?: number;
  estimatedCostUsd?: number;
  promptTokens?: number;
  totalTokens?: number;
}

export interface LLMCompletionResponse {
  finishReason: LLMFinishReason;
  structuredResponse?: Record<string, unknown>;
  text: string;
  toolCalls: LLMToolCall[];
  usage?: LLMUsage;
}

export interface LLMClient {
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
}

export const LLM_CLIENT_TOKEN = 'LLM_CLIENT_TOKEN';
