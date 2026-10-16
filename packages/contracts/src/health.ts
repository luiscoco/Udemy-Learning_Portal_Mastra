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
