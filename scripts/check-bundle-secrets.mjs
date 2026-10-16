#!/usr/bin/env node
// Fails if the built web bundle contains secret env key names or actual secret values.
// Usage: node scripts/check-bundle-secrets.mjs [distDir]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(process.argv[2] ?? join(root, 'apps/web/dist'));
const SECRET_KEY = /(_API_KEY|_SECRET|_TOKEN|_PASSWORD|AUTH_KEY)$/;

if (!existsSync(dist)) {
  console.error(`[bundle-secrets] ${dist} does not exist. Run "npm run build" first.`);
  process.exit(2);
}

// Collect secret values from the process env and the root .env (if present).
const env = { ...process.env };
const dotenv = join(root, '.env');
if (existsSync(dotenv)) {
  for (const line of readFileSync(dotenv, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const secretNames = Object.keys(env).filter((k) => SECRET_KEY.test(k));
const secretValues = secretNames.map((k) => env[k]).filter((v) => v && v.length >= 8);
// Key names that would indicate server config leaking into the client.
const forbiddenNames = [...new Set([...secretNames, 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'])];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const findings = [];
for (const file of walk(dist)) {
  if (file.endsWith('.map')) continue; // source maps are not served to users in prod checks
  const text = readFileSync(file, 'utf8');
  for (const name of forbiddenNames) if (text.includes(name)) findings.push(`${file}: contains key name ${name}`);
  for (const value of secretValues) if (text.includes(value)) findings.push(`${file}: contains a secret value`);
}

if (findings.length) {
  console.error('[bundle-secrets] FAILED');
  for (const f of findings) console.error('  ' + f);
  process.exit(1);
}
console.log(`[bundle-secrets] OK — scanned ${dist}, ${secretValues.length} secret value(s) and ${forbiddenNames.length} key name(s) absent.`);
