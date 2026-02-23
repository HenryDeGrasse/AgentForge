export type AiChatConfidence = 'high' | 'low' | 'medium';
export type AiChatStatus = 'completed' | 'failed' | 'partial';

/** Shape returned by POST /api/v1/ai/chat (mirrors VerifiedResponse). */
export interface AiChatResponse {
  confidence: AiChatConfidence;
  elapsedMs: number;
  estimatedCostUsd: number;
  guardrail?: string;
  iterations: number;
  response: string;
  sources: string[];
  status: AiChatStatus;
  toolCalls: number;
  warnings: string[];
}
