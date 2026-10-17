import { dirname, join } from 'node:path';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type CheckResult, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { classifyResumeError, type ResumeErrorCode } from '../shared/resume.js';
import { streamWorkflow } from '../shared/workflow-stream.js';
import { lab33Definition } from './definition.js';
import {
  GATE_STEP,
  OutcomeSchema,
  openRefunds,
  PaymentProvider,
  RefundRequestSchema,
  SummarySchema,
  WORKFLOW_ID,
  type Decision,
  type GatePayload,
  type Outcome,
  type RefundRequest,
  type Summary,
} from './refunds.js';

export const STORE_NAME = 'lab-33-workflows';
const RESOURCE_ID = 'learner';

const PlannedRequestSchema = RefundRequestSchema.extend({
  /** approve / reject = preset decision; none = nobody answers; ask = you decide in the Run tab. */
  supervisorDecision: z.enum(['approve', 'reject', 'none', 'ask']),
});
type PlannedRequest = z.infer<typeof PlannedRequestSchema>;

/** Fields depend on the action (the form never submits hidden ones), so the refinement requires what each needs. */
export const Lab33InputSchema = z
  .object({
    action: z.enum(['demo', 'start', 'decide', 'sweep']),
    requests: z
      .array(PlannedRequestSchema)
      .min(1)
      .max(4)
      .refine((r) => new Set(r.map((x) => x.refundId)).size === r.length, { message: 'refundId values must be unique' })
      .optional(),
    ttlMinutes: z.number().int().min(1).max(1_440).default(60),
    workflowRunId: z.union([z.uuid(), z.literal('')]).default(''),
    decision: z.enum(['approve', 'reject']).default('approve'),
    supervisor: z.string().trim().min(1).max(60).default('Maria (supervisor)'),
    ackFailures: z.number().int().min(0).max(2).default(1),
    idempotency: z.enum(['key', 'none']).default('key'),
    modelId: z.enum(DEFAULT_LIVE_MODELS).default('openai/gpt-5-mini'),
  })
  .superRefine((v, c) => {
    if ((v.action === 'demo' || v.action === 'start') && !v.requests)
      c.addIssue({ code: 'custom', path: ['requests'], message: 'Add at least one refund request' });
    if (v.action === 'decide' && !v.workflowRunId)
      c.addIssue({ code: 'custom', path: ['workflowRunId'], message: 'Paste the workflow run id returned by a start run' });
  });
export type Lab33Input = z.infer<typeof Lab33InputSchema>;

export interface RequestOutcome {
  refundId: string;
  workflowRunId: string;
  plan: PlannedRequest['supervisorDecision'] | 'decide' | 'sweep';
  /** Who decided: a preset, you (Run tab), nobody (timeout or no answer), or the expiry sweep. */
  decisionSource: 'preset' | 'learner' | 'nobody' | 'sweep' | null;
  startStatus: string | null;
  expiresAt: string | null;
  paymentsBeforeDecision: number | null;
  listedAfterRestart: boolean | null;
  status: 'refunded' | 'rejected' | 'expired' | 'pending' | 'error';
  final: Outcome | null;
  payments: number;
  error?: { code: ResumeErrorCode; message: string };
}

export interface LateDecision {
  refundId: string;
  outcome: 'rejected-by-workflow' | 'accepted';
  code: ResumeErrorCode | null;
  paymentsBefore: number;
  paymentsAfter: number;
}

export interface Lab33Output {
  action: Lab33Input['action'];
  idempotency: Lab33Input['idempotency'];
  ackFailures: number;
  clock: 'simulated (advanced past the approval window for the sweep)' | 'system';
  requests: RequestOutcome[];
  duplicateApproval: LateDecision | null;
  lateApproval: LateDecision | null;
  sweep: { checked: number; expired: string[] } | null;
  payments: { refundId: string; paymentId: string; workflowRunId: string; idempotencyKey: string | null }[];
}

