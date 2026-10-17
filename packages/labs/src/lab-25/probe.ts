import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import * as memoryPkg from '@mastra/memory';
import type { LibSQLStore } from '@mastra/libsql';

export const OM_MIN_VERSION = '1.1.0';
/** Adapters the bundled OM docs list as supported. */
export const OM_STORAGE_ADAPTERS = [
  '@mastra/pg',
  '@mastra/libsql',
  '@mastra/mysql',
  '@mastra/mongodb',
  '@mastra/convex',
  '@mastra/oracledb',
];

export interface CapabilityRow {
  name: string;
  available: boolean;
  evidence: string;
}
export interface Capabilities {
  nativeAvailable: boolean;
  memoryVersion: string;
  rows: CapabilityRow[];
}

const require = createRequire(import.meta.url);
const memoryDist = () => dirname(require.resolve('@mastra/memory'));

const semverAtLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split(/[.-]/).slice(0, 3).map(Number));
  for (let i = 0; i < 3; i++) if (a![i]! !== b![i]!) return a![i]! > b![i]!;
  return true;
};

/**
 * Feature-detects Mastra Observational Memory from evidence in the installed packages (not from
 * assumptions): package version, exports, bundled docs, and the storage adapter's read API.
 */
export function probeObservationalMemory(storage: LibSQLStore, adapter = '@mastra/libsql'): Capabilities {
  const pkg = JSON.parse(readFileSync(join(memoryDist(), '..', 'package.json'), 'utf8')) as { version: string };
  const docs = join(memoryDist(), 'docs', 'references', 'docs-memory-observational-memory.md');
  const readApi = (storage.stores as { memory?: { getObservationalMemory?: unknown } }).memory?.getObservationalMemory;
  const rows: CapabilityRow[] = [
    {
      name: 'version',
      available: semverAtLeast(pkg.version, OM_MIN_VERSION),
      evidence: `@mastra/memory ${pkg.version} (OM added in ${OM_MIN_VERSION})`,
    },
    {
      name: 'export',
      available: typeof (memoryPkg as Record<string, unknown>).getObservationsAsOf === 'function',
      evidence: '@mastra/memory exports getObservationsAsOf',
    },
    {
      name: 'docs',
      available: existsSync(docs),
      evidence: 'bundled docs: dist/docs/references/docs-memory-observational-memory.md',
    },
    {
      name: 'storage-read-api',
      available: typeof readApi === 'function',
      evidence: 'storage.stores.memory.getObservationalMemory is a function',
    },
    {
      name: 'storage-adapter',
      available: OM_STORAGE_ADAPTERS.includes(adapter),
      evidence: `${adapter} is listed as a supported OM adapter`,
    },
  ];
  return { nativeAvailable: rows.every((r) => r.available), memoryVersion: pkg.version, rows };
}

/** First-person statements in a transcript ("I'm…", "I live…", "My …"), deduplicated, in order. */
export function statedFacts(text: string): string[] {
  const sentences = text.match(/[^.!?\n]*\b(?:I'm|I am|I live|I work|I prefer|My)\b[^.!?\n]*[.!?]?/g) ?? [];
  const facts = sentences
    .map((s) =>
      s
        .replace(/^\W*(?:user:?\s*)?/i, '')
        .replace(/^(?:hi|hello)[!,.\s]*/i, '')
        .trim(),
    )
    .filter((s) => s.length > 6);
  return [...new Set(facts)];
}

/** The offline Observer: turns stated facts into lines in OM's documented observation format. */
export function offlineObservations(transcript: string): string {
  const facts = statedFacts(transcript);
  return facts.length ? facts.map((f) => `* 🔴 User stated: ${f.replace(/[.!?]$/, '')}`).join('\n') : '* 🟡 No new facts stated.';
}
