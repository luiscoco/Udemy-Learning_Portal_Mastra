import { ProgressRecordSchema, type ProgressRecord } from '@mlp/contracts';
import { z } from 'zod';

/** Storage adapter for learner progress. Swap implementations (local, remote) without touching UI. */
export interface ProgressStore {
  getAll(): Readonly<Record<string, ProgressRecord>>;
  get(labId: string): ProgressRecord | undefined;
  save(record: ProgressRecord): void;
  clear(labId?: string): void;
  subscribe(listener: () => void): () => void;
}

abstract class BaseStore implements ProgressStore {
  private listeners = new Set<() => void>();
  protected abstract read(): Record<string, ProgressRecord>;
  protected abstract write(all: Record<string, ProgressRecord>): void;

  getAll() {
    return this.read();
  }
  get(labId: string) {
    return this.read()[labId];
  }
  save(record: ProgressRecord) {
    const parsed = ProgressRecordSchema.parse(record);
    this.write({ ...this.read(), [parsed.labId]: parsed });
    this.emit();
  }
  clear(labId?: string) {
    if (labId) {
      const { [labId]: _removed, ...rest } = this.read();
      this.write(rest);
    } else {
      this.write({});
    }
    this.emit();
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  protected emit() {
    for (const l of this.listeners) l();
  }
}

export class MemoryProgressStore extends BaseStore {
  private data: Record<string, ProgressRecord>;
  constructor(initial: Record<string, ProgressRecord> = {}) {
    super();
    this.data = initial;
  }
  protected read() {
    return this.data;
  }
  protected write(all: Record<string, ProgressRecord>) {
    this.data = all;
  }
}

const StoredSchema = z.object({ version: z.literal(1), records: z.record(z.string(), z.unknown()) });

/** Persists progress in localStorage. Invalid or corrupt entries are ignored, never trusted. */
export class LocalStorageProgressStore extends BaseStore {
  private cache: Record<string, ProgressRecord> | null = null;

  constructor(
    private readonly storage: Storage = window.localStorage,
    private readonly key = 'mlp.progress.v1',
  ) {
    super();
    window.addEventListener('storage', (e) => {
      if (e.key === this.key) {
        this.cache = null;
        this.emit();
      }
    });
  }

  protected read() {
    if (this.cache) return this.cache;
    const out: Record<string, ProgressRecord> = {};
    try {
      const raw = this.storage.getItem(this.key);
      const parsed = raw ? StoredSchema.safeParse(JSON.parse(raw)) : null;
      if (parsed?.success) {
        for (const [id, value] of Object.entries(parsed.data.records)) {
          const rec = ProgressRecordSchema.safeParse(value);
          if (rec.success && rec.data.labId === id) out[id] = rec.data;
        }
      }
    } catch {
      // Corrupt JSON: start fresh rather than crash.
    }
    this.cache = out;
    return out;
  }

  protected write(all: Record<string, ProgressRecord>) {
    this.cache = all;
    try {
      this.storage.setItem(this.key, JSON.stringify({ version: 1, records: all }));
    } catch {
      // Storage full or disabled: keep in-memory state for this session.
    }
  }
}
