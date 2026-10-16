import { z } from 'zod';
import { ApiErrorCodeSchema } from './api-error.js';
import { LabIdSchema } from './catalog.js';
import { RuntimeModeSchema } from './health.js';
import { InputValuesSchema } from './lab.js';

// ---------- Requests ----------

export const ExecutionRequestSchema = z.object({
  input: InputValuesSchema,
  mode: RuntimeModeSchema.default('offline'),
  timeoutMs: z.number().int().min(100).max(300_000).optional(),
});
export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

export const StartRunResponseSchema = z.object({
  runId: z.string(),
  correlationId: z.string(),
  requestId: z.string(),
});
export type StartRunResponse = z.infer<typeof StartRunResponseSchema>;

// ---------- Validation ----------

export const CheckResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  message: z.string().optional(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const ValidationResultSchema = z.object({
  passed: z.boolean(),
  checks: z.array(CheckResultSchema),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export function summarizeChecks(checks: CheckResult[]): ValidationResult {
  return { passed: checks.length > 0 && checks.every((c) => c.passed), checks };
}

// ---------- Events ----------

export const AnnotationsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

const eventBase = {
  runId: z.string(),
  correlationId: z.string(),
  seq: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(),
  annotations: AnnotationsSchema.optional(),
};

export const RunTerminalStatusSchema = z.enum(['succeeded', 'failed', 'cancelled', 'timeout']);
export type RunTerminalStatus = z.infer<typeof RunTerminalStatusSchema>;

export const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});

export const ExecutionEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...eventBase,
    type: z.literal('log'),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    message: z.string(),
    data: z.unknown().optional(),
  }),
  z.object({ ...eventBase, type: z.literal('token'), text: z.string() }),
  z.object({
    ...eventBase,
    type: z.literal('tool-start'),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.unknown(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('tool-finish'),
    toolCallId: z.string(),
    toolName: z.string(),
    status: z.enum(['success', 'error', 'denied']),
    result: z.unknown().optional(),
    error: z.string().optional(),
    durationMs: z.number().nonnegative(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('workflow-step'),
    workflowId: z.string().optional(),
    stepId: z.string(),
    status: z.enum(['running', 'success', 'failed', 'suspended', 'skipped', 'waiting']),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    durationMs: z.number().nonnegative().optional(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('result'),
    output: z.unknown(),
    validation: ValidationResultSchema.optional(),
    usage: UsageSchema.optional(),
    /** Effective options actually used (model id, limits…), never secrets. */
    effective: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('error'),
    code: ApiErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean().optional(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('complete'),
    status: RunTerminalStatusSchema,
    durationMs: z.number().nonnegative(),
  }),
]);
export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>;
export type ExecutionEventType = ExecutionEvent['type'];
export const EXECUTION_EVENT_TYPES = [
  'log',
  'token',
  'tool-start',
  'tool-finish',
  'workflow-step',
  'result',
  'error',
  'complete',
] as const satisfies readonly ExecutionEventType[];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** Event as emitted by lab code; the engine stamps runId, correlationId, seq and timestamp. */
export type ExecutionEventPayload = DistributiveOmit<ExecutionEvent, 'runId' | 'correlationId' | 'seq' | 'timestamp'>;

// ---------- Run snapshot & preflight ----------

export const RunStatusSchema = z.enum(['running', 'succeeded', 'failed', 'cancelled', 'timeout']);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunSnapshotSchema = z.object({
  runId: z.string(),
  labId: LabIdSchema,
  correlationId: z.string(),
  status: RunStatusSchema,
  mode: RuntimeModeSchema,
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().optional(),
  deadlineMs: z.number().int().positive(),
  eventCount: z.number().int().nonnegative(),
});
export type RunSnapshot = z.infer<typeof RunSnapshotSchema>;

export const PreflightResultSchema = z.object({
  labId: LabIdSchema,
  ready: z.boolean(),
  checks: z.array(CheckResultSchema),
});
export type PreflightResult = z.infer<typeof PreflightResultSchema>;
