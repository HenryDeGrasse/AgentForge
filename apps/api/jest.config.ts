/* eslint-disable */

// Must be set before any date operations are evaluated.
// Node caches the timezone at startup on some platforms, but setting it
// at config-load time (before any test file is imported) is early enough
// when Jest runs in the same process (--runInBand) or forks workers.
process.env.TZ = 'UTC';

export default {
  displayName: 'api',

  globals: {},
  setupFiles: ['<rootDir>/test/jest-global-setup.ts'],
  moduleNameMapper: {
    // Prevent langfuse's internal dynamic-import from crashing CommonJS Jest
    '^langfuse$': '<rootDir>/src/__mocks__/langfuse.js',
    '^langfuse-core$': '<rootDir>/src/__mocks__/langfuse.js'
  },
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json'
      }
    ]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api',
  testEnvironment: 'node',
  preset: '../../jest.preset.js'
};
