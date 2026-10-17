import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { runTypedWorkflow, type StepTrace } from '../shared/workflow-stream.js';
import { lab27Definition } from './definition.js';
import {
  buildInviteWorkflow,
  CITIES,
  EnrichedSchema,
  ParsedSchema,
  RenderedSchema,
  RenderInputSchema,
  type Parsed,
  type Rendered,
} from './steps.js';

export const Lab27InputSchema = z.object({
  invitation: z.string().trim().min(10).max(1_000),
  today: z.iso.date(),
  brokenEnrich: z.boolean(),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab27Input = z.infer<typeof Lab27InputSchema>;

export interface Transition {
  from: string;
  to: string;
  /** Does the recorded output of `from` satisfy the input schema of `to`? (re-checked by the lab) */
  valid: boolean;
  issues: string[];
}

export interface Lab27Output {
  status: string;
  stepExecutionPath: string[];
  steps: StepTrace[];
  transitions: Transition[];
  error: string | null;
  rendered: Rendered | null;
}

/** Offline parse: the scripted model reads the fields from the invitation text. */
export function parseOffline(text: string): Parsed {
  const city =
    (Object.keys(CITIES) as (keyof typeof CITIES)[]).find((c) => text.toLowerCase().includes(c.toLowerCase())) ?? 'Lisbon';
  return {
    title: text.match(/^\s*([^,.]+?)\s+on\s+\d{4}-/i)?.[1]?.trim() ?? text.split(/[,.]/)[0]!.trim(),
    date: text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? '2026-01-01',
    time: text.match(/\b(\d{2}:\d{2})\b/)?.[1] ?? '09:00',
    city,
    room: text.match(/\broom\s+([A-Z][a-z]+)/)?.[1] ?? null,
    organiser: text.match(/\borgani[sz]er\s+([A-Z][a-z]+)/)?.[1] ?? null,
  };
}

export function offlineScript() {
  return (v: PromptView): ScriptedTurn => ({ text: JSON.stringify(parseOffline(v.lastUser)) });
}

/** Which schema each step expects, so recorded transitions can be re-validated. */
const INPUT_SCHEMA: Record<string, z.ZodType> = { enrich: ParsedSchema, render: RenderInputSchema };
const OUTPUT_SCHEMA: Record<string, z.ZodType> = { parse: ParsedSchema, enrich: EnrichedSchema, render: RenderedSchema };

export const lab27: LabImplementation<Lab27Input, Lab27Output, LabServices> = {
  definition: lab27Definition as LabDefinition,
  inputSchema: Lab27InputSchema,

  async run(ctx, input) {
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript() });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'invite-parser',
        name: 'Invite Parser',
        instructions: `Extract the event from the invitation: title, date (YYYY-MM-DD), time (HH:MM, 24h), city (one of ${Object.keys(CITIES).join(', ')}), room and organiser (null if missing). Copy values, do not invent them.`,
        model: resolved.model,
      }),
    );
    const workflow = buildInviteWorkflow(agent, { brokenEnrich: input.brokenEnrich, signal: ctx.signal });
    const res = await runTypedWorkflow(
      ctx,
      'invite-workflow',
      await workflow.createRun(),
      { invitation: input.invitation, today: input.today },
      RenderedSchema,
    );

    // Re-validate every transition the run actually made, against the real next-step schema.
    const transitions: Transition[] = [];
    for (let i = 0; i + 1 < res.stepExecutionPath.length; i++) {
      const from = res.stepExecutionPath[i]!;
      const to = res.stepExecutionPath[i + 1]!;
      const out = res.steps.find((s) => s.stepId === from)?.output;
      const schema = INPUT_SCHEMA[to] ?? (to.startsWith('mapping_') ? OUTPUT_SCHEMA[from] : undefined);
      if (!schema || out === undefined) continue;
      const parsed = schema.safeParse(out);
      transitions.push({
        from,
        to,
        valid: parsed.success,
        issues: parsed.success ? [] : parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`),
      });
    }
    for (const t of transitions)
      ctx.log(t.valid ? 'info' : 'warn', `transition ${t.from} → ${t.to}: ${t.valid ? 'valid' : t.issues.join('; ')}`);
    if (res.error) ctx.log('warn', `workflow ${res.status}: ${res.error.split('\n')[0]}`);

    ctx.setResultExtras({
      effective: {
        mode: ctx.mode,
        modelId: input.modelId,
        simulated: resolved.simulated,
        today: input.today,
        brokenEnrich: input.brokenEnrich,
      },
    });
    return {
      status: res.status,
      stepExecutionPath: res.stepExecutionPath,
      steps: res.steps,
      transitions,
      error: res.error ?? null,
      rendered: res.typed,
    };
  },

  validate(out, input, { events }) {
    const trace = events.filter((e) => e.type === 'workflow-step').map((e) => `${e.stepId}:${e.status}`);
    const mapping = out.stepExecutionPath.find((s) => s.startsWith('mapping_')) ?? 'mapping';
    const expected = [
      'invite-workflow:running',
      ...['parse', 'enrich', mapping, 'render'].flatMap((s) => [`${s}:running`, `${s}:success`]),
      'invite-workflow:success',
    ];
    const enrichOut = out.steps.find((s) => s.stepId === 'enrich')?.output as
      { weekday?: unknown; daysUntil?: number; startUtc?: string } | undefined;
    return summarizeChecks([
      {
        id: 'ordered-events',
        label: 'Events arrived in pipeline order: parse → enrich → map → render',
        passed: JSON.stringify(trace) === JSON.stringify(expected),
        message: trace.join(', '),
      },
      {
        id: 'typed-transitions',
        label: 'Every transition satisfied the next step’s input schema',
        passed: out.transitions.length >= 3 && out.transitions.every((t) => t.valid),
        message: out.transitions.map((t) => `${t.from}→${t.to}:${t.valid ? 'ok' : 'invalid'}`).join(', '),
      },
      {
        id: 'typed-output',
        label: 'The final output passed the workflow’s output schema',
        passed: out.status === 'success' && out.rendered !== null,
        message: out.error ? out.error.split('\n')[0] : 'valid',
      },
      {
        id: 'enrichment-correct',
        label: 'Enrichment computed weekday, countdown and UTC time from the reference date',
        passed:
          typeof enrichOut?.weekday === 'string' &&
          typeof enrichOut.daysUntil === 'number' &&
          Boolean(enrichOut.startUtc) &&
          Boolean(out.rendered?.ics.includes(`DTSTART:${enrichOut.startUtc!.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`)),
        message: enrichOut
          ? `${String(enrichOut.weekday)}, in ${enrichOut.daysUntil} days, ${enrichOut.startUtc}`
          : 'enrich did not run',
      },
      {
        id: 'today-respected',
        label: 'The countdown uses the reference date you entered',
        passed:
          typeof enrichOut?.daysUntil === 'number' && out.rendered?.markdown.includes(`in ${enrichOut.daysUntil} day`) === true,
        message: `reference date ${input.today}`,
      },
    ]);
  },
};
