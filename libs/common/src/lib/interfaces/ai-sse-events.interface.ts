import type { AiChatResponse } from './ai-chat-response.interface';

// ─── Public SSE event types (sent to client) ────────────────────────────────

export interface SseThinkingEvent {
  type: 'thinking';
  iteration: number;
  maxIterations: number;
}

export interface SseToolCallEvent {
  type: 'tool_call';
  toolName: string;
  iteration: number;
}

export interface SseToolResultEvent {
  type: 'tool_result';
  toolName: string;
  status: 'error' | 'partial' | 'success';
  summary: string;
}

export interface SseResponseChunkEvent {
  type: 'response_chunk';
  text: string;
}

export interface SseDoneEvent {
  type: 'done';
  payload: AiChatResponse;
}

export interface SseErrorEvent {
  type: 'error';
  message: string;
  code?: string;
}

export interface SseHeartbeatEvent {
  type: 'heartbeat';
}

export type SseEventType =
  | 'done'
  | 'error'
  | 'heartbeat'
  | 'response_chunk'
  | 'thinking'
  | 'tool_call'
  | 'tool_result';

export type SseEvent =
  | SseDoneEvent
  | SseErrorEvent
  | SseHeartbeatEvent
  | SseResponseChunkEvent
  | SseThinkingEvent
  | SseToolCallEvent
  | SseToolResultEvent;
