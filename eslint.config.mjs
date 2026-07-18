import opinionated from 'opinionated-eslint-config';

export default opinionated().append({
  // Don't want to lint test assets, the nested forge-admin app (self-linted with
  // its own oxlint config), generated static build output under docs/, or the
  // vendored minified third-party scripts served with the landing page.
  ignores: [
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
