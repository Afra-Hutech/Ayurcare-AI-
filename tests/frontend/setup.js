import '@testing-library/jest-dom';

// Suppress known non-critical console errors from React internals during test
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    const msg = String(args[0] || '');
    // Filter out known expected warnings in test environment
    if (
      msg.includes('Warning: ReactDOM.render is no longer supported') ||
      msg.includes('Not implemented: navigation') ||
      msg.includes('Warning: An update to')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
