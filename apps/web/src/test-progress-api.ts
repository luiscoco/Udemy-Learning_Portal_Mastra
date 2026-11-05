import { vi } from 'vitest';
import { ApiClientError, type ApiClient } from '@mlp/client';
import {
  normalizeProgress,
  ProgressWriteRecordSchema,
  type ProgressEntry,
  type ProgressRecord,
  type ProgressWriteRequest,
  type ProgressResetRequest,
  type ProgressImportRequest,
} from '@mlp/contracts';

export function fakeProgressApi() {
  const accounts = new Map<string, Map<string, ProgressEntry>>();
  const account = (subject: string) => {
    let entries = accounts.get(subject);
    if (!entries) accounts.set(subject, (entries = new Map()));
    return entries;
  };
  const write = (subject: string, id: string, revision: number, record: ProgressRecord | null) => {
    const db = account(subject);
    if ((db.get(id)?.revision ?? 0) !== revision) throw new ApiClientError('CONFLICT', 'Progress changed.', 409);
    const entry: ProgressEntry = {
      labId: id,
      revision: revision + 1,
      record: record ? normalizeProgress(record) : null,
      updatedAt: new Date().toISOString(),
    };
    db.set(id, entry);
    return structuredClone(entry);
  };
  const api = {
    get: vi.fn(async (subject: string) => ({ entries: structuredClone([...account(subject).values()]) })),
    save: vi.fn(async (subject: string, id: string, body: ProgressWriteRequest) =>
      write(subject, id, body.baseRevision, ProgressWriteRecordSchema.parse(body.record)),
    ),
    reset: vi.fn(async (subject: string, id: string, body: ProgressResetRequest) => write(subject, id, body.baseRevision, null)),
    import: vi.fn(async (subject: string, body: ProgressImportRequest) => {
      for (const record of body.records)
        if (!account(subject).has(record.labId)) write(subject, record.labId, 0, ProgressWriteRecordSchema.parse(record));
      return { entries: structuredClone([...account(subject).values()]) };
    }),
  } satisfies ApiClient['progress'];
  return { api, account };
}
