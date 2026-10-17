#!/usr/bin/env node
// Registers an implemented lab: adds it to packages/labs/src/index.ts (allLabs) and marks it
// available in packages/lab-catalog/src/labs.ts. Idempotent.
// Usage: node scripts/register-lab.mjs 6
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const n = Number(process.argv[2]);
if (!Number.isInteger(n) || n < 1 || n > 75) {
  console.error('Usage: node scripts/register-lab.mjs <lab number 1-75>');
  process.exit(2);
}
const nn = String(n).padStart(2, '0');
const root = resolve(import.meta.dirname, '..');

const indexPath = join(root, 'packages/labs/src/index.ts');
let index = readFileSync(indexPath, 'utf8');
if (!index.includes(`./lab-${nn}/run.js`)) {
  const lastImport = [...index.matchAll(/^import \{ lab\d{2}Fixtures \} from '\.\/lab-\d{2}\/fixtures\.js';$/gm)].at(-1);
  if (!lastImport) throw new Error('Could not find lab imports in index.ts');
  const at = lastImport.index + lastImport[0].length;
  index =
    index.slice(0, at) +
    `\nimport { lab${nn} } from './lab-${nn}/run.js';\nimport { lab${nn}Fixtures } from './lab-${nn}/fixtures.js';` +
    index.slice(at);
  const marker = 'export const allLabs: RegisteredLab[] = [\n';
  const start = index.indexOf(marker);
  const close = index.indexOf('\n];', start);
  if (start === -1 || close === -1) throw new Error('Could not find allLabs array in index.ts');
  index = `${index.slice(0, close)}\n  reg(lab${nn}, lab${nn}Fixtures),${index.slice(close)}`;
  writeFileSync(indexPath, index);
  console.log(`index.ts: registered lab-${nn}`);
}

const catalogPath = join(root, 'packages/lab-catalog/src/labs.ts');
const catalog = readFileSync(catalogPath, 'utf8');
const m = /AVAILABLE_LAB_NUMBERS: ReadonlySet<number> = new Set\(\[([^\]]*)\]\)/.exec(catalog);
if (!m) throw new Error('AVAILABLE_LAB_NUMBERS not found');
const nums = new Set(m[1].split(',').map((s) => Number(s.trim())).filter((x) => Number.isInteger(x)));
if (!nums.has(n)) {
  nums.add(n);
  const list = [...nums].sort((a, b) => a - b).join(', ');
  writeFileSync(catalogPath, catalog.replace(m[0], `AVAILABLE_LAB_NUMBERS: ReadonlySet<number> = new Set([${list}])`));
  console.log(`labs.ts: lab-${nn} available`);
}
