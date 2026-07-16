import opinionated from 'opinionated-eslint-config';

export default opinionated().append({
  // Don't want to lint test assets, the nested forge-admin app (self-linted with
  // its own oxlint config), or generated static build output under docs/.
  ignores: [
    'test/assets/*',
    'componentsjs-error-state.json',
    '.data/**',
    'forge-admin/**',
    'docs/**',
    'work-files/**',
    '**/use-cases.json',
  ],
});
