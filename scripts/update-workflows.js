const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../.github/workflows');
const files = fs.readdirSync(dir);

for (const file of files) {
  if (file.endsWith('.yml')) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Keep first-party actions on their current supported major versions.
    content = content.replaceAll(/actions\/checkout@v[\d.]+/gu, 'actions/checkout@v5');
    content = content.replaceAll(/actions\/setup-node@v[\d.]+/gu, 'actions/setup-node@v5');
    content = content.replaceAll(/actions\/setup-python@v[\d.]+/gu, 'actions/setup-python@v5');
    content = content.replaceAll(/actions\/upload-artifact@v[\d.]+/gu, 'actions/upload-artifact@v4');
    // Bump any legacy Node 10–23 pin, including quoted and patch-level forms.
    content = content.replaceAll(/node-version:\s*['"]?v?(?:1\d|2[0-3])(?:\.(?:\d+|x)){0,2}['"]?/gu, 'node-version: 24.x');

    fs.writeFileSync(filePath, content, 'utf8');
  }
}

console.log('Workflows updated.');
