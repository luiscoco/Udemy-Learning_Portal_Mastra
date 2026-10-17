#!/usr/bin/env node
// Fails if any commit not yet on origin/main contains a secret value from the local .env.
// Values are compared in memory and never printed. Usage: node scripts/check-outgoing-secrets.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = join(root, '.env');
if (!existsSync(envPath)) {
  console.log('[outgoing-secrets] no .env — nothing to compare');
  process.exit(0);
}
const values = readFileSync(envPath, 'utf8')
  .split(/\r?\n/)
  .map((l) => /^\s*([A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*)\s*=\s*(.+)$/.exec(l))
  .filter(Boolean)
  .map((m) => [m[1], m[3].trim().replace(/^['"]|['"]$/g, '')])
  .filter(([, v]) => v.length >= 8);
const diff = execFileSync('git', ['log', '-p', 'origin/main..HEAD'], { cwd: root, maxBuffer: 256 * 1024 * 1024 }).toString();
const leaked = values.filter(([, v]) => diff.includes(v)).map(([k]) => k);
if (leaked.length) {
  console.error(`[outgoing-secrets] FAILED — unpushed commits contain the value of: ${leaked.join(', ')}`);
  process.exit(1);
}
console.log(`[outgoing-secrets] OK — ${values.length} secret value(s) absent from unpushed commits.`);
