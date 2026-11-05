import { z } from 'zod';
import { ApiClientError, type ApiClient } from '@mlp/client';
import {
  PROGRESS_IMPORT_BATCH,
  ProgressEntrySchema,
  ProgressRevisionSchema,
  ProgressSubjectSchema,
  ProgressWriteRecordSchema,
  type ProgressEntry,
  type ProgressRecord,
  type ProgressSnapshot,
} from '@mlp/contracts';
import { getLab } from '@mlp/lab-catalog';
import { LocalStorageProgressStore, type ProgressStore, type ProgressSyncState } from './progress-store';
import { GUEST_SCOPE, storageScopeOf } from './storage-scope';

const PendingSchema = z.object({
  sequence: z.number().int().positive(),
  baseRevision: ProgressRevisionSchema,
  record: ProgressWriteRecordSchema.nullable(),
});
type Pending = z.infer<typeof PendingSchema>;
const CacheSchema = z.object({
  version: z.literal(2),
  subject: ProgressSubjectSchema,
  entries: z.array(ProgressEntrySchema).max(76),
  pending: z.record(z.string(), PendingSchema).refine((p) => Object.keys(p).length <= 76),
});
/** Collision-free account namespace. The subject is metadata, not a credential. */
export const syncedProgressKey = (subject: string) => `mlp.progress.v2:${encodeURIComponent(subject)}`;
type Session = { subject: string; generation: number; signal: AbortSignal };

/** The UI stays synchronous; an account-bound outbox performs validated SDK requests in the background. */
export class SyncedProgressStore implements ProgressStore {
  private readonly legacy: LocalStorageProgressStore;
  private subject: string | null = null;
  private generation = 0;
  private abort = new AbortController();
  private entries: Record<string, ProgressEntry> = {};
  private pending: Record<string, Pending> = {};
  private legacyRecords: Record<string, ProgressRecord> = {};
  private data: Record<string, ProgressRecord> = {};
  private conflicts = new Set<string>();
  private listeners = new Set<() => void>();
  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flight: { generation: number; promise: Promise<void> } | null = null;
  private localDurable = true;
  private syncState: ProgressSyncState = {
    phase: 'guest',
    pending: 0,
    conflicts: [],
    message: null,
    localDurable: true,
    hasBackup: false,
  };
  private readonly resume = () => {
    void this.retrySync();
  };

  constructor(
    private readonly api: ApiClient['progress'],
    private readonly storage: Storage = window.localStorage,
    private readonly debounceMs = 300,
  ) {
    this.legacy = new LocalStorageProgressStore(storage);
    this.data = { ...this.legacy.getAll() };
    window.addEventListener('online', this.resume);
    window.addEventListener('focus', this.resume);
  }
  getAll = () => this.data;
  get = (labId: string) => this.data[labId];
  getSyncState = () => this.syncState;
  getIdentity = () => this.subject;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  exportBackup = () => ({ version: 1, records: this.legacyRecords });

  private publish(phase: ProgressSyncState['phase'], message: string | null = null) {
    this.syncState = {
      phase,
      message,
      pending: Object.keys(this.pending).length,
      conflicts: [...this.conflicts].sort(),
      localDurable: this.localDurable,
      hasBackup: Object.keys(this.legacyRecords).length > 0,
    };
    this.listeners.forEach((listener) => listener());
  }
  private rebuild() {
    const records: Record<string, ProgressRecord> = {};
    for (const record of Object.values(this.legacyRecords))
      if (!this.entries[record.labId] && getLab(record.labId)?.status === 'available') records[record.labId] = record;
    for (const entry of Object.values(this.entries)) if (entry.record) records[entry.labId] = entry.record;
    for (const [id, mutation] of Object.entries(this.pending)) {
      if (mutation.record) records[id] = mutation.record;
      else delete records[id];
    }
    this.data = records;
  }
  private persist() {
    if (!this.subject) return;
    try {
      this.storage.setItem(
        syncedProgressKey(this.subject),
        JSON.stringify({ version: 2, subject: this.subject, entries: Object.values(this.entries), pending: this.pending }),
      );
      this.localDurable = true;
    } catch {
      this.localDurable = false;
    }
  }
  private current(session: Session) {
    return session.generation === this.generation && session.subject === this.subject && !session.signal.aborted;
  }
  private accept(snapshot: ProgressSnapshot) {
    this.entries = Object.fromEntries(
      snapshot.entries.filter((e) => getLab(e.labId)?.status === 'available').map((e) => [e.labId, e]),
    );
    this.rebuild();
    this.persist();
  }

  setIdentity(subject: string | null) {
    if (subject === this.subject) return;
    this.generation += 1;
    this.abort.abort();
    this.abort = new AbortController();
    clearTimeout(this.timer);
    this.subject = subject;
    this.entries = {};
    this.pending = {};
    this.conflicts.clear();
    this.localDurable = true;
    this.legacy.setScope(subject ? storageScopeOf({ sub: subject }) : GUEST_SCOPE);
    this.legacyRecords = { ...this.legacy.getAll() };
    this.data = { ...this.legacyRecords };
    if (!subject) {
      this.publish('guest');
      return;
    }
    try {
      const raw = this.storage.getItem(syncedProgressKey(subject));
      const parsed = raw ? CacheSchema.safeParse(JSON.parse(raw)) : null;
      if (parsed?.success && parsed.data.subject === subject) {
        this.entries = Object.fromEntries(
          parsed.data.entries.filter((e) => getLab(e.labId)?.status === 'available').map((e) => [e.labId, e]),
        );
        this.pending = Object.fromEntries(
          Object.entries(parsed.data.pending).filter(
            ([id, m]) => getLab(id)?.status === 'available' && (!m.record || m.record.labId === id),
          ),
        );
        this.sequence = Math.max(this.sequence, ...Object.values(this.pending).map((m) => m.sequence));
        this.rebuild();
      }
    } catch {
      /* An invalid cache cannot select an account or authorize a write. Legacy data stays intact. */
    }
    this.publish('syncing');
    void this.retrySync();
  }

