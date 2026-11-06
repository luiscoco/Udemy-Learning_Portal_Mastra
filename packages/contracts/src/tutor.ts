import { z } from 'zod';
import { LabIdSchema } from './catalog.js';
import { RuntimeModeSchema } from './health.js';
import { ApiErrorCodeSchema } from './api-error.js';

export const TUTOR_QUESTION_LIMIT = 2000;
export const TUTOR_ANSWER_LIMIT = 16_000;
export const TutorRequestSchema = z
  .strictObject({
    labId: LabIdSchema,
    question: z.string().trim().min(1).max(TUTOR_QUESTION_LIMIT),
    mode: RuntimeModeSchema.default('offline'),
    modelId: z.string().min(1).max(150).optional(),
  })
  .refine((v) => v.mode !== 'live' || Boolean(v.modelId), { message: 'Select a live model.', path: ['modelId'] });
export type TutorRequest = z.infer<typeof TutorRequestSchema>;

export const TutorSettingsSchema = z.object({
  liveEnabled: z.boolean(),
  models: z.array(z.object({ id: z.string(), provider: z.string(), configured: z.boolean() })),
  questionLimit: z.literal(TUTOR_QUESTION_LIMIT),
  answerLimit: z.literal(TUTOR_ANSWER_LIMIT),
  timeoutMs: z.number().int().positive().max(60_000),
});
export type TutorSettings = z.infer<typeof TutorSettingsSchema>;

const base = { seq: z.number().int().nonnegative(), requestId: z.string().min(1) };
export const TutorEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('started'),
    labId: LabIdSchema,
    mode: RuntimeModeSchema,
    modelId: z.string().nullable(),
    simulated: z.boolean(),
  }),
  z.object({ ...base, type: z.literal('text'), text: z.string().max(TUTOR_ANSWER_LIMIT) }),
  z.object({ ...base, type: z.literal('complete'), text: z.string().trim().min(1).max(TUTOR_ANSWER_LIMIT) }),
  z.object({
    ...base,
    type: z.literal('error'),
    code: ApiErrorCodeSchema,
    message: z.string().max(1000),
    retryable: z.boolean(),
  }),
]);
export type TutorEvent = z.infer<typeof TutorEventSchema>;
