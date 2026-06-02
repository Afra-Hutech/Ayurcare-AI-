/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['./setup.js'],
  setupFilesAfterFramework: ['@testing-library/jest-dom'],
  setupFilesAfterFramework: undefined,
  setupFiles: ['./setup.js'],
  transform: {
    '^.+\\.(jsx?|tsx?)$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        ['@babel/preset-react', { runtime: 'automatic' }],
      ],
    }],
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/styleMock.js',
    '\\.(png|jpg|jpeg|gif|svg|ico)$': '<rootDir>/__mocks__/fileMock.js',
  },
  testMatch: ['**/*.test.jsx', '**/*.test.js'],
  collectCoverageFrom: [
    '../../ayurveda-app/frontend_chat/src/**/*.{js,jsx}',
    '!**/node_modules/**',
  ],
};
