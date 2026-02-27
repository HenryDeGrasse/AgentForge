import { ExecutionContext, HttpException } from '@nestjs/common';

import { AiRateLimiterGuard } from './ai-rate-limiter.guard';

function buildContext(userId: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: userId } })
    })
  } as unknown as ExecutionContext;
}

describe('AiRateLimiterGuard', () => {
  let guard: AiRateLimiterGuard;
  let nowSpy: jest.SpyInstance;
  let currentTime = 1_000_000;

  beforeEach(() => {
    guard = new AiRateLimiterGuard();
    currentTime = 1_000_000;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('allows a single request through', () => {
    expect(guard.canActivate(buildContext('user-1'))).toBe(true);
  });

  it('allows requests up to the per-minute limit', () => {
    for (let i = 0; i < 20; i++) {
      expect(guard.canActivate(buildContext('user-1'))).toBe(true);
    }
  });

  it('rejects the request after the per-minute limit is exceeded', () => {
    for (let i = 0; i < 20; i++) {
      guard.canActivate(buildContext('user-1'));
    }

    expect(() => guard.canActivate(buildContext('user-1'))).toThrow(
      HttpException
    );
  });

  it('returns HTTP 429 when rate limit is exceeded', () => {
    for (let i = 0; i < 20; i++) {
      guard.canActivate(buildContext('user-1'));
    }

    try {
      guard.canActivate(buildContext('user-1'));
      fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });

  it('tracks requests independently per user', () => {
    for (let i = 0; i < 20; i++) {
      guard.canActivate(buildContext('user-1'));
    }

    // user-2 has not made any requests — should succeed
    expect(guard.canActivate(buildContext('user-2'))).toBe(true);
  });

  it('allows requests again after the time window expires', () => {
    for (let i = 0; i < 20; i++) {
      guard.canActivate(buildContext('user-1'));
    }

    // Advance time past the 60s window
    currentTime += 61_000;

    // Old entries have expired — should succeed again
    expect(guard.canActivate(buildContext('user-1'))).toBe(true);
  });

  it('evicts stale timestamps when the window rolls forward', () => {
    // Make 15 requests at t=0 (below the 20-request limit)
    for (let i = 0; i < 15; i++) {
      guard.canActivate(buildContext('user-1'));
    }

    // Advance past the full window — all 15 entries become stale.
    currentTime += 61_000;

    // The guard must evict the stale entries on access.
    // If eviction were NOT happening, the 15 old entries would still count
    // and only 5 more requests would be allowed before hitting the limit.
    // With correct eviction, all 20 slots are free again.
    for (let i = 0; i < 20; i++) {
      expect(guard.canActivate(buildContext('user-1'))).toBe(true);
    }

    // 21st request in the new window must be rejected.
    expect(() => guard.canActivate(buildContext('user-1'))).toThrow(
      HttpException
    );
  });

  it('allows request when user field is absent (unauthenticated — deferred to AuthGuard)', () => {
    const anonCtx = {
      switchToHttp: () => ({
        getRequest: () => ({})
      })
    } as unknown as ExecutionContext;

    expect(guard.canActivate(anonCtx)).toBe(true);
  });
});
