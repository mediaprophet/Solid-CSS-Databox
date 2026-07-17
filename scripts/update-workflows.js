/* eslint-disable no-console, no-sync -- CLI script: console output is intended; sync fs is appropriate here. */
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../.github/workflows');
const files = fs.readdirSync(dir);

for (const file of files) {
  if (file.endsWith('.yml')) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace v7.0.0 and v6 with v4
    content = content.replaceAll(/actions\/checkout@v[\d.]+/gu, 'actions/checkout@v4');
    content = content.replaceAll(/actions\/setup-node@v[\d.]+/gu, 'actions/setup-node@v4');
    content = content.replaceAll(/actions\/setup-python@v[\d.]+/gu, 'actions/setup-python@v5');
    content = content.replaceAll(/actions\/upload-artifact@v[\d.]+/gu, 'actions/upload-artifact@v4');
    // Bump any Node pin older than the supported floor (see the `engines` field in package.json)
    content = content.replaceAll(/node-version:\s*(?:1\d|2[0-3])\.x/gu, 'node-version: 24.x');

    fs.writeFileSync(filePath, content, 'utf8');
  }
}

console.log('Workflows updated.');
