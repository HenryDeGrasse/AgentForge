/**
 * POST /api/v1/ai/feedback
 *
 * Attaches a thumbs-up (+1) or thumbs-down (-1) score to a Langfuse trace.
 * The traceId is returned with every chat response as `VerifiedResponse.traceId`.
 */
export class ChatFeedbackDto {
  /** Optional free-text correction or explanation */
  comment?: string;
  /** Trace ID returned with the original chat response */
  traceId: string;
  /** 1 = helpful (thumbs up), -1 = not helpful (thumbs down) */
  value: 1 | -1;
}
