import { describe, expect, it } from 'vitest';
import { emptyProgress } from './progress.js';
import { normalizeProgress, ProgressImportRequestSchema, ProgressWriteRequestSchema } from './progress-api.js';

describe('progress synchronization contracts', () => {
  it('derives status, quiz pass and timestamp without trusting client claims', () => {
    const record = {
      ...emptyProgress('lab-00'),
      status: 'completed' as const,
      lessonRead: true,
      runSucceeded: true,
      checksPassed: true,
      quiz: { score: 1, total: 4, passed: true, attempts: 1, answers: {} },
    };
    expect(normalizeProgress(record, new Date(0))).toMatchObject({
      status: 'in-progress',
      quiz: { passed: false },
      updatedAt: new Date(0).toISOString(),
    });
    expect(normalizeProgress({ ...record, quiz: { ...record.quiz, score: 3, passed: false } }).status).toBe('completed');
  });
  it('bounds migration batches, maps and malformed revision/identity claims', () => {
    const record = emptyProgress('lab-00');
    expect(ProgressWriteRequestSchema.safeParse({ record, baseRevision: -1 }).success).toBe(false);
    expect(ProgressWriteRequestSchema.safeParse({ record, baseRevision: 0, owner: 'someone-else' }).success).toBe(false);
    expect(
      ProgressWriteRequestSchema.safeParse({
        record: { ...record, selfCheck: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`x${i}`, true])) },
        baseRevision: 0,
      }).success,
    ).toBe(false);
    expect(ProgressImportRequestSchema.safeParse({ records: Array(11).fill(record) }).success).toBe(false);
    expect(ProgressImportRequestSchema.safeParse({ records: [record, record] }).success).toBe(false);
  });
});
