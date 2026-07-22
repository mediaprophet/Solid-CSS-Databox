const fs = require('node:fs');
const path = require('node:path');

const filesToPatch = [
  path.join(__dirname, '../templates/root/static/index.html'),
  path.join(__dirname, '../templates/root/intro/base/index.html'),
  path.join(__dirname, '../templates/root/prefilled/base/index.html'),
];

for (const filePath of filesToPatch) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Add button to hero section
    const heroBtn = `<div class="cta-buttons" style="margin-top: 2rem;">
        <a href="#demonstrators" class="btn btn-primary" onclick="smoothScroll(event, 'demonstrators')">Explore Demonstrators</a>
        <a href="/forge/index.html" class="btn btn-secondary" style="margin-left: 1rem; background: rgba(212, 175, 55, 0.1); border: 1px solid var(--color-accent); color: var(--color-accent); padding: 0.8rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block; transition: all 0.3s ease;">Open Forge Dashboard</a>
      </div>`;

    if (!content.includes('Open Forge Dashboard')) {
      content = content.replace(
        `<div class="cta-buttons" style="margin-top: 2rem;">\n        <a href="#demonstrators" class="btn btn-primary" onclick="smoothScroll(event, 'demonstrators')">Explore Demonstrators</a>\n      </div>`,
        heroBtn,
      );

      // If the exact match fails due to whitespace formatting, do a simpler replace
      if (!content.includes('Open Forge Dashboard')) {
        content = content.replace(
          `onclick="smoothScroll(event, 'demonstrators')">Explore Demonstrators</a>`,
          `onclick="smoothScroll(event, 'demonstrators')">Explore Demonstrators</a>\n        <a href="/forge/index.html" class="btn btn-secondary" style="margin-left: 1rem; background: rgba(212, 175, 55, 0.1); border: 1px solid var(--color-accent); color: var(--color-accent); padding: 0.8rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block; transition: all 0.3s ease;">Open Forge Dashboard</a>`,
        );
      }

      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
}
console.log('Added Forge Dashboard link to landing pages.');
