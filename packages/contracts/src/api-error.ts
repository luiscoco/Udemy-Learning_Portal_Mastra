import { z } from 'zod';

export const ApiErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'TOO_MANY_REQUESTS',
  'TIMEOUT',
  'CANCELLED',
  'PROVIDER_ERROR',
  'NOT_CONFIGURED',
  'INTERNAL',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    retryable: z.boolean().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
