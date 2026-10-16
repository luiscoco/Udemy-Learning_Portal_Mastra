import { z } from 'zod';
import { LabIdSchema } from './catalog.js';

export const ProgressStatusSchema = z.enum(['not-started', 'in-progress', 'completed']);
export type ProgressStatus = z.infer<typeof ProgressStatusSchema>;

export const QuizAttemptSchema = z.object({
  score: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  passed: z.boolean(),
  attempts: z.number().int().positive(),
  answers: z.record(z.string(), z.number().int().nonnegative()).default({}),
});
export type QuizAttempt = z.infer<typeof QuizAttemptSchema>;

export const ProgressRecordSchema = z.object({
  labId: LabIdSchema,
  status: ProgressStatusSchema,
  lessonRead: z.boolean(),
  runSucceeded: z.boolean(),
  checksPassed: z.boolean(),
  quiz: QuizAttemptSchema.nullable(),
  selfCheck: z.record(z.string(), z.boolean()).default({}),
  notes: z.string().max(10_000),
  updatedAt: z.iso.datetime(),
});
export type ProgressRecord = z.infer<typeof ProgressRecordSchema>;

/** A lab counts as completed when lesson read, a run succeeded with passing checks and the quiz passed. */
export function deriveProgressStatus(r: Omit<ProgressRecord, 'status' | 'updatedAt'>): ProgressStatus {
  if (r.lessonRead && r.runSucceeded && r.checksPassed && r.quiz?.passed) return 'completed';
  if (r.lessonRead || r.runSucceeded || r.quiz || r.notes.length > 0 || Object.keys(r.selfCheck).length > 0) {
    return 'in-progress';
  }
  return 'not-started';
}

export function emptyProgress(labId: string, now = new Date()): ProgressRecord {
  return {
    labId,
    status: 'not-started',
    lessonRead: false,
    runSucceeded: false,
    checksPassed: false,
    quiz: null,
    selfCheck: {},
    notes: '',
    updatedAt: now.toISOString(),
  };
}
