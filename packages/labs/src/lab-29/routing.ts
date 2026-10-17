import { z } from 'zod';
import type { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';

export const TicketSchema = z.object({
  ticketId: z.string().regex(/^T-\d{1,6}$/),
  text: z.string().trim().min(1).max(1_000),
  /** Optional pre-assessed severity (skips the model). 0 = cannot assess. */
  severity: z.number().int().min(0).max(4).optional(),
});
export const AssessmentSchema = z.object({
  ticketId: z.string(),
  severity: z.number().int().min(0).max(4),
  reason: z.string(),
  source: z.enum(['assessed', 'pre-assessed']),
});
export const RouteRecordSchema = z.object({
  route: z.string(),
  queue: z.string(),
  slaMinutes: z.number().int(),
  actions: z.array(z.string()),
});
export const RoutingResultSchema = z.object({
  ticketId: z.string(),
  outcome: z.enum(['routed', 'UNROUTED', 'AMBIGUOUS_ROUTE']),
  route: z.string().nullable(),
  routesRun: z.array(z.string()),
  record: RouteRecordSchema.nullable(),
});
export type Assessment = z.infer<typeof AssessmentSchema>;
export type RouteRecord = z.infer<typeof RouteRecordSchema>;
export type RoutingResult = z.infer<typeof RoutingResultSchema>;

export interface Route {
  id: string;
  min: number;
  max: number;
  record: Omit<RouteRecord, 'route'>;
}

/** The route table: explicit, non-overlapping severity ranges. */
export const ROUTES: Route[] = [
  { id: 'page-oncall', min: 4, max: 4, record: { queue: 'on-call', slaMinutes: 15, actions: ['page the on-call engineer', 'open an incident'] } },
  { id: 'priority-queue', min: 3, max: 3, record: { queue: 'priority', slaMinutes: 120, actions: ['assign to tier 2'] } },
  { id: 'standard-queue', min: 1, max: 2, record: { queue: 'standard', slaMinutes: 1440, actions: ['add to the standard backlog'] } },
];
export const MANUAL_REVIEW: Route = {
  id: 'manual-review',
  min: Number.NaN,
  max: Number.NaN,
  record: { queue: 'triage-desk', slaMinutes: 240, actions: ['ask a human to assess the ticket'] },
};

export type PredicateStyle = 'exclusive' | 'overlapping';

/** Exclusive: min ≤ s ≤ max. Overlapping (anti-pattern): s ≥ min, so higher severities match several routes. */
export const matches = (route: Route, severity: number, style: PredicateStyle) =>
  style === 'exclusive' ? severity >= route.min && severity <= route.max : severity >= route.min;

/** The fallback predicate: true exactly when no other route matches, so it can never overlap. */
export const unmatched = (severity: number, style: PredicateStyle) => !ROUTES.some((r) => matches(r, severity, style));

/** Turns the keyed branch output into an explicit outcome (Mastra itself returns {} when nothing matched). */
export function finalizeRouting(ticketId: string, branchOutput: Record<string, RouteRecord | undefined>): RoutingResult {
  const routesRun = Object.keys(branchOutput).filter((k) => branchOutput[k] !== undefined);
  if (routesRun.length === 1) return { ticketId, outcome: 'routed', route: routesRun[0]!, routesRun, record: branchOutput[routesRun[0]!]! };
  return { ticketId, outcome: routesRun.length === 0 ? 'UNROUTED' : 'AMBIGUOUS_ROUTE', route: null, routesRun, record: null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = Agent<any, any, any, any, any>;

export function buildRoutingWorkflow(agent: AnyAgent, opts: { style: PredicateStyle; fallback: boolean; signal?: AbortSignal }) {
  const assess = createStep({
    id: 'assess',
    description: 'Rates the ticket severity 0–4 (0 = cannot assess).',
    inputSchema: TicketSchema,
    outputSchema: AssessmentSchema,
    execute: async ({ inputData }) => {
      if (inputData.severity !== undefined)
        return { ticketId: inputData.ticketId, severity: inputData.severity, reason: 'severity provided with the ticket', source: 'pre-assessed' as const };
      const r = await agent.generate(inputData.text, {
        structuredOutput: { schema: z.object({ severity: z.number().int().min(0).max(4), reason: z.string() }) },
        abortSignal: opts.signal,
      });
      const o = r.object as { severity: number; reason: string };
      return { ticketId: inputData.ticketId, severity: o.severity, reason: o.reason, source: 'assessed' as const };
    },
  });
  const routeStep = (route: Route) =>
    createStep({
      id: route.id,
      description: `Route to ${route.record.queue}`,
      inputSchema: AssessmentSchema,
      outputSchema: RouteRecordSchema,
      execute: async () => ({ route: route.id, ...route.record }),
    });
  const branches: [(args: { inputData: Assessment }) => Promise<boolean>, ReturnType<typeof routeStep>][] = ROUTES.map((r) => [
    async ({ inputData }) => matches(r, inputData.severity, opts.style),
    routeStep(r),
  ]);
  if (opts.fallback) branches.push([async ({ inputData }) => unmatched(inputData.severity, opts.style), routeStep(MANUAL_REVIEW)]);
  const finalize = createStep({
    id: 'finalize',
    description: 'Requires exactly one route; reports UNROUTED or AMBIGUOUS_ROUTE otherwise.',
    inputSchema: z.record(z.string(), RouteRecordSchema.optional()),
    outputSchema: RoutingResultSchema,
    execute: async ({ inputData, getInitData }) => finalizeRouting((getInitData() as z.infer<typeof TicketSchema>).ticketId, inputData),
  });
  return createWorkflow({ id: 'routing-workflow', inputSchema: TicketSchema, outputSchema: RoutingResultSchema })
    .then(assess)
    .branch(branches)
    .then(finalize)
    .commit();
}
