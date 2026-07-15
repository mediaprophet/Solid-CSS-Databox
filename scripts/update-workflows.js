const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../.github/workflows');
const files = fs.readdirSync(dir);

for (const file of files) {
  if (file.endsWith('.yml')) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace v7.0.0 and v6 with v4
    content = content.replace(/actions\/checkout@v[0-9.]+/g, 'actions/checkout@v4');
    content = content.replace(/actions\/setup-node@v[0-9.]+/g, 'actions/setup-node@v4');
    content = content.replace(/actions\/setup-python@v[0-9.]+/g, 'actions/setup-python@v5');
    content = content.replace(/actions\/upload-artifact@v[0-9.]+/g, 'actions/upload-artifact@v4');
    content = content.replace(/node-version:\s*16\.x/g, 'node-version: 20.x');
    
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

console.log('Workflows updated.');
