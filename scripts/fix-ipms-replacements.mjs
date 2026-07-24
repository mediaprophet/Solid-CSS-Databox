import fs from 'fs';
import path from 'path';

const ROOT_DIR = 'c:\\Projects\\CommunitySolidServer';
const DATABOX_DIR = path.join(ROOT_DIR, 'databox');
const SCRIPTS_DIR = path.join(ROOT_DIR, 'scripts');
const TEST_DIR = path.join(ROOT_DIR, 'test');

function renameDirIfExist(oldPath, newPath) {
    if (fs.existsSync(oldPath)) {
        console.log(`Renaming directory: ${oldPath} -> ${newPath}`);
        fs.renameSync(oldPath, newPath);
    }
}

// Rename databox/deployment/ipms to ipms
renameDirIfExist(path.join(DATABOX_DIR, 'deployment', 'ipms'), path.join(DATABOX_DIR, 'deployment', 'ipms'));
// Rename docker-compose.ipms.yml to docker-compose.ipms.yml
const composeOld = path.join(DATABOX_DIR, 'deployment', 'ipms', 'docker-compose.ipms.yml');
const composeNew = path.join(DATABOX_DIR, 'deployment', 'ipms', 'docker-compose.ipms.yml');
if (fs.existsSync(composeOld)) {
    fs.renameSync(composeOld, composeNew);
}

function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (['node_modules', 'dist', '.git', 'coverage', '.gemini'].includes(file)) continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            walkDir(fullPath);
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

walkDir(DATABOX_DIR);
walkDir(SCRIPTS_DIR);
walkDir(TEST_DIR);

