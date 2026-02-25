/**
 * Global setup for api test suite.
 *
 * - Provides dummy values for required env vars so specs that instantiate
 *   ConfigurationService (via envalid) don't hard-exit.
 * - Sets TZ=UTC so date-sensitive portfolio calculator specs produce
 *   consistent results regardless of the host timezone.
 */

// TZ is now set in jest.config.ts at module-load time (before workers fork).
// This file provides fallback env vars only.

// Required by ConfigurationService (envalid str() with no default)
if (!process.env.ACCESS_TOKEN_SALT) {
  process.env.ACCESS_TOKEN_SALT = 'test-salt';
}

if (!process.env.JWT_SECRET_KEY) {
  process.env.JWT_SECRET_KEY = 'test-jwt-secret';
}
