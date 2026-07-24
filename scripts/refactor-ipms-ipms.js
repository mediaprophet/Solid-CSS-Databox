import fs from 'fs';
import path from 'path';

const ROOT_DIR = 'c:\\Projects\\CommunitySolidServer';
const SRC_DIR = path.join(ROOT_DIR, 'src');
const CONFIG_DIR = path.join(ROOT_DIR, 'config');
const TEST_DIR = path.join(ROOT_DIR, 'test');
const FORGE_DIR = path.join(ROOT_DIR, 'forge-admin');

// 1. Rename directories
function renameDirIfExist(oldPath, newPath) {
    if (fs.existsSync(oldPath)) {
        console.log(`Renaming directory: ${oldPath} -> ${newPath}`);
        fs.renameSync(oldPath, newPath);
    }
}

renameDirIfExist(path.join(SRC_DIR, 'databox', 'ipms'), path.join(SRC_DIR, 'databox', 'ipms'));
renameDirIfExist(path.join(CONFIG_DIR, 'ipms'), path.join(CONFIG_DIR, 'ipms'));
renameDirIfExist(path.join(TEST_DIR, 'unit', 'databox', 'ipms'), path.join(TEST_DIR, 'unit', 'databox', 'ipms'));

// 2. Walk tree and rename files and contents
function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (['node_modules', 'dist', '.git', '.gemini', 'coverage'].includes(file)) continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            walkDir(fullPath);
            // Rename directory if needed
            if (file.includes('Ipms') || file.includes('ipms')) {
                const newName = file.replace(/Ipms/g, 'Ipms').replace(/ipms/g, 'ipms');
                const newPath = path.join(dir, newName);
                console.log(`Renaming directory: ${fullPath} -> ${newPath}`);
                fs.renameSync(fullPath, newPath);
            }
        } else {
            // Rename file if needed
            let currentPath = fullPath;
            if (file.includes('Ipms') || file.includes('ipms')) {
                const newName = file.replace(/Ipms/g, 'Ipms').replace(/ipms/g, 'ipms');
                const newPath = path.join(dir, newName);
                console.log(`Renaming file: ${currentPath} -> ${newPath}`);
                fs.renameSync(currentPath, newPath);
                currentPath = newPath;
            }

            // Replace contents for text files
            if (/\.(ts|tsx|json|js|mjs|md|html|yml|yaml|jsonld|ttl)$/.test(currentPath)) {
                let content = fs.readFileSync(currentPath, 'utf8');
                let newContent = content
                    .replace(/\bIpms\b/g, 'Ipms')
                    .replace(/\bcms\b/g, 'ipms')
                    .replace(/\bCMS\b/g, 'IPMS')
                    .replace(/Ipms([A-Z])/g, 'Ipms$1')
                    .replace(/ipms([A-Z])/g, 'ipms$1')
                    .replace(/([a-z])Ipms\b/g, '$1Ipms');

                if (content !== newContent) {
                    console.log(`Updating contents of: ${currentPath}`);
                    fs.writeFileSync(currentPath, newContent, 'utf8');
                }
            }
        }
    }
}

console.log('Starting refactor...');
[SRC_DIR, CONFIG_DIR, TEST_DIR, FORGE_DIR, path.join(ROOT_DIR, 'scripts'), path.join(ROOT_DIR, 'bin'), path.join(ROOT_DIR, 'package.json'), path.join(ROOT_DIR, 'tsconfig.json')].forEach(p => {
    if (fs.existsSync(p)) {
        if (fs.statSync(p).isDirectory()) {
            walkDir(p);
        } else {
            // Handle root files
            let content = fs.readFileSync(p, 'utf8');
            let newContent = content
                .replace(/\bIpms\b/g, 'Ipms')
                .replace(/\bcms\b/g, 'ipms')
                .replace(/\bCMS\b/g, 'IPMS')
                .replace(/Ipms([A-Z])/g, 'Ipms$1')
                .replace(/ipms([A-Z])/g, 'ipms$1');
            if (content !== newContent) {
                console.log(`Updating contents of: ${p}`);
                fs.writeFileSync(p, newContent, 'utf8');
            }
        }
    }
});
console.log('Refactor complete.');