  save(record: ProgressRecord) {
    const parsed = ProgressWriteRecordSchema.parse(record);
    if (getLab(parsed.labId)?.status !== 'available') throw new Error('Cannot save progress for an unavailable lab.');
    if (!this.subject) {
      this.legacy.save(parsed);
      this.localDurable = this.legacy.isDurable();
      this.data = { ...this.legacy.getAll() };
      this.publish('guest');
      return;
    }
    this.enqueue(parsed.labId, parsed);
  }
  clear(labId?: string) {
    if (!this.subject) {
      this.legacy.clear(labId);
      this.localDurable = this.legacy.isDurable();
      this.data = { ...this.legacy.getAll() };
      this.publish('guest');
      return;
    }
    for (const id of labId ? [labId] : Object.keys(this.data)) this.enqueue(id, null);
  }
  private enqueue(labId: string, record: ProgressRecord | null) {
    if (getLab(labId)?.status !== 'available') throw new Error('Cannot reset an unavailable lab.');
    this.pending[labId] = {
      record,
      sequence: ++this.sequence,
      baseRevision: this.pending[labId]?.baseRevision ?? this.entries[labId]?.revision ?? 0,
    };
    this.rebuild();
    this.persist();
    this.publish(this.conflicts.size ? 'conflict' : 'syncing');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.retrySync();
    }, this.debounceMs);
  }

  retrySync(): Promise<void> {
    if (!this.subject) return Promise.resolve();
    if (this.flight?.generation === this.generation) return this.flight.promise;
    clearTimeout(this.timer);
    const session: Session = { subject: this.subject, generation: this.generation, signal: this.abort.signal };
    this.publish('syncing');
    const promise = this.synchronize(session)
      .catch((error: unknown) => {
        if (!this.current(session)) return;
        const accountError = error instanceof ApiClientError && [401, 404].includes(error.status);
        this.publish(
          'offline',
          accountError
            ? 'Sign in again to save progress to this account.'
            : 'Progress could not reach your account. Your edits remain on this device.',
        );
      })
      .finally(() => {
        if (this.flight?.generation === session.generation) this.flight = null;
      });
    this.flight = { generation: session.generation, promise };
    return promise;
  }

  private async synchronize(session: Session) {
    const initial = await this.api.get(session.subject, session.signal);
    if (!this.current(session)) return;
    this.accept(initial);
    const legacy = Object.values(this.legacyRecords).filter(
      (r) =>
        !this.entries[r.labId] &&
        !this.pending[r.labId] &&
        getLab(r.labId)?.status === 'available' &&
        ProgressWriteRecordSchema.safeParse(r).success,
    );
    for (let i = 0; i < legacy.length; i += PROGRESS_IMPORT_BATCH) {
      if (!this.current(session)) return;
      const imported = await this.api.import(
        session.subject,
        { records: legacy.slice(i, i + PROGRESS_IMPORT_BATCH) },
        session.signal,
      );
      if (!this.current(session)) return;
      this.accept(imported);
    }
    while (this.current(session)) {
      const next = Object.entries(this.pending).find(([id]) => !this.conflicts.has(id));
      if (!next) break;
      const [id, sent] = next;
      try {
        const saved = sent.record
          ? await this.api.save(session.subject, id, { baseRevision: sent.baseRevision, record: sent.record }, session.signal)
          : await this.api.reset(session.subject, id, { baseRevision: sent.baseRevision }, session.signal);
        if (!this.current(session)) return;
        this.entries[id] = saved;
        if (this.pending[id]?.sequence === sent.sequence) delete this.pending[id];
        else if (this.pending[id]) this.pending[id] = { ...this.pending[id], baseRevision: saved.revision };
        this.rebuild();
        this.persist();
      } catch (error) {
        if (!this.current(session)) return;
        if (!(error instanceof ApiClientError) || error.status !== 409) throw error;
        this.conflicts.add(id);
        const latest = await this.api.get(session.subject, session.signal);
        if (!this.current(session)) return;
        this.accept(latest);
      }
    }
    if (this.current(session)) {
      const invalidLegacy = Object.values(this.legacyRecords).some(
        (r) => !this.entries[r.labId] && !ProgressWriteRecordSchema.safeParse(r).success,
      );
      this.publish(
        this.conflicts.size ? 'conflict' : invalidLegacy ? 'offline' : 'saved',
        invalidLegacy ? 'Some older device progress could not be imported. Download the device backup before changing it.' : null,
      );
    }
  }

  async resolveConflict(labId: string, choice: 'server' | 'device'): Promise<void> {
    if (!this.subject || !this.conflicts.has(labId)) return;
    const session: Session = { subject: this.subject, generation: this.generation, signal: this.abort.signal };
    try {
      const latest = await this.api.get(session.subject, session.signal);
      if (!this.current(session)) return;
      this.accept(latest);
      if (choice === 'server') delete this.pending[labId];
      else if (this.pending[labId])
        this.pending[labId] = { ...this.pending[labId], baseRevision: this.entries[labId]?.revision ?? 0 };
      this.conflicts.delete(labId);
      this.rebuild();
      this.persist();
      await this.retrySync();
    } catch {
      if (this.current(session)) this.publish('offline', 'Reconnect before choosing which version to keep.');
    }
  }

  dispose() {
    this.abort.abort();
    clearTimeout(this.timer);
    this.generation += 1;
    window.removeEventListener('online', this.resume);
    window.removeEventListener('focus', this.resume);
  }
}
