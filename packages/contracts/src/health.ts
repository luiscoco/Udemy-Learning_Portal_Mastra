import { z } from 'zod';

export const RuntimeModeSchema = z.enum(['offline', 'live']);
export type RuntimeMode = z.infer<typeof RuntimeModeSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  mode: RuntimeModeSchema,
  mastraVersion: z.string(),
  timestamp: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** One dependency check of GET /api/ready (L72). Messages never contain paths, values or secrets. */
export const ReadinessCheckSchema = z.object({
  name: z.enum(['config', 'data-dir', 'storage', 'web-bundle', 'providers', 'runner']),
  status: z.enum(['ok', 'fail', 'skip']),
  message: z.string().max(300),
  durationMs: z.number().nonnegative(),
});
export type ReadinessCheck = z.infer<typeof ReadinessCheckSchema>;

/** GET /api/ready: 200 when every check is ok or skipped, 503 otherwise (liveness stays at /api/health). */
export const ReadinessResponseSchema = z.object({
  status: z.enum(['ready', 'not-ready']),
  checks: z.array(ReadinessCheckSchema).max(20),
  timestamp: z.iso.datetime(),
});
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;
