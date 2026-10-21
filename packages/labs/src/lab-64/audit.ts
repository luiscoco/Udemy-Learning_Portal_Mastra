import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { KeyedLock } from '../shared/keyed-lock.js';

export type Stage = 'policy' | 'approval' | 'execution';
export interface AuditFields {
  runId: string;
  actor: string;
  role: string;
  toolName: string;
  toolCallId: string;
  /** sha256 of the canonical arguments: binds approvals and executions to the exact call. */
  argsHash: string;
  /** Arguments with personal data masked. */
  args: unknown;
  stage: Stage;
  decision: string;
  ruleId?: string;
  reason: string;
}
export interface AuditEntry extends AuditFields {
  seq: number;
  at: string;
  prevHash: string;
  hash: string;
}

const GENESIS = '0'.repeat(64);
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Canonical JSON (sorted keys), so the same arguments always hash the same. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(value ?? null);
}
export const argsHashOf = (args: unknown) => sha256(canonical(args));

/** Masks e-mail local parts ("n***@customer.example"): the audit records decisions, not personal data. */
export function mask(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/([\w.+-])[\w.+-]*@/g, '$1***@');
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mask(v)]));
  return value;
}

const hashOf = (e: Omit<AuditEntry, 'hash'>) => sha256(e.prevHash + canonical(e));

const locks = new KeyedLock();

/**
 * Append-only, hash-chained audit log in one JSONL file. Changing, removing or reordering any line breaks
 * the chain from that line on. This is tamper-evident, not tamper-proof: whoever can rewrite the whole
 * file can rebuild the chain, so production logs also need an external anchor (WORM storage, a log service).
 */
export class AuditLog {
  constructor(
    readonly file: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  read(): AuditEntry[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as AuditEntry);
  }

  verify(): { valid: boolean; entries: number; brokenAt?: number } {
    let prev = GENESIS;
    let entries: AuditEntry[];
    try {
      entries = this.read();
    } catch {
      return { valid: false, entries: 0, brokenAt: 1 };
    }
    for (const [i, e] of entries.entries()) {
      const { hash, ...rest } = e;
      if (e.seq !== i + 1 || e.prevHash !== prev || hashOf(rest) !== hash)
        return { valid: false, entries: entries.length, brokenAt: i + 1 };
      prev = hash;
    }
    return { valid: true, entries: entries.length };
  }

  /** Appends one entry, serialized per file so concurrent runs of the same learner never fork the chain. */
  append(fields: AuditFields): Promise<AuditEntry> {
    return locks.run(this.file, async () => {
      const last = this.read().at(-1);
      const base = { ...fields, seq: (last?.seq ?? 0) + 1, at: this.now().toISOString(), prevHash: last?.hash ?? GENESIS };
      const entry: AuditEntry = { ...base, hash: hashOf(base) };
      mkdirSync(dirname(this.file), { recursive: true });
      appendFileSync(this.file, `${JSON.stringify(entry)}\n`);
      return entry;
    });
  }

  /** Starts a new log; the old one is kept next to it, never deleted. */
  rotate(): Promise<string | null> {
    return locks.run(this.file, async () => {
      if (!existsSync(this.file)) return null;
      const archived = this.file.replace(/\.jsonl$/, `.${this.now().toISOString().replace(/[:.]/g, '-')}.jsonl`);
      renameSync(this.file, archived);
      return archived;
    });
  }
}
