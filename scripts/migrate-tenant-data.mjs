#!/usr/bin/env node
/**
 * L62 migration: copies the legacy shared lab stores into one learner's storage partition.
 *
 * Before L62 every learner shared <dataDir>/memory/*.db, memory/library/ and comparisons/. After L62
 * each learner has <dataDir>/memory/tenants/<partition>/. Nothing is migrated automatically, so a shared
 * legacy store never becomes visible to every learner; run this once for the learner who owns it.
 *
 *   node scripts/migrate-tenant-data.mjs --owner dev:learner [--move] [--dry-run]
 *
 * --owner    the principal sub (e.g. dev:learner, as shown by GET /api/auth/session)
 * --move     delete each legacy source after it was copied successfully (default: copy only)
 * --dry-run  print what would be done without touching any file
 * Existing files in the partition are never overwritten. MLP_DATA_DIR selects the data dir (default .data).
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Must match partitionOf() in packages/labs/src/services.ts. */
export const partitionOf = (ownerId) => createHash('sha256').update(`tenant:${ownerId}`, 'utf8').digest('hex').slice(0, 24);

export function plan(dataDir, ownerId) {
  const memory = join(dataDir, 'memory');
  const target = join(memory, 'tenants', partitionOf(ownerId));
  const steps = [];
  if (existsSync(memory))
    for (const name of readdirSync(memory)) {
      const src = join(memory, name);
      if (/\.db(-[a-z]+)?$/.test(name) && statSync(src).isFile()) steps.push({ src, dest: join(target, name) });
      if (name === 'library' && statSync(src).isDirectory()) steps.push({ src, dest: join(target, 'library') });
    }
  const comparisons = join(dataDir, 'comparisons');
  if (existsSync(comparisons)) steps.push({ src: comparisons, dest: join(target, 'files', 'comparisons') });
  return { target, steps };
}

export function migrate(dataDir, ownerId, { move = false, dryRun = false } = {}) {
  const { target, steps } = plan(dataDir, ownerId);
  const report = [];
  for (const { src, dest } of steps) {
    if (existsSync(dest)) {
      report.push({ src, dest, action: 'skipped (target exists)' });
      continue;
    }
    if (!dryRun) {
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest, { recursive: true, errorOnExist: true, force: false });
      if (move) rmSync(src, { recursive: true, force: true });
    }
    report.push({ src, dest, action: dryRun ? 'would copy' : move ? 'moved' : 'copied' });
  }
  return { target, report };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const owner = args[args.indexOf('--owner') + 1];
  if (!args.includes('--owner') || !owner || owner.startsWith('--')) {
    process.stderr.write('Usage: node scripts/migrate-tenant-data.mjs --owner <principal sub> [--move] [--dry-run]\n');
    process.exit(2);
  }
  const dataDir = process.env.MLP_DATA_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '.data');
  const { target, report } = migrate(dataDir, owner, { move: args.includes('--move'), dryRun: args.includes('--dry-run') });
  process.stdout.write(`Partition for ${owner}: ${target}\n`);
  for (const r of report) process.stdout.write(`${r.action}: ${r.src} -> ${r.dest}\n`);
  if (report.length === 0) process.stdout.write('Nothing to migrate.\n');
}
