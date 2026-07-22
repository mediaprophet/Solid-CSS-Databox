const jestConfig = require('./jest.config');

module.exports = {
  ...jestConfig,
  collectCoverage: true,
  coverageReporters: [ 'text', 'lcov' ],
  coveragePathIgnorePatterns: [
    '/dist/',
    '/node_modules/',
    '/test/',
    // Experimental Track B Databox extension: tests still run, but the extension
    // is not yet held to the CSS core's 100% coverage gate.
    '/src/databox/',
  ],
  coverageThreshold: {
    './src': {
      branches: 98,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};
