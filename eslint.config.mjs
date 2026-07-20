import opinionated from 'opinionated-eslint-config';

export default opinionated().append({
  // Don't lint generated/runtime output. The nested forge-admin app is self-linted
  // with oxlint, and local agent/runtime folders are not source of truth.
  ignores: [
    '.agents/**',
    '.claude/**',
    'coverage/**',
    'dist/**',
    'test/assets/*',
    'componentsjs-error-state.json',
    '.data/**',
    'forge-admin/**',
    'docs/**',
    'templates/scripts/**',
    '**/*.min.js',
    'work-files/**',
    '**/use-cases.json',
  ],
});
