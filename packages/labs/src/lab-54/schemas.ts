import { z } from 'zod';

export const SERVICES = ['checkout', 'search', 'auth', 'payments'] as const;
export const IncidentSchema = z.object({
  service: z.enum(SERVICES),
  severity: z.enum(['sev1', 'sev2', 'sev3']),
  symptoms: z.array(z.string().min(3).max(200)).min(1).max(5),
  customerImpact: z.boolean(),
});
export type Incident = z.infer<typeof IncidentSchema>;

export const LogLineSchema = z.object({
  id: z.string().regex(/^L\d+$/),
  at: z.string(),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string(),
});
export type LogLine = z.infer<typeof LogLineSchema>;

export const DiagnosisSchema = z.object({
  likelyCause: z.string().min(5).max(300),
  confidence: z.enum(['low', 'medium', 'high']),
  evidence: z
    .array(z.string().regex(/^L\d+$/))
    .min(1)
    .max(4),
});
export type Diagnosis = z.infer<typeof DiagnosisSchema>;

export const UpdateSchema = z.string().trim().min(20).max(600);

const ErrorSchema = z.object({ code: z.string(), message: z.string() });
/** What an agent step returns: a value, or a contained failure. Never an exception past the boundary. */
export const resultOf = <T extends z.ZodType>(value: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value, attempts: z.number().int() }),
    z.object({ ok: z.literal(false), error: ErrorSchema, attempts: z.number().int() }),
  ]);
export type Result<T> =
  { ok: true; value: T; attempts: number } | { ok: false; error: { code: string; message: string }; attempts: number };

export const PipelineSchema = z.object({
  report: z.string(),
  incident: resultOf(IncidentSchema),
  logs: z.array(LogLineSchema).nullable(),
  diagnosis: resultOf(DiagnosisSchema).nullable(),
  update: resultOf(UpdateSchema).nullable(),
});
export type Pipeline = z.infer<typeof PipelineSchema>;

export const OutcomeSchema = z.object({
  status: z.enum(['complete', 'degraded', 'failed-safe']),
  incident: IncidentSchema.nullable(),
  diagnosis: DiagnosisSchema.nullable(),
  update: z.string().nullable(),
  failures: z.array(z.object({ stepId: z.string(), code: z.string() })),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

/** Fixture logs per service (what the deterministic fetch-logs step reads). */
export const LOGS: Record<(typeof SERVICES)[number], LogLine[]> = {
  checkout: [
    { id: 'L1', at: '12:00:58', level: 'info', message: 'checkout-api deploy 2026.10.19-1 finished' },
    { id: 'L2', at: '12:01:04', level: 'error', message: 'payment gateway timeout after 30s (order submit)' },
    { id: 'L3', at: '12:01:30', level: 'warn', message: 'retry storm: 4x normal request rate to payment gateway' },
    { id: 'L4', at: '12:02:10', level: 'error', message: 'db connection pool exhausted (checkout-api)' },
  ],
  search: [
    { id: 'L1', at: '09:14:02', level: 'warn', message: 'search index replica lag 45s' },
    { id: 'L2', at: '09:15:40', level: 'error', message: 'query timeout on shard 3' },
  ],
  auth: [
    { id: 'L1', at: '07:30:11', level: 'error', message: 'token signing key not found after rotation' },
    { id: 'L2', at: '07:30:12', level: 'warn', message: 'login failure rate 38%' },
  ],
  payments: [
    { id: 'L1', at: '16:45:00', level: 'error', message: 'card processor returned 502 for 12% of requests' },
    { id: 'L2', at: '16:46:20', level: 'info', message: 'fallback processor enabled' },
  ],
};

/** The update must mention the service and must not leak internal log ids. */
export function updateIssues(update: string, service: string): string[] {
  const issues: string[] = [];
  if (!update.toLowerCase().includes(service)) issues.push(`does not mention ${service}`);
  if (/\bL\d+\b/.test(update)) issues.push('contains internal log ids');
  return issues;
}
