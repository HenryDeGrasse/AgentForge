import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * POST /api/v1/ai/feedback
 *
 * Attaches a thumbs-up (+1) or thumbs-down (-1) score to a Langfuse trace.
 * The traceId is returned with every chat response as `VerifiedResponse.traceId`.
 */
export class ChatFeedbackDto {
  /** Optional free-text correction or explanation */
  @IsOptional()
  @IsString()
  comment?: string;

  /** Trace ID returned with the original chat response */
  @IsString()
  traceId: string;

  /** 1 = helpful (thumbs up), -1 = not helpful (thumbs down) */
  @IsIn([1, -1])
  value: 1 | -1;
}