/** Offline recommendation: deterministic policy rules. */
export function summarizeOffline(r: RefundRequest): Summary {
  if (r.amount > 500) return { recommendation: 'reject', summary: `${r.amount} is above the 500 self-service limit; check the order history first.` };
  if (/damaged|broken|never arrived|not delivered|missing/i.test(r.reason))
    return { recommendation: 'approve', summary: `Delivery problem reported for ${r.orderId}; a refund of ${r.amount} is within policy.` };
  return { recommendation: 'reject', summary: `No delivery problem stated for ${r.orderId}; ask the customer for details.` };
}
export function offlineScript() {
  return (v: PromptView): ScriptedTurn => ({ text: JSON.stringify(summarizeOffline(JSON.parse(v.lastUser) as RefundRequest)) });
}

type Wf = ReturnType<typeof openRefunds>['workflow'];

export const lab33: LabImplementation<Lab33Input, Lab33Output, LabServices> = {
  definition: lab33Definition as LabDefinition,
  inputSchema: Lab33InputSchema,

  async run(ctx, input) {
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript() });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'refund-summarizer',
        name: 'Refund Summarizer',
        instructions:
          'You prepare refund requests for a human supervisor. The user message is JSON { refundId, orderId, customer, amount, reason }. ' +
          'Recommend approve when the reason is a delivery problem (damaged, missing, never arrived) and the amount is at most 500; otherwise recommend reject. ' +
          'Write a one-sentence summary for the supervisor. You never approve anything yourself.',
        model: resolved.model,
      }),
    );
    const provider = new PaymentProvider(join(dirname(ctx.services.memory.file(STORE_NAME)), 'lab-33-payments.jsonl'));
    let offsetMs = 0;
    const deps = {
      summarize: async (r: RefundRequest) => {
        const res = await agent.generate(JSON.stringify(r), { structuredOutput: { schema: SummarySchema }, abortSignal: ctx.signal });
        return SummarySchema.parse(res.object);
      },
      provider,
      idempotency: input.idempotency,
      now: () => Date.now() + offsetMs,
    };
    const withInstance = async <T>(fn: (wf: Wf) => Promise<T>): Promise<T> => {
      const opened = await ctx.services.memory.open(STORE_NAME);
      try {
        return await fn(openRefunds(opened.storage, deps).workflow);
      } finally {
        await opened.close();
      }
    };
    const paymentsFor = (runId: string) => provider.read(runId).length;
    const decide = (wf: Wf, runId: string, d: Decision, label: string) => resumeGate(ctx, wf, runId, d, label);

    const requests: RequestOutcome[] = [];
    let duplicateApproval: LateDecision | null = null;
    let lateApproval: LateDecision | null = null;
    let sweep: Lab33Output['sweep'] = null;
    const clockSimulated = input.action === 'demo';

    if (input.action === 'demo' || input.action === 'start') {
      // 1. Start every request: each must stop at the gate with no payment.
      await withInstance(async (wf) => {
        for (const r of input.requests!) {
          ctx.throwIfAborted();
          const { supervisorDecision, ...request } = r;
          const run = await wf.createRun({ resourceId: RESOURCE_ID });
          const res = await streamWorkflow(ctx as RunContext<unknown>, `${WORKFLOW_ID}#${r.refundId}`, run, { request, ttlMinutes: input.ttlMinutes });
          const gate = (res.stepRecords[GATE_STEP] as { suspendPayload?: GatePayload } | undefined)?.suspendPayload;
          provider.loseAcknowledgements(run.runId, input.ackFailures);
          requests.push({
            refundId: r.refundId,
            workflowRunId: run.runId,
            plan: supervisorDecision,
            decisionSource: null,
            startStatus: res.status,
            expiresAt: gate?.expiresAt ?? null,
            paymentsBeforeDecision: paymentsFor(run.runId),
            listedAfterRestart: null,
            status: res.status === 'suspended' ? 'pending' : 'error',
            final: null,
            payments: paymentsFor(run.runId),
          });
          ctx.log('info', `${r.refundId}: waiting for a supervisor until ${gate?.expiresAt ?? '?'} (recommendation: ${gate?.recommendation ?? '?'}).`);
        }
      });
      // 2. Restart: a fresh instance lists the suspended runs from storage.
      ctx.log('info', 'In-process restart: the storage client is closed and a new Mastra instance lists the suspended runs.');
      await withInstance(async (wf) => {
        const ids = await suspendedRunIds(wf);
        for (const q of requests) q.listedAfterRestart = ids.has(q.workflowRunId);

        if (input.action === 'demo') {
          // 3. Decisions, one minute later (inside the window).
          offsetMs = 60_000;
          for (const q of requests) {
            const plan = q.plan as PlannedRequest['supervisorDecision'];
            let d: Decision | null = null;
            if (plan === 'approve' || plan === 'reject') {
              d = { decision: plan, supervisor: input.supervisor };
              q.decisionSource = 'preset';
            } else if (plan === 'ask') {
              const r = input.requests!.find((x) => x.refundId === q.refundId)!;
              const outcome = await ctx.requestApproval({
                toolName: 'approve-refund',
                args: { refundId: r.refundId, orderId: r.orderId, customer: r.customer, amount: r.amount },
                message: `Refund ${r.amount} to ${r.customer} for ${r.orderId} (${r.reason})?`,
              });
              if (outcome.by === 'user') {
                d = { decision: outcome.decision === 'approve' ? 'approve' : 'reject', supervisor: 'you (Run tab)' };
                q.decisionSource = 'learner';
              } else {
                q.decisionSource = 'nobody';
                ctx.log('warn', `${q.refundId}: no decision (${outcome.by}); the request stays suspended until the sweep.`);
              }
            } else {
              q.decisionSource = 'nobody';
            }
            if (d) applyResult(q, await decide(wf, q.workflowRunId, d, 'decision'), paymentsFor);
          }
          // 4. Duplicate approval of a completed, refunded request.
          const refunded = requests.find((q) => q.status === 'refunded');
          if (refunded) duplicateApproval = await lateDecision(wf, refunded, input.supervisor, 'duplicate-approval', decide, paymentsFor);
          // 5. Expiry sweep on the simulated clock, past the approval window (only this demo's runs).
          offsetMs = input.ttlMinutes * 60_000 + 60_000;
          ctx.log('info', `Simulated clock advanced by ${input.ttlMinutes + 1} minute(s) for the expiry sweep.`);
          const still = await suspendedRunIds(wf);
          const mine = requests.filter((q) => still.has(q.workflowRunId));
          for (const q of mine) {
            applyResult(q, await decide(wf, q.workflowRunId, { decision: 'expire', supervisor: 'expiry-sweep' }, 'sweep'), paymentsFor);
            q.decisionSource = q.decisionSource ?? 'sweep';
          }
          sweep = { checked: mine.length, expired: mine.filter((q) => q.status === 'expired').map((q) => q.refundId) };
          // 6. Late approval of an expired request.
          const expired = requests.find((q) => q.status === 'expired');
          if (expired) lateApproval = await lateDecision(wf, expired, input.supervisor, 'late-approval', decide, paymentsFor);
        } else {
          ctx.log('info', 'Runs are suspended. Restart the API if you like, then use Decide with a workflow run id, or Sweep.');
        }
      });
    } else if (input.action === 'decide') {
      await withInstance(async (wf) => {
        provider.loseAcknowledgements(input.workflowRunId, input.ackFailures);
        const q: RequestOutcome = {
          refundId: '?',
          workflowRunId: input.workflowRunId,
          plan: 'decide',
          decisionSource: 'learner',
          startStatus: null,
          expiresAt: null,
          paymentsBeforeDecision: paymentsFor(input.workflowRunId),
          listedAfterRestart: null,
          status: 'pending',
          final: null,
          payments: 0,
        };
        const snap = (await wf.getWorkflowRunById(input.workflowRunId)) as { steps?: Record<string, { suspendPayload?: GatePayload }> } | null;
        if (!snap) {
          q.status = 'error';
          q.error = { code: 'UNKNOWN_RUN', message: 'no persisted snapshot for this workflow run id' };
        } else {
          const gate = snap.steps?.[GATE_STEP]?.suspendPayload;
          q.refundId = gate?.refundId ?? '?';
          q.expiresAt = gate?.expiresAt ?? null;
          applyResult(q, await decide(wf, input.workflowRunId, { decision: input.decision, supervisor: input.supervisor }, 'decision'), paymentsFor);
        }
        requests.push(q);
      });
    } else {
      await withInstance(async (wf) => {
        const list = (await wf.listWorkflowRuns({ status: 'suspended' } as never)) as { runs: SuspendedRun[] };
        const now = deps.now();
        const overdue = list.runs.filter((r) => {
          const exp = r.snapshot?.context?.[GATE_STEP]?.suspendPayload?.expiresAt;
          return exp !== undefined && Date.parse(exp) < now;
        });
        ctx.log('info', `${list.runs.length} suspended run(s); ${overdue.length} past their approval window.`);
        for (const r of overdue) {
          const gate = r.snapshot!.context![GATE_STEP]!.suspendPayload!;
          const q: RequestOutcome = {
            refundId: gate.refundId,
            workflowRunId: r.runId,
            plan: 'sweep',
            decisionSource: 'sweep',
            startStatus: 'suspended',
            expiresAt: gate.expiresAt,
            paymentsBeforeDecision: paymentsFor(r.runId),
            listedAfterRestart: true,
            status: 'pending',
            final: null,
            payments: 0,
          };
          applyResult(q, await decide(wf, r.runId, { decision: 'expire', supervisor: 'expiry-sweep' }, 'sweep'), paymentsFor);
          requests.push(q);
        }
        sweep = { checked: list.runs.length, expired: requests.filter((q) => q.status === 'expired').map((q) => q.refundId) };
      });
    }

    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, action: input.action, idempotency: input.idempotency },
    });
    const runIds = new Set(requests.map((q) => q.workflowRunId));
    return {
      action: input.action,
      idempotency: input.idempotency,
      ackFailures: input.ackFailures,
      clock: clockSimulated ? 'simulated (advanced past the approval window for the sweep)' : 'system',
      requests,
      duplicateApproval,
      lateApproval,
      sweep,
      payments: provider
        .read()
        .filter((p) => runIds.has(p.lineage))
        .map((p) => ({ refundId: p.refundId, paymentId: p.paymentId, workflowRunId: p.lineage, idempotencyKey: p.idempotencyKey })),
    };
  },

  validate(out) {
    const checks: CheckResult[] = [];
    const started = out.requests.filter((q) => q.startStatus !== null && out.action !== 'sweep');
    if (out.action === 'demo' || out.action === 'start') {
      const notGated = started.filter((q) => q.startStatus !== 'suspended' || q.paymentsBeforeDecision !== 0);
      checks.push({
        id: 'approval-gated',
        label: 'Every refund stopped at the supervisor gate before any money moved',
        passed: notGated.length === 0,
        message: notGated.length ? notGated.map((q) => `${q.refundId}: ${q.startStatus}, ${q.paymentsBeforeDecision} payment(s)`).join('; ') : `${started.length} request(s) waiting, 0 payments`,
      });
      const missing = started.filter((q) => !q.listedAfterRestart);
      checks.push({
        id: 'survives-restart',
        label: 'A fresh Mastra instance listed the waiting refunds from storage',
        passed: missing.length === 0,
        message: missing.length ? `not listed: ${missing.map((q) => q.refundId).join(', ')}` : 'all listed as suspended',
      });
    }
    if (out.action !== 'start') {
      const refunded = out.requests.filter((q) => q.status === 'refunded');
      const wrongCount = refunded.filter((q) => q.payments !== 1);
      const approvedErrors = out.requests.filter((q) => q.status === 'error');
      checks.push({
        id: 'approved-refunded-once',
        label: 'Each approved refund was paid exactly once (even after lost acknowledgements)',
        passed: wrongCount.length === 0 && approvedErrors.length === 0,
        message: wrongCount.length
          ? wrongCount.map((q) => `${q.refundId}: ${q.payments} payments`).join('; ')
          : approvedErrors.length
            ? approvedErrors.map((q) => `${q.refundId}: ${q.error?.code ?? 'error'}`).join('; ')
            : refunded.length
              ? refunded.map((q) => `${q.refundId}: 1 payment after ${q.final?.attempts ?? '?'} attempt(s)${q.final?.replayed ? ' (replayed by key)' : ''}`).join('; ')
              : 'no approved refund in this run',
      });
      const paidWrongly = out.requests.filter((q) => (q.status === 'rejected' || q.status === 'expired') && q.payments > 0);
      checks.push({
        id: 'no-refund-on-reject-or-expiry',
        label: 'Rejected and expired refunds were never paid',
        passed: paidWrongly.length === 0,
        message: paidWrongly.length ? paidWrongly.map((q) => `${q.refundId} paid ${q.payments}×`).join('; ') : 'no payment for rejected or expired requests',
      });
    }
    if (out.action === 'demo' || out.action === 'sweep') {
      const undecided = out.requests.filter((q) => q.decisionSource === 'nobody' || q.decisionSource === 'sweep');
      const notExpired = undecided.filter((q) => q.status !== 'expired');
      const late = out.lateApproval;
      const lateOk = !late || (late.outcome === 'rejected-by-workflow' && late.paymentsAfter === late.paymentsBefore);
      checks.push({
        id: 'expiry-enforced',
        label: 'Undecided refunds expired, and a late approval changed nothing',
        passed: notExpired.length === 0 && lateOk,
        message: notExpired.length
          ? `not expired: ${notExpired.map((q) => `${q.refundId} (${q.status})`).join(', ')}`
          : late
            ? `${undecided.length} expired; late approval of ${late.refundId}: ${late.outcome}${late.code ? ` (${late.code})` : ''}`
            : `${undecided.length} expired`,
      });
    }
    if (out.action === 'demo') {
      const d = out.duplicateApproval;
      checks.push({
        id: 'duplicate-approval-rejected',
        label: 'Approving a completed refund again was rejected and paid nothing',
        passed: d !== null && d.outcome === 'rejected-by-workflow' && d.paymentsAfter === d.paymentsBefore,
        message: d ? `${d.refundId}: ${d.outcome}${d.code ? ` (${d.code})` : ''}, payments ${d.paymentsBefore} → ${d.paymentsAfter}` : 'no refunded request to approve again',
      });
    }
    return summarizeChecks(checks);
  },
};

