import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionPath = resolve(__dirname, '..', 'version.json');

const version = JSON.parse(readFileSync(versionPath, 'utf-8'));
version.build += 1;

writeFileSync(versionPath, JSON.stringify(version, null, 2) + '\n');

const versionStr = `${version.major}.${version.minor}.${version.build}`;
console.log(`\x1b[36m✔ Version bumped to v${versionStr}\x1b[0m`);
