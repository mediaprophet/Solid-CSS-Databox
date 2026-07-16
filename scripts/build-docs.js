/* eslint-disable no-console, no-sync -- CLI build script: console output is intended; sync fs is appropriate here. */
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const docsDir = path.join(rootDir, 'docs');
const templatesDir = path.join(rootDir, 'templates');

// Ensure docs dir exists
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const assetsDir = path.join(docsDir, 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 1. Copy assets
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(path.join(templatesDir, 'styles'), path.join(assetsDir, 'styles'));
copyDir(path.join(templatesDir, 'images'), path.join(assetsDir, 'images'));
copyDir(path.join(templatesDir, 'scripts'), path.join(assetsDir, 'scripts'));

// 2. Read and patch index.html
const indexSrc = path.join(templatesDir, 'root/intro/base/index.html');
let indexHtml = fs.readFileSync(indexSrc, 'utf8');

// Replace asset paths
indexHtml = indexHtml.replaceAll('/.well-known/css/', './assets/');

// The demos won't work perfectly on GH pages without a backend, so we will disable the provision buttons
// and add a note that the backend is disconnected.
indexHtml = indexHtml.replace(
  `<h3>Seraphim Welfare Demonstrator</h3>`,
  `<div class="demo-banner" style="background: rgba(220,38,38,0.2); border: 1px solid rgba(220,38,38,0.4); margin-bottom: 1rem;">NOTE: This static GitHub Pages version cannot run the backend provisioner APIs. Clone the repo and run locally for full interactivity.</div>\n        <h3>Seraphim Welfare Demonstrator</h3>`,
);

// Disable the API calls in provision methods so it doesn't throw console errors
indexHtml = indexHtml.replace(
  `const program = await apiPost('/programs'`,
  `throw new Error('Backend APIs are disabled on the static GitHub Pages deployment.');\n        const program = await apiPost('/programs'`,
);
// Replace twice for both functions just in case
indexHtml = indexHtml.replace(
  `const program = await apiPost('/programs'`,
  `throw new Error('Backend APIs are disabled on the static GitHub Pages deployment.');\n        const program = await apiPost('/programs'`,
);

// We need to write it to docs/index.html
fs.writeFileSync(path.join(docsDir, 'index.html'), indexHtml, 'utf8');

// Also create a CNAME or just touch .nojekyll
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '', 'utf8');

console.log('Successfully built static site to /docs folder.');
