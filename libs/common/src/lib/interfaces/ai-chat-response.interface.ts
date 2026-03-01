export type ActionType = 'button' | 'chip';
export type AiChatConfidence = 'high' | 'low' | 'medium';
export type AiChatStatus = 'completed' | 'failed' | 'partial';
export type ChartType = 'doughnut' | 'horizontalBar' | 'line' | 'table';

export interface ActionItem {
  actionType: ActionType;
  icon?: string;
  key: string;
  label: string;
  prompt: string;
}

export interface ChartDataItem {
  chartType: ChartType;
  data: Record<string, unknown>;
  label: string;
  toolName: string;
}

/** Shape returned by POST /api/v1/ai/chat (mirrors VerifiedResponse). */
export interface AiChatResponse {
  actions?: ActionItem[];
  chartData: ChartDataItem[];
  confidence: AiChatConfidence;
  conversationId: string;
  elapsedMs: number;
  estimatedCostUsd: number;
  guardrail?: string;
  invokedToolNames?: string[];
  iterations: number;
  /**
   * True when agent confidence is low, a guardrail fired, or the verifier
   * detected unbacked claims. UI can show a "⚠️ Review recommended" badge.
   */
  requiresHumanReview?: boolean;
  response: string;
  sources: string[];
  status: AiChatStatus;
  toolCalls: number;
  /**
   * Langfuse trace ID. Pass back to POST /api/v1/ai/feedback to attach
   * thumbs-up/down scores to this specific response.
   */
  traceId?: string;
  warnings: string[];
}

/** A single message in the AI chat conversation history. */
export interface ChatMessage {
  actions?: ActionItem[];
  chartData?: ChartDataItem[];
  confidence?: AiChatConfidence;
  role: 'assistant' | 'user';
  sources?: string[];
  text: string;
  warnings?: string[];
}

/** Summary for conversation list / sidebar. */
export interface ConversationSummary {
  createdAt: string;
  id: string;
  messageCount: number;
  title: string;
  updatedAt: string;
}

/** Full conversation with messages. */
export interface ConversationDetail {
  createdAt: string;
  id: string;
  messages: {
    chartData?: ChartDataItem[];
    content: string;
    createdAt: string;
    id: string;
    requestedToolNames: string[];
    role: 'assistant' | 'user';
  }[];
  title: string;
  updatedAt: string;
}
