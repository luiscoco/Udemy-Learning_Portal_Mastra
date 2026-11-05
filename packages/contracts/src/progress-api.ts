import { z } from 'zod';
import { LabIdSchema } from './catalog.js';
import { deriveProgressStatus, ProgressRecordSchema, type ProgressRecord } from './progress.js';

export const PROGRESS_IMPORT_BATCH = 10;
export const PROGRESS_IMPORT_BYTES = 2 * 1024 * 1024;
export const PROGRESS_WRITE_BYTES = 256 * 1024;
export const PROGRESS_SUBJECT_HEADER = 'x-progress-subject';
export const ProgressSubjectSchema = z.string().min(1).max(512);
export const ProgressRevisionSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);

/** Bound user-created maps without changing the established lesson record contract. */
export const ProgressWriteRecordSchema = ProgressRecordSchema.superRefine((record, ctx) => {
  for (const [name, entries, limit] of [
    ['selfCheck', Object.keys(record.selfCheck), 100],
    ['quiz.answers', Object.keys(record.quiz?.answers ?? {}), 50],
  ] as const) {
    if (entries.length > limit || entries.some((key) => key.length > 64))
      ctx.addIssue({ code: 'custom', path: [name], message: `At most ${limit} keys of at most 64 characters are allowed.` });
  }
  if (record.quiz && (record.quiz.score > record.quiz.total || record.quiz.total > 100))
    ctx.addIssue({ code: 'custom', path: ['quiz'], message: 'Quiz score must not exceed its total (maximum 100).' });
});

/** Progress remains self-reported; it is never an authorization or certification credential. */
export function normalizeProgress(record: ProgressRecord, now = new Date()): ProgressRecord {
  const parsed = ProgressWriteRecordSchema.parse(record);
  const quiz = parsed.quiz ? { ...parsed.quiz, passed: parsed.quiz.score / parsed.quiz.total >= 0.7 } : null;
  const normalized = { ...parsed, quiz };
  return { ...normalized, status: deriveProgressStatus(normalized), updatedAt: now.toISOString() };
}

export const ProgressEntrySchema = z
  .object({
    labId: LabIdSchema,
    revision: ProgressRevisionSchema.refine((v) => v > 0, 'A stored revision is positive.'),
    record: ProgressRecordSchema.nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .refine((entry) => !entry.record || entry.record.labId === entry.labId, 'Record and entry lab ids must match.');
export type ProgressEntry = z.infer<typeof ProgressEntrySchema>;
export const ProgressSnapshotSchema = z
  .object({
    entries: z
      .array(ProgressEntrySchema)
      .max(76)
      .refine((entries) => new Set(entries.map((e) => e.labId)).size === entries.length, 'Duplicate lab ids.'),
  })
  .strict();
export type ProgressSnapshot = z.infer<typeof ProgressSnapshotSchema>;
export const ProgressWriteRequestSchema = z
  .object({ baseRevision: ProgressRevisionSchema, record: ProgressWriteRecordSchema })
  .strict();
export type ProgressWriteRequest = z.input<typeof ProgressWriteRequestSchema>;
export const ProgressResetRequestSchema = z.object({ baseRevision: ProgressRevisionSchema }).strict();
export type ProgressResetRequest = z.infer<typeof ProgressResetRequestSchema>;
export const ProgressImportRequestSchema = z
  .object({
    records: z
      .array(ProgressWriteRecordSchema)
      .min(1)
      .max(PROGRESS_IMPORT_BATCH)
      .refine((records) => new Set(records.map((r) => r.labId)).size === records.length, 'Duplicate lab ids.'),
  })
  .strict();
export type ProgressImportRequest = z.input<typeof ProgressImportRequestSchema>;
