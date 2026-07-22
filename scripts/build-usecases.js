const fs = require('node:fs');
const path = require('node:path');

const baseDir = path.join('C:', 'Projects', 'webcivics', 'solid-databox', 'industry-applications');
const outputFile = path.join(__dirname, '..', 'templates', 'scripts', 'use-cases.json');

const useCases = [];

if (fs.existsSync(baseDir)) {
  const categories = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const category of categories) {
    const categoryPath = path.join(baseDir, category);
    const subDirs = fs.readdirSync(categoryPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const subDir of subDirs) {
      const readmePath = path.join(categoryPath, subDir, 'README.md');

      if (fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, 'utf8');
        const lines = content.split('\n');

        let title = '';
        let description = '';

        for (const line_ of lines) {
          const line = line_.trim();
          if (line.startsWith('# ') && !title) {
            title = line.replace('# ', '').trim();
          } else if (line.length > 0 && !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('>') && !title.includes(line) && !description) {
            description = line;
          }
          if (title && description) {
            break;
          }
        }

        if (title || subDir) {
          useCases.push({
            category: category.replaceAll('-', ' ').replaceAll(/\b\w/gu, c => c.toUpperCase()),
            slug: subDir,
            title: title || subDir.replaceAll('-', ' '),
            description: description || 'No description available.',
          });
        }
      }
    }
  }
}

fs.writeFileSync(outputFile, JSON.stringify(useCases, null, 2), 'utf8');
console.log(`Generated use-cases.json with ${useCases.length} entries at ${outputFile}`);
