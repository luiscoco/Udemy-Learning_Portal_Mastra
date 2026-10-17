import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { runTypedWorkflow } from '../shared/workflow-stream.js';
import { lab29Definition } from './definition.js';
import { buildRoutingWorkflow, MANUAL_REVIEW, ROUTES, RoutingResultSchema, TicketSchema, type RoutingResult } from './routing.js';

const ROUTE_IDS: [string, ...string[]] = [MANUAL_REVIEW.id, ...ROUTES.map((r) => r.id)];

export const Lab29InputSchema = z.object({
  tickets: z.array(TicketSchema.extend({ expectRoute: z.enum(ROUTE_IDS) })).min(1).max(8),
  predicateStyle: z.enum(['exclusive', 'overlapping']),
  fallback: z.boolean(),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab29Input = z.infer<typeof Lab29InputSchema>;

export interface TicketOutcome {
  ticketId: string;
  expectRoute: string;
  severity: number | null;
  source: string | null;
  /** Branches that actually ran (from Mastra's step records). */
  branchesRun: string[];
  routing: RoutingResult | null;
  status: string;
}

export interface Lab29Output {
  predicateStyle: Lab29Input['predicateStyle'];
  fallback: boolean;
  outcomes: TicketOutcome[];
}

/** Offline assessment: unambiguous keyword rules (0 when the text describes no problem). */
export function assessOffline(text: string): { severity: number; reason: string } {
  const t = text.toLowerCase();
  if (/\b(down|outage|all customers|data loss|breach)\b/.test(t)) return { severity: 4, reason: 'service outage affecting customers' };
  if (/can'?t log in|cannot log in|blocked|locked out|urgent|asap/.test(t)) return { severity: 3, reason: 'a user is blocked from working' };
  if (/\b(slow|error|bug|wrong|broken)\b/.test(t)) return { severity: 2, reason: 'a defect with a workaround' };
  if (/\b(typo|question|cosmetic|minor|suggestion)\b/.test(t)) return { severity: 1, reason: 'minor or cosmetic issue' };
  return { severity: 0, reason: 'the text does not describe a problem' };
}

export function offlineScript() {
  return (v: PromptView): ScriptedTurn => ({ text: JSON.stringify(assessOffline(v.lastUser)) });
}

export const lab29: LabImplementation<Lab29Input, Lab29Output, LabServices> = {
  definition: lab29Definition as LabDefinition,
  inputSchema: Lab29InputSchema,

  async run(ctx, input) {
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript() });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'severity-assessor',
        name: 'Severity Assessor',
        instructions:
          'Rate the support ticket severity: 4 = outage or data loss affecting many customers; 3 = a user is blocked; 2 = a defect with a workaround; 1 = minor or cosmetic; 0 = the text does not describe a problem. Give a short reason.',
        model: resolved.model,
      }),
    );
    const workflow = buildRoutingWorkflow(agent, { style: input.predicateStyle, fallback: input.fallback, signal: ctx.signal });
    const outcomes: TicketOutcome[] = [];
    for (const t of input.tickets) {
      ctx.throwIfAborted();
      const { expectRoute, ...ticket } = t;
      const res = await runTypedWorkflow(ctx, `routing-workflow#${t.ticketId}`, await workflow.createRun(), ticket, RoutingResultSchema);
      const assess = res.stepRecords.assess?.output as { severity?: number; source?: string } | undefined;
      const branchesRun = ROUTE_IDS.filter((id) => res.stepRecords[id]?.status === 'success');
      const routing = res.typed;
      ctx.log(
        routing?.outcome === 'routed' && routing.route === expectRoute ? 'info' : 'warn',
        `${t.ticketId}: severity ${assess?.severity ?? '?'} → ${branchesRun.join(' + ') || 'no branch'} (${routing?.outcome ?? res.status}; expected ${expectRoute})`,
      );
      outcomes.push({
        ticketId: t.ticketId,
        expectRoute,
        severity: assess?.severity ?? null,
        source: assess?.source ?? null,
        branchesRun,
        routing,
        status: res.status,
      });
    }
    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, predicateStyle: input.predicateStyle, fallback: input.fallback },
    });
    return { predicateStyle: input.predicateStyle, fallback: input.fallback, outcomes };
  },

  validate(out) {
    const wrong = out.outcomes.filter((o) => o.routing?.route !== o.expectRoute);
    const notOne = out.outcomes.filter((o) => o.branchesRun.length !== 1);
    const dropped = out.outcomes.filter((o) => o.routing?.outcome === 'UNROUTED' || o.branchesRun.length === 0);
    const unassessable = out.outcomes.filter((o) => o.severity === 0);
    return summarizeChecks([
      {
        id: 'correct-branch',
        label: 'Every ticket followed its expected branch',
        passed: wrong.length === 0,
        message: wrong.length ? wrong.map((o) => `${o.ticketId}: ${o.branchesRun.join('+') || 'none'} ≠ ${o.expectRoute}`).join('; ') : `${out.outcomes.length} ticket(s) correct`,
      },
      {
        id: 'exactly-one-branch',
        label: 'Exactly one branch ran for every ticket (predicates are mutually exclusive)',
        passed: notOne.length === 0,
        message: notOne.length ? notOne.map((o) => `${o.ticketId}: ${o.branchesRun.length} branches`).join('; ') : 'no overlaps',
      },
      {
        id: 'unmatched-handled',
        label: 'Tickets that match no severity route went to manual review, not nowhere',
        passed: dropped.length === 0 && unassessable.every((o) => o.routing?.route === MANUAL_REVIEW.id),
        message: dropped.length ? `dropped: ${dropped.map((o) => o.ticketId).join(', ')}` : `${unassessable.length} unassessable ticket(s) handled`,
      },
      {
        id: 'explicit-outcome',
        label: 'Every ticket ended with an explicit routing outcome',
        passed: out.outcomes.every((o) => o.status === 'success' && o.routing !== null),
        message: out.outcomes.map((o) => `${o.ticketId}:${o.routing?.outcome ?? o.status}`).join(', '),
      },
    ]);
  },
};
