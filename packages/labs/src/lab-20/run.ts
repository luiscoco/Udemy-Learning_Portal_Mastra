import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { lab20Definition } from './definition.js';
import { normalizeTriage, RawTriageSchema, TriageSchema, type RawTriage, type Triage } from './normalize.js';
import { buildPipeline, maskSecrets, SECRET_RULES, type RejectionCategory } from './processors.js';

export const Lab20InputSchema = z.object({
  requests: z
    .array(z.object({ text: z.string().max(4_000), expect: z.enum(['accept', 'reject']) }))
    .min(1)
    .max(6),
  maxChars: z.number().int().min(100).max(2_000),
  redactPii: z.boolean(),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab20Input = z.infer<typeof Lab20InputSchema>;

export type RequestOutcome =
  | {
      id: string;
      expect: 'accept' | 'reject';
      /** Masked preview: secrets never appear in results or events. */
      preview: string;
      accepted: false;
      rejection: { processorId: string; category: RejectionCategory | 'other'; reason: string };
      modelCalls: number;
    }
  | {
      id: string;
      expect: 'accept' | 'reject';
      preview: string;
      accepted: true;
      /** Exactly what reached the model after every input processor. */
      modelInput: string;
      raw: RawTriage | null;
      normalized: Triage | null;
      applied: string[];
      schemaErrors: string[];
      modelCalls: number;
    };

export interface Lab20Output {
  outcomes: RequestOutcome[];
  modelCallsTotal: number;
}

const preview = (t: string) => {
  const masked = maskSecrets(t).replace(/\s+/g, ' ').trim();
  return masked.length > 80 ? `${masked.slice(0, 79)}…` : masked;
};

/** Offline model: returns deliberately messy (but parseable) triage JSON, as real models often do. */
export function offlineScript(counter: { calls: number }) {
  return (v: PromptView): ScriptedTurn => {
    counter.calls += 1;
    const t = v.lastUser.toLowerCase();
    const email = v.lastUser.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
    const raw: RawTriage = /invoice|charged|refund|payment/.test(t)
      ? {
          category: 'Billing',
          priority: 'HIGH',
          summary: `  Customer was charged twice and wants a refund.   ${email ? `Reply to ${email}.` : ''}  `,
          tags: ['Refund', 'billing', 'refund', 'Double Charge'],
          needsHuman: 'yes',
        }
      : /crash|error|bug|upload/.test(t)
        ? {
            category: 'Tech Support',
            priority: 'normal',
            summary: 'App crashes when uploading a photo on Android.',
            tags: ['android', 'Crash', 'upload'],
            needsHuman: 'no',
          }
        : { category: 'General question', priority: 'low', summary: v.lastUser.slice(0, 120), tags: [], needsHuman: 'no' };
    return { text: JSON.stringify(raw) };
  };
}

export const lab20: LabImplementation<Lab20Input, Lab20Output, LabServices> = {
  definition: lab20Definition as LabDefinition,
  inputSchema: Lab20InputSchema,

  async run(ctx, input) {
    const counter = { calls: 0 };
    const seen: string[] = [];
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript(counter) });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'triage-agent',
        name: 'Triage Agent',
        model: resolved.model,
        instructions:
          'You triage customer support requests. Classify the category and priority, summarise in one or two sentences, add up to five short tags, and say whether a person must follow up.',
        ...buildPipeline({ maxChars: input.maxChars, redactPii: input.redactPii, seen }),
      }),
    );

    const outcomes: RequestOutcome[] = [];
    for (const [i, req] of input.requests.entries()) {
      const id = `request-${i + 1}`;
      const before = { calls: counter.calls, seen: seen.length };
      ctx.emit({
        type: 'workflow-step',
        stepId: id,
        status: 'running',
        input: { preview: preview(req.text), expect: req.expect },
      });
      const res = await agent.generate(req.text, { structuredOutput: { schema: RawTriageSchema }, abortSignal: ctx.signal });
      ctx.throwIfAborted();
      const modelCalls = ctx.mode === 'offline' ? counter.calls - before.calls : res.tripwire ? 0 : 1;

      if (res.tripwire) {
        const meta = (res.tripwire.metadata ?? {}) as { processorId?: string; category?: RejectionCategory };
        const processorId = meta.processorId ?? res.tripwire.processorId ?? 'unknown';
        const category = meta.category ?? (processorId === 'regex-filter' ? 'secret' : 'other');
        const reason = maskSecrets(res.tripwire.reason);
        ctx.log('warn', `${id} rejected by ${processorId} (${category}): ${reason}`);
        ctx.emit({ type: 'workflow-step', stepId: id, status: 'failed', output: { rejectedBy: processorId, category } });
        outcomes.push({
          id,
          expect: req.expect,
          preview: preview(req.text),
          accepted: false,
          rejection: { processorId, category, reason },
          modelCalls,
        });
        continue;
      }

      const raw = (res.object as RawTriage | undefined) ?? null;
      let normalized: Triage | null = null;
      let applied: string[] = [];
      let schemaErrors: string[] = [];
      if (raw) {
        try {
          ({ value: normalized, applied } = normalizeTriage(raw));
        } catch (err) {
          schemaErrors = err instanceof z.ZodError ? err.issues.map((x) => `${x.path.join('.')}: ${x.message}`) : [String(err)];
        }
      } else schemaErrors = ['the model returned no structured object'];
      for (const a of applied) ctx.log('debug', `${id} normalized ${a}`);
      ctx.emit({
        type: 'workflow-step',
        stepId: id,
        status: normalized ? 'success' : 'failed',
        output: { category: normalized?.category, normalizations: applied.length },
      });
      outcomes.push({
        id,
        expect: req.expect,
        preview: preview(req.text),
        accepted: true,
        modelInput: maskSecrets(seen[before.seen] ?? ''),
        raw,
        normalized,
        applied,
        schemaErrors,
        modelCalls,
      });
    }

    const modelCallsTotal = outcomes.reduce((n, o) => n + o.modelCalls, 0);
    ctx.setResultExtras({
      effective: {
        mode: ctx.mode,
        modelId: input.modelId,
        simulated: resolved.simulated,
        maxChars: input.maxChars,
        redactPii: input.redactPii,
      },
      annotations: {
        requests: outcomes.length,
        rejected: outcomes.filter((o) => !o.accepted).length,
        modelCalls: modelCallsTotal,
      },
    });
    return { outcomes, modelCallsTotal };
  },

  validate(out, input) {
    const rejected = out.outcomes.filter((o) => !o.accepted);
    const accepted = out.outcomes.filter((o): o is Extract<RequestOutcome, { accepted: true }> => o.accepted);
    const mismatched = out.outcomes.filter((o) => (o.accepted ? 'accept' : 'reject') !== o.expect);
    // eslint-disable-next-line no-control-regex
    const dirty = accepted.filter((o) => /[\u0000-\u001f\u007f]|\s{2,}|^\s|\s$/.test(o.modelInput));
    const invalid = accepted.filter((o) => !o.normalized || !TriageSchema.safeParse(o.normalized).success);
    const pii = /[\w.+-]+@[\w-]+\.[a-z]{2,}|\+?\d[\d\s().-]{7,}\d/i;
    const leakedPii = accepted.filter((o) => o.normalized && pii.test(JSON.stringify(o.normalized)));
    const secretInOutput = SECRET_RULES.some((r) => r.pattern.test(JSON.stringify(out)));
    const ids = (list: { id: string }[]) => list.map((o) => o.id).join(', ');
    return summarizeChecks([
      {
        id: 'expectations-met',
        label: 'Every request was accepted or rejected as you expected',
        passed: mismatched.length === 0,
        message: mismatched.length
          ? `unexpected: ${ids(mismatched)}`
          : `${accepted.length} accepted, ${rejected.length} rejected`,
      },
      {
        id: 'rejections-explained',
        label: 'Every rejection names its processor, category and reason, and made no model call',
        passed: rejected.every(
          (o) => !o.accepted && o.rejection.reason.length > 0 && o.rejection.processorId !== 'unknown' && o.modelCalls === 0,
        ),
        message:
          rejected.map((o) => (o.accepted ? '' : `${o.id}: ${o.rejection.processorId}/${o.rejection.category}`)).join('; ') ||
          'no rejections',
      },
      {
        id: 'input-sanitized',
        label: 'Accepted requests reached the model normalized (no control characters or stray whitespace)',
        passed: dirty.length === 0,
        message: dirty.length ? `not normalized: ${ids(dirty)}` : `${accepted.length} checked`,
      },
      {
        id: 'normalized-schema',
        label: 'Every accepted request produced a result that passes the strict TriageSchema',
        passed: invalid.length === 0,
        message: invalid.length ? `invalid: ${ids(invalid)}` : `${accepted.length} valid`,
      },
      {
        id: 'no-sensitive-echo',
        label: 'No secret or personal data (email, phone) appears in the result',
        passed: !secretInOutput && leakedPii.length === 0,
        message: secretInOutput
          ? 'a secret was echoed'
          : leakedPii.length
            ? `PII in: ${ids(leakedPii)}${input.redactPii ? '' : ' (redaction is off)'}`
            : 'clean',
      },
    ]);
  },
};
