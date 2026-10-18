import { z } from 'zod';
import type { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { ConversationMessage } from '@mlp/contracts';
import type { RunContext } from '@mlp/lab-engine';
import { streamAgent, type ToolTrace } from '../shared/tool-stream.js';
import { specialistPrompt, stopWhenQueued, type HandoffDesk } from './agents.js';
import { CaseSchema, decideHandoff, SPECIALISTS, type AgentId, type Packet, type Specialist } from './routing.js';

export const FAULTS = ['none', 'misroute', 'ping-pong'] as const;
export type Fault = (typeof FAULTS)[number];
export const ESCALATIONS = ['not-allowed', 'hop-limit', 'cycle', 'missing-context', 'no-handoff', 'iteration-cap'] as const;

const PendingSchema = z.object({
  from: z.string(),
  to: z.string(),
  reason: z.string(),
  note: z.string().nullable(),
  injected: z.boolean(),
});
export const OutcomeSchema = z.object({
  status: z.enum(['resolved', 'escalated']),
  resolver: z.string().nullable(),
  reply: z.string(),
  escalation: z.object({ reason: z.enum(ESCALATIONS), detail: z.string() }).nullable(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;
const StateSchema = z.object({
  case: CaseSchema.nullable(),
  pending: PendingSchema.nullable(),
  visited: z.array(z.enum(SPECIALISTS)),
  hops: z.number().int(),
  done: z.boolean(),
  outcome: OutcomeSchema.nullable(),
});
type State = z.infer<typeof StateSchema>;

export interface DecisionRecord {
  from: string;
  to: string;
  accepted: boolean;
  hop: number | null;
  reason: string | null;
  detail: string | null;
  injected: boolean;
}
export interface PacketRecord {
  to: Specialist;
  from: string;
  packet: Packet;
  prompt: string;
  reason: string;
  note: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = Agent<any, any, any, any, any>;

export interface Orchestration {
  ctx: RunContext<unknown>;
  triage: AnyAgent;
  specialists: Record<Specialist, AnyAgent>;
  desk: HandoffDesk;
  fault: Fault;
  maxHops: number;
  post: (m: Omit<ConversationMessage, 'seq'>) => void;
  record: {
    triageChoice: Specialist | null;
    triageTools: ToolTrace[];
    decisions: DecisionRecord[];
    packets: PacketRecord[];
    specialistTools: (ToolTrace & { agent: Specialist })[];
  };
}

const escalate = (s: State, reason: (typeof ESCALATIONS)[number], detail: string): State => ({
  ...s,
  pending: null,
  done: true,
  outcome: { status: 'escalated', resolver: null, reply: '', escalation: { reason, detail } },
});

/**
 * triage → dountil(handle) → finish. Agents only queue transfer requests; the orchestrator accepts or
 * refuses each one with decideHandoff() and builds the next packet from the case record it keeps.
 */
export function buildHandoffWorkflow(o: Orchestration) {
  const { ctx, record } = o;

  const triage = createStep({
    id: 'triage',
    description: 'The triage agent extracts the case and requests one transfer.',
    inputSchema: z.object({ message: z.string() }),
    outputSchema: StateSchema,
    execute: async ({ inputData }) => {
      const res = await streamAgent(ctx, o.triage, inputData.message, {
        maxSteps: 3,
        toolChoice: 'required',
        stopWhen: stopWhenQueued(o.desk, 'triage'),
        emitTokens: false,
      });
      record.triageTools.push(...res.tools);
      for (const t of res.tools.filter((t) => t.status !== 'success'))
        ctx.log('warn', `triage: ${t.toolName} rejected (${t.error ?? t.status})`);
      const req = o.desk.take('triage');
      const base: State = { case: req?.case ?? null, pending: null, visited: [], hops: 0, done: false, outcome: null };
      if (!req) return escalate(base, 'no-handoff', 'triage did not request a transfer');
      record.triageChoice = req.to;
      o.post({
        from: 'triage',
        to: 'orchestrator',
        kind: 'handoff',
        stepId: 'triage',
        round: null,
        summary: `Requests transfer to ${req.to}: ${req.reason}`,
        content: JSON.stringify(req.case, null, 2),
      });
      const misrouted = o.fault === 'misroute' ? SPECIALISTS[(SPECIALISTS.indexOf(req.to) + 1) % SPECIALISTS.length]! : null;
      return {
        ...base,
        pending: {
          from: 'triage',
          to: misrouted ?? req.to,
          reason: misrouted ? `Fault injection: overridden from ${req.to}` : req.reason,
          note: null,
          injected: misrouted !== null,
        },
      };
    },
  });

  const handle = createStep({
    id: 'handle',
    description: 'The orchestrator decides the pending handoff; an accepted target works on its packet.',
    inputSchema: StateSchema,
    outputSchema: StateSchema,
    execute: async ({ inputData: s }) => {
      if (s.done || !s.pending || !s.case) return s.done ? s : escalate(s, 'no-handoff', 'nothing to route');
      const p = s.pending;
      const d = decideHandoff({
        from: p.from as AgentId,
        to: p.to,
        visited: s.visited,
        hops: s.hops,
        maxHops: o.maxHops,
        case: s.case,
      });
      record.decisions.push({
        from: p.from,
        to: p.to,
        accepted: d.accepted,
        hop: d.accepted ? d.hop : null,
        reason: d.accepted ? null : d.reason,
        detail: d.accepted ? null : d.detail,
        injected: p.injected,
      });
      if (!d.accepted) {
        ctx.log('warn', `handoff ${p.from} → ${p.to} refused: ${d.reason} (${d.detail})`);
        return escalate(s, d.reason, d.detail);
      }
      const to = p.to as Specialist;
      const prompt = specialistPrompt(d.packet, p.from as AgentId, p.reason, p.note);
      record.packets.push({ to, from: p.from, packet: d.packet, prompt, reason: p.reason, note: p.note });
      o.post({
        from: 'orchestrator',
        to,
        kind: 'handoff',
        stepId: 'handle',
        round: d.hop,
        summary: `Handoff ${d.hop}/${o.maxHops} accepted: ${p.from} → ${to}${p.injected ? ' (route overridden by the lab)' : ''}`,
        content: prompt,
        ...(p.injected ? { injected: true } : {}),
      });
      const res = await streamAgent(ctx, o.specialists[to], prompt, {
        maxSteps: 3,
        stopWhen: stopWhenQueued(o.desk, to),
        emitTokens: false,
      });
      record.specialistTools.push(...res.tools.map((t) => ({ ...t, agent: to })));
      const next: State = { ...s, visited: [...s.visited, to], hops: d.hop, pending: null };
      const req = o.desk.take(to);
      if (req) {
        o.post({
          from: to,
          to: 'orchestrator',
          kind: 'handoff',
          stepId: 'handle',
          round: d.hop,
          summary: `Requests transfer to ${req.to}: ${req.reason}`,
          content: req.note ?? '(no note)',
        });
        return { ...next, pending: { from: to, to: req.to, reason: req.reason, note: req.note, injected: false } };
      }
      const reply = res.text.trim();
      o.post({
        from: to,
        to: 'customer',
        kind: 'final',
        stepId: 'handle',
        round: d.hop,
        summary: `Resolved by ${to}`,
        content: reply,
      });
      return { ...next, done: true, outcome: { status: 'resolved' as const, resolver: to, reply, escalation: null } };
    },
  });

  const finish = createStep({
    id: 'finish',
    description: 'Returns the outcome; an escalated case goes to a human with the reason.',
    inputSchema: StateSchema,
    outputSchema: OutcomeSchema,
    execute: async ({ inputData: s }) => {
      const out = s.outcome ?? escalate(s, 'iteration-cap', `stopped after ${o.maxHops + 1} iterations`).outcome!;
      if (out.status === 'escalated')
        o.post({
          from: 'orchestrator',
          to: 'human',
          kind: 'escalation',
          stepId: 'finish',
          round: s.hops,
          summary: `Escalated: ${out.escalation!.reason}`,
          content: out.escalation!.detail,
        });
      return out;
    },
  });

  return createWorkflow({ id: 'handoff-workflow', inputSchema: z.object({ message: z.string() }), outputSchema: OutcomeSchema })
    .then(triage)
    .dountil(handle, async ({ inputData, iterationCount }) => inputData.done || iterationCount >= o.maxHops + 1)
    .then(finish)
    .commit();
}
