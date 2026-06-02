/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch:       ['**/*.test.js'],
  testTimeout:     30_000,        // PostgreSQL sync + upsert tests need headroom
  verbose:         true,
  globalSetup:     undefined,
  globalTeardown:  undefined,
  collectCoverageFrom: [
    '../../doctor-portal/server/**/*.js',
    '!**/node_modules/**',
    '!**/scripts/**',
  ],
};
