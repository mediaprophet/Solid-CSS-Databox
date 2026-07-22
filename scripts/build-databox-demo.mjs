// Builds the forge-admin "Admin" app as a static, backend-free demo and stages
// it into docs/admin/ for GitHub Pages.
//
// The demo build sets VITE_DEMO=true, which makes App.tsx use the in-memory
// demoDataProvider + HashRouter (see forge-admin/src/App.tsx). The live/dev
// build is unaffected. Relative base (./) lets the output run from any Pages
// sub-path. Cross-platform: no shell-specific env syntax.
//
// Usage: `npm run build:demo` (from the repo root), or run in CI.

import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const forgeDir = join(root, 'forge-admin');
const distDir = join(forgeDir, 'dist');
const outDir = join(root, 'docs', 'admin');

if (!existsSync(join(forgeDir, 'node_modules'))) {
  console.log('› Installing forge-admin dependencies …');
  execSync('npm ci', { cwd: forgeDir, stdio: 'inherit' });
}

console.log('› Building forge-admin demo (VITE_DEMO=true, base=./) …');
execSync('npx vite build --base=./', {
  cwd: forgeDir,
  stdio: 'inherit',
  env: { ...process.env, VITE_DEMO: 'true' },
});

console.log('› Staging build into docs/admin …');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(distDir, outDir, { recursive: true });

console.log('✓ docs/admin refreshed.');
