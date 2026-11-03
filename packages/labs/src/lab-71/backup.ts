import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { z } from 'zod';
import { LabError } from '@mlp/lab-engine';
import { schemaVersion } from './migrations.js';
import { countsOf, type Counts } from './store.js';

export const ManifestSchema = z.object({
  file: z.string().regex(/^[\w.-]+\.db$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  schemaVersion: z.number().int().nonnegative(),
  counts: z.object({
    progress: z.number().int(),
    documents: z.number().int(),
    runs: z.number().int(),
    threads: z.number().int(),
    messages: z.number().int(),
  }),
  createdAt: z.string(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

const sha256File = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

export interface Inspection {
  integrity: string;
  schemaVersion: number;
  counts: Counts;
}

/**
 * Reads a database file without keeping it open: it is ATTACHed to a single-connection in-memory client and
 * DETACHed again. (With @libsql/client 0.18.0 on Windows, a client opened on a file keeps it locked after
 * close() until the process exits, so snapshots are never opened with their own client.)
 */
export async function inspect(file: string): Promise<Inspection> {
  const host = createClient({ url: ':memory:' });
  try {
    await host.execute({ sql: 'ATTACH DATABASE ? AS snap', args: [file] });
    try {
      const integrity = String((await host.execute('PRAGMA snap.integrity_check')).rows[0]?.integrity_check ?? '');
      return { integrity, schemaVersion: await schemaVersion(host, 'snap'), counts: await countsOf(host, 'snap') };
    } finally {
      await host.execute('DETACH DATABASE snap');
    }
  } finally {
    host.close();
  }
}

/**
 * A consistent snapshot of a live (WAL) database with VACUUM INTO, plus a manifest. Snapshots beyond `keep`
 * are deleted, oldest first (names start with an ISO timestamp).
 */
export async function backup(
  client: Client,
  dir: string,
  opts: { keep: number; now?: Date },
): Promise<{ manifest: Manifest; rotated: string[] }> {
  mkdirSync(dir, { recursive: true });
  const version = await schemaVersion(client);
  const at = opts.now ?? new Date();
  const stamp = at.toISOString().replace(/[:.]/g, '-');
  let name = `${stamp}-v${version}.db`;
  for (let i = 1; existsSync(join(dir, name)); i++) name = `${stamp}-${i}-v${version}.db`;
  const target = join(dir, name);
  await client.execute({ sql: 'VACUUM INTO ?', args: [target] });
  const { counts } = await inspect(target);
  const manifest: Manifest = {
    file: name,
    sha256: sha256File(target),
    bytes: statSync(target).size,
    schemaVersion: version,
    counts,
    createdAt: at.toISOString(),
  };
  writeFileSync(`${target}.json`, JSON.stringify(manifest, null, 2));
  return { manifest, rotated: rotate(dir, opts.keep) };
}

/** Snapshots that have a manifest, newest first. */
export function listBackups(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.db$/.test(f) && existsSync(join(dir, `${f}.json`)))
    .sort()
    .reverse();
}

function rotate(dir: string, keep: number): string[] {
  const old = listBackups(dir).slice(Math.max(1, keep));
  for (const f of old) {
    rmSync(join(dir, f), { force: true });
    rmSync(join(dir, `${f}.json`), { force: true });
  }
  return old;
}

export interface Verification {
  ok: boolean;
  problems: string[];
  manifest?: Manifest;
}

/** Re-hashes the snapshot, runs SQLite's integrity check and recounts the rows against the manifest. */
export async function verifyBackup(dir: string, file: string): Promise<Verification> {
  const path = join(dir, basename(file));
  let raw: unknown;
  try {
    raw = existsSync(`${path}.json`) ? JSON.parse(readFileSync(`${path}.json`, 'utf8')) : null;
  } catch {
    raw = null;
  }
  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: ['the manifest is missing or invalid'] };
  const manifest = parsed.data;
  if (!existsSync(path)) return { ok: false, problems: ['the snapshot file is missing'], manifest };
  if (sha256File(path) !== manifest.sha256)
    return { ok: false, problems: ['the snapshot bytes do not match the manifest hash'], manifest };
  const problems: string[] = [];
  try {
    const found = await inspect(path);
    if (found.integrity !== 'ok') problems.push(`integrity check: ${found.integrity.slice(0, 200)}`);
    if (found.schemaVersion !== manifest.schemaVersion) problems.push('the schema version differs from the manifest');
    for (const k of Object.keys(manifest.counts) as (keyof Counts)[])
      if (found.counts[k] !== manifest.counts[k])
        problems.push(`${k}: ${found.counts[k]} rows, the manifest says ${manifest.counts[k]}`);
  } catch (e) {
    problems.push(`the snapshot cannot be read: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown error'}`);
  }
  return { ok: problems.length === 0, problems, manifest };
}

/**
 * Restores a verified snapshot over `target` atomically (copy to a temp file, then rename), removing stale
 * -wal/-shm files so SQLite never replays them onto the restore. Run it while nothing has the target open:
 * in production, with the server stopped (an offline maintenance step).
 */
export async function restore(dir: string, file: string, target: string): Promise<Manifest> {
  const v = await verifyBackup(dir, file);
  if (!v.ok || !v.manifest) throw new LabError('CONFLICT', `Restore refused: ${v.problems.join('; ')}`);
  const tmp = `${target}.restore-tmp`;
  copyFileSync(join(dir, basename(file)), tmp);
  try {
    for (const suffix of ['-wal', '-shm']) rmSync(`${target}${suffix}`, { force: true });
    renameSync(tmp, target);
  } catch (e) {
    rmSync(tmp, { force: true });
    if ((e as NodeJS.ErrnoException).code === 'EPERM' || (e as NodeJS.ErrnoException).code === 'EBUSY')
      throw new LabError('CONFLICT', 'Restore refused: the target database is still open. Stop the server, then restore.', {
        cause: e,
      });
    throw e;
  }
  return v.manifest;
}
