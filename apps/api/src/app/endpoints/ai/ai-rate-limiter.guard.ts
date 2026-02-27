import type { RequestWithUser } from '@ghostfolio/common/types';

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable
} from '@nestjs/common';

/**
 * Simple in-memory sliding-window rate limiter for the AI chat endpoints.
 *
 * Allows up to MAX_REQUESTS requests per user within a rolling WINDOW_MS
 * window. Excess requests receive HTTP 429 Too Many Requests.
 *
 * This guard is intentionally simple and does NOT persist across server
 * restarts or scale across multiple instances. For multi-instance deployments
 * a Redis-backed throttler (e.g. @nestjs/throttler with Redis store) should
 * replace this implementation.
 */
@Injectable()
export class AiRateLimiterGuard implements CanActivate {
  /** Rolling window length in milliseconds (1 minute). */
  private static readonly WINDOW_MS = 60_000;

  /** Maximum requests per user per window. */
  private static readonly MAX_REQUESTS = 20;

  /**
   * Per-user request timestamps (Unix ms).  Entries outside the current
   * window are evicted lazily on each check to bound memory growth.
   */
  private readonly requestLog = new Map<string, number[]>();

  public canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Partial<RequestWithUser>>();

    const userId = request?.user?.id;

    // Unauthenticated requests are not rate-limited here — the AuthGuard
    // will reject them before any AI work is performed.
    if (!userId) {
      return true;
    }

    const now = Date.now();
    const windowStart = now - AiRateLimiterGuard.WINDOW_MS;

    // Evict stale timestamps and check the current window count.
    const recentTimestamps = (this.requestLog.get(userId) ?? []).filter(
      (ts) => ts > windowStart
    );

    if (recentTimestamps.length >= AiRateLimiterGuard.MAX_REQUESTS) {
      throw new HttpException(
        {
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Maximum ${AiRateLimiterGuard.MAX_REQUESTS} requests per minute.`,
          statusCode: HttpStatus.TOO_MANY_REQUESTS
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    recentTimestamps.push(now);
    this.requestLog.set(userId, recentTimestamps);

    return true;
  }
}
