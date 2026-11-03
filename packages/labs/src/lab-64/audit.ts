import { createHash, createHmac } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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
  v: number;
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

/** Entry format version: 2 = HMAC-keyed chain with a head anchor. Unversioned logs are legacy and never trusted. */
export const AUDIT_VERSION = 2;

const locks = new KeyedLock();

export interface Verification {
  valid: boolean;
  entries: number;
  brokenAt?: number;
  reason?: 'edited' | 'truncated' | 'anchor' | 'unreadable' | 'legacy';
}

/**
 * Append-only audit log in one JSONL file, chained with a server-held HMAC key:
 * hash = HMAC(key, prevHash + canonical(entry)). Editing, removing or reordering a line breaks the chain,
 * and without the key nobody can rebuild it. A keyed head anchor (<file>.anchor.json) records the last
 * entry, so removing entries from the end is detected too.
 * Limit: whoever can restore an older, consistent log-and-anchor pair can roll back; production logs need an
 * external, monotonic anchor (WORM storage, a log service).
 */
export class AuditLog {
  readonly anchorFile: string;
  private readonly key: Buffer;
  private readonly now: () => Date;
  private readonly maxEntries: number;

  constructor(
    readonly file: string,
    opts: { key: Buffer; now?: () => Date; maxEntries?: number },
  ) {
    if (opts.key.length < 16) throw new Error('audit key too short');
    this.key = opts.key;
    this.now = opts.now ?? (() => new Date());
    this.maxEntries = opts.maxEntries ?? 5_000;
    this.anchorFile = `${file}.anchor.json`;
  }

  private mac(data: string) {
    return createHmac('sha256', this.key).update(data, 'utf8').digest('hex');
  }
  private hashOf(e: Omit<AuditEntry, 'hash'>) {
    return this.mac(e.prevHash + canonical(e));
  }
  private anchorMac(seq: number, hash: string) {
    return this.mac(`anchor:${seq}:${hash}`);
  }

  read(): AuditEntry[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as AuditEntry);
  }

  verify(): Verification {
    let entries: AuditEntry[];
    try {
      entries = this.read();
    } catch {
      return { valid: false, entries: 0, brokenAt: 1, reason: 'unreadable' };
    }
    let prev = GENESIS;
    for (const [i, e] of entries.entries()) {
      const { hash, ...rest } = e;
      if (e.v !== AUDIT_VERSION) return { valid: false, entries: entries.length, brokenAt: i + 1, reason: 'legacy' };
      if (e.seq !== i + 1 || e.prevHash !== prev || this.hashOf(rest) !== hash)
        return { valid: false, entries: entries.length, brokenAt: i + 1, reason: 'edited' };
      prev = hash;
    }
    const anchor = this.readAnchor();
    if (entries.length === 0 && !anchor) return { valid: true, entries: 0 };
    if (!anchor || anchor.mac !== this.anchorMac(anchor.seq, anchor.hash))
      return { valid: false, entries: entries.length, brokenAt: entries.length + 1, reason: 'anchor' };
    const last = entries.at(-1);
    if (!last || anchor.seq !== last.seq || anchor.hash !== last.hash)
      return {
        valid: false,
        entries: entries.length,
        brokenAt: Math.min(entries.length, anchor.seq) + 1,
        reason: last && anchor.seq < last.seq ? 'anchor' : 'truncated',
      };
    return { valid: true, entries: entries.length };
  }

  private readAnchor(): { seq: number; hash: string; mac: string } | null {
    if (!existsSync(this.anchorFile)) return null;
    try {
      return JSON.parse(readFileSync(this.anchorFile, 'utf8')) as { seq: number; hash: string; mac: string };
    } catch {
      return null;
    }
  }

  /** Appends one entry and moves the anchor, serialized per file so concurrent runs never fork the chain. */
  append(fields: AuditFields): Promise<AuditEntry> {
    return locks.run(this.file, async () => {
      const last = this.read().at(-1);
      const base = {
        ...fields,
        v: AUDIT_VERSION,
        seq: (last?.seq ?? 0) + 1,
        at: this.now().toISOString(),
        prevHash: last?.hash ?? GENESIS,
      };
      const entry: AuditEntry = { ...base, hash: this.hashOf(base) };
      mkdirSync(dirname(this.file), { recursive: true });
      appendFileSync(this.file, `${JSON.stringify(entry)}\n`);
      writeFileSync(
        this.anchorFile,
        JSON.stringify({ seq: entry.seq, hash: entry.hash, mac: this.anchorMac(entry.seq, entry.hash) }),
      );
      return entry;
    });
  }

  /** Starts a new log; the old log and its anchor are kept next to it, never deleted. */
  rotate(): Promise<string | null> {
    return locks.run(this.file, async () => {
      if (!existsSync(this.file) && !existsSync(this.anchorFile)) return null;
      const stamp = this.now().toISOString().replace(/[:.]/g, '-');
      const archived = this.file.replace(/\.jsonl$/, `.${stamp}.jsonl`);
      if (existsSync(this.file)) renameSync(this.file, archived);
      if (existsSync(this.anchorFile)) renameSync(this.anchorFile, `${archived}.anchor.json`);
      return archived;
    });
  }

  /**
   * Before a run: archives a legacy (unkeyed) log, which can never be trusted, and applies retention by
   * rotating a log that exceeded maxEntries. Returns why it rotated, or null.
   */
  async prepare(): Promise<'legacy' | 'retention' | null> {
    const entries = (() => {
      try {
        return this.read();
      } catch {
        return null;
      }
    })();
    if (entries && entries.length > 0 && entries.some((e) => e.v !== AUDIT_VERSION)) {
      await this.rotate();
      return 'legacy';
    }
    if (entries && entries.length >= this.maxEntries) {
      await this.rotate();
      return 'retention';
    }
    return null;
  }
}
