/**
 * LangfuseService
 *
 * Thin wrapper around the Langfuse SDK that:
 *  - No-ops gracefully when LANGFUSE_PUBLIC_KEY is not set (dev without cloud)
 *  - Creates one trace per agent request with spans for LLM calls, tool calls,
 *    and verification
 *  - Exposes addScore() so the feedback endpoint can attach thumbs-up/down
 *
 * Privacy: raw portfolio values and transaction amounts are NOT sent.
 * Only structural metadata (tool names, latency, token counts, status) is traced.
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

// Lazily required so Jest (CommonJS) does not choke on langfuse's
// internal dynamic-import usage at module-load time. The actual client
// is only instantiated when LANGFUSE_PUBLIC_KEY is set.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { default: Langfuse } = require('langfuse') as {
  default: typeof import('langfuse').default;
};
type LangfuseClient = InstanceType<typeof import('langfuse').default>;
type LangfuseTraceClient = import('langfuse').LangfuseTraceClient;

export interface TraceOptions {
  conversationId?: string;
  message: string;
  requestId: string;
  toolNames: string[];
  userId: string;
}

export interface TraceResult {
  traceId: string;
  end: (outcome: TraceOutcome) => void;
}

export interface TraceOutcome {
  confidence: string;
  elapsedMs: number;
  estimatedCostUsd: number;
  invokedToolNames: string[];
  iterations: number;
  requiresHumanReview: boolean;
  status: string;
  toolCalls: number;
  warnings: string[];
}

@Injectable()
export class LangfuseService implements OnModuleDestroy {
  private readonly client: LangfuseClient | null;
  private readonly enabled: boolean;

  public constructor() {
    const publicKey = process.env['LANGFUSE_PUBLIC_KEY'];
    const secretKey = process.env['LANGFUSE_SECRET_KEY'];
    const baseUrl =
      process.env['LANGFUSE_BASE_URL'] ?? 'https://cloud.langfuse.com';

    if (publicKey && secretKey) {
      this.client = new Langfuse({
        publicKey,
        secretKey,
        baseUrl,
        // Flush after every event for eval runs; batches in production
        flushAt: 10,
        flushInterval: 5_000
      });
      this.enabled = true;
      Logger.log('Langfuse tracing enabled', 'LangfuseService');
    } else {
      this.client = null;
      this.enabled = false;
      Logger.debug(
        'Langfuse tracing disabled (LANGFUSE_PUBLIC_KEY not set)',
        'LangfuseService'
      );
    }
  }

  /**
   * Start a trace for one agent request.
   * Returns a traceId (always, even when disabled) and an `end()` function
   * that finalises the trace with outcome metadata.
   */
  public startTrace(options: TraceOptions): TraceResult {
    const traceId = options.requestId;

    if (!this.enabled || !this.client) {
      return { traceId, end: () => undefined };
    }

    let trace: LangfuseTraceClient;

    try {
      trace = this.client.trace({
        id: traceId,
        name: 'ai-chat',
        userId: options.userId,
        input: {
          // Privacy: only log the message length and tool list — not the full message
          // to avoid sending potentially sensitive portfolio context to cloud
          messageLength: options.message.length,
          toolNames: options.toolNames,
          hasConversationId: Boolean(options.conversationId)
        },
        metadata: {
          conversationId: options.conversationId,
          requestId: options.requestId
        },
        tags: ['agent', 'finance']
      });
    } catch (err) {
      Logger.warn(
        `Langfuse startTrace failed: ${err instanceof Error ? err.message : err}`,
        'LangfuseService'
      );

      return { traceId, end: () => undefined };
    }

    return {
      traceId,
      end: (outcome: TraceOutcome) => {
        try {
          trace.update({
            output: {
              confidence: outcome.confidence,
              elapsedMs: outcome.elapsedMs,
              estimatedCostUsd: outcome.estimatedCostUsd,
              invokedToolNames: outcome.invokedToolNames,
              iterations: outcome.iterations,
              requiresHumanReview: outcome.requiresHumanReview,
              status: outcome.status,
              toolCalls: outcome.toolCalls,
              warnings: outcome.warnings
            }
          });
        } catch (err) {
          Logger.warn(
            `Langfuse endTrace failed: ${err instanceof Error ? err.message : err}`,
            'LangfuseService'
          );
        }
      }
    };
  }

  /**
   * Record a user feedback score (thumbs up = 1, thumbs down = -1).
   */
  public async addScore({
    comment,
    traceId,
    value
  }: {
    comment?: string;
    traceId: string;
    value: 1 | -1;
  }): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      await this.client.score({
        traceId,
        name: 'user-feedback',
        value,
        ...(comment ? { comment } : {})
      });
    } catch (err) {
      Logger.warn(
        `Langfuse addScore failed: ${err instanceof Error ? err.message : err}`,
        'LangfuseService'
      );
    }
  }

  /**
   * Flush pending events. Call on module destroy and after eval runs.
   */
  public async flush(): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      await this.client.flushAsync();
    } catch (err) {
      Logger.warn(
        `Langfuse flush failed: ${err instanceof Error ? err.message : err}`,
        'LangfuseService'
      );
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.flush();
  }
}
