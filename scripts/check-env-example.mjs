#!/usr/bin/env node
// Fails if any committed example env file assigns a value to a secret-looking variable.
// Real keys belong only in the gitignored .env. Usage: node scripts/check-env-example.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = ['.env.example', 'examples/course-project/.env.example', 'packages/labs/src/lab-01/template/.env.example'];
const SECRET = /^\s*([A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*)\s*=\s*(\S.*)$/;

const problems = [];
for (const f of files) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      const m = SECRET.exec(line);
      if (m) problems.push(`${f}:${i + 1}: ${m[1]} has a value (keep example files empty; put real keys in .env)`);
    });
}

if (problems.length) {
  console.error('[env-example] FAILED');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`[env-example] OK — ${files.length} example file(s) contain no secret values.`);