interface SuspendedRun {
  runId: string;
  snapshot?: { context?: Record<string, { suspendPayload?: GatePayload }> };
}

async function suspendedRunIds(wf: Wf): Promise<Set<string>> {
  const list = (await wf.listWorkflowRuns({ status: 'suspended' } as never)) as { runs: SuspendedRun[] };
  return new Set(list.runs.map((r) => r.runId));
}

type ResumeResult = { status: string; outcome: Outcome | null; error?: { code: ResumeErrorCode; message: string } };

async function resumeGate(ctx: RunContext<LabServices>, wf: Wf, runId: string, d: Decision, label: string): Promise<ResumeResult> {
  try {
    const run = await wf.createRun({ runId, resourceId: RESOURCE_ID });
    const res = await streamWorkflow(
      ctx as RunContext<unknown>,
      `${WORKFLOW_ID}#${label}`,
      { stream: () => run.resumeStream({ step: GATE_STEP, resumeData: d }), cancel: () => run.cancel() },
      d,
    );
    if (res.status === 'failed' && res.error) throw new Error(res.error);
    const parsed = OutcomeSchema.safeParse(res.result);
    return { status: res.status, outcome: parsed.success ? parsed.data : null };
  } catch (e) {
    ctx.throwIfAborted();
    const message = (e instanceof Error ? e.message : String(e)).split('\n')[0]!.slice(0, 200);
    const code = classifyResumeError(message);
    ctx.log('info', `Resume rejected (${code}): ${message}`);
    return { status: 'rejected', outcome: null, error: { code, message } };
  }
}

function applyResult(q: RequestOutcome, r: ResumeResult, paymentsFor: (id: string) => number) {
  q.payments = paymentsFor(q.workflowRunId);
  if (r.error) {
    q.status = 'error';
    q.error = r.error;
    return;
  }
  q.final = r.outcome;
  q.status = r.outcome?.status ?? 'error';
}

async function lateDecision(
  wf: Wf,
  q: RequestOutcome,
  supervisor: string,
  label: string,
  decide: (wf: Wf, runId: string, d: Decision, label: string) => Promise<ResumeResult>,
  paymentsFor: (id: string) => number,
): Promise<LateDecision> {
  const before = paymentsFor(q.workflowRunId);
  const r = await decide(wf, q.workflowRunId, { decision: 'approve', supervisor }, label);
  return {
    refundId: q.refundId,
    outcome: r.error ? 'rejected-by-workflow' : 'accepted',
    code: r.error?.code ?? null,
    paymentsBefore: before,
    paymentsAfter: paymentsFor(q.workflowRunId),
  };
}
