import { dirname, join } from 'node:path';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type CheckResult, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamWorkflow } from '../shared/workflow-stream.js';
import { lab34Definition } from './definition.js';
import {
  BatchResultSchema,
  ChargeProvider,
  chargeStepId,
  INITIAL_STATE,
  InvoiceSchema,
  openBilling,
  WORKFLOW_ID,
  type BatchResult,
  type BillingState,
  type Execution,
  type Invoice,
} from './billing.js';

export const STORE_NAME = 'lab-34-workflows';
const RESOURCE_ID = 'learner';

export const Lab34InputSchema = z
  .object({
    invoices: z
      .array(InvoiceSchema)
      .min(1)
      .max(6)
      .refine((v) => new Set(v.map((i) => i.invoiceId)).size === v.length, { message: 'invoiceId values must be unique' }),
    crashAfter: z.string().max(12),
    idempotency: z.enum(['key', 'none']),
    retryDelayMs: z.number().int().min(0).max(2_000),
    modelId: z.enum(DEFAULT_LIVE_MODELS),
  })
  .refine((v) => v.crashAfter === 'none' || v.invoices.some((i) => i.invoiceId === v.crashAfter), {
    message: 'crashAfter must be "none" or one of the invoice ids',
    path: ['crashAfter'],
  });
export type Lab34Input = z.infer<typeof Lab34InputSchema>;

export interface Lab34Output {
  idempotency: Lab34Input['idempotency'];
  crashAfter: string;
  batchRunId: string;
  firstRun: { status: 'crashed' | string; stepsCompleted: string[] };
  detection: { status: string; completedSteps: string[]; runningSteps: string[]; stateCharged: string[] } | null;
  restart: { status: string; result: BatchResult | null; error: string | null } | null;
  executions: Execution[];
  charges: { invoiceId: string; chargeId: string; idempotencyKey: string | null }[];
  chargeCounts: Record<string, number>;
  providerCalls: Record<string, number>;
  finalState: BillingState | null;
  expected: { invoices: string[]; total: number; transient: Record<string, number> };
}

export function summarizeOffline(state: BillingState) {
  return `Charged ${state.charged.length} invoice(s) for a total of ${state.total.toFixed(2)}; ${state.charged.filter((c) => c.attempts > 1).length} needed retries.`;
}
export function offlineScript() {
  return (v: PromptView): ScriptedTurn => ({ text: summarizeOffline(JSON.parse(v.lastUser) as BillingState) });
}

interface Snapshot {
  status?: string;
  steps?: Record<string, { status?: string }>;
  value?: BillingState;
}
interface ActiveSnapshot {
  status?: string;
  context?: Record<string, { status?: string }>;
  value?: BillingState;
}

export const lab34: LabImplementation<Lab34Input, Lab34Output, LabServices> = {
  definition: lab34Definition as LabDefinition,
  inputSchema: Lab34InputSchema,

  async run(ctx, input) {
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript() });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'batch-reporter',
        name: 'Batch Reporter',
        instructions: 'Write one sentence for the operator summarising a billing batch. The user message is JSON { charged: [{ invoiceId, chargeId, attempts }], total }.',
        model: resolved.model,
      }),
    );
    const summarize = async (s: BillingState) => (await agent.generate(JSON.stringify(s), { abortSignal: ctx.signal })).text.trim();
    const provider = new ChargeProvider(join(dirname(ctx.services.memory.file(STORE_NAME)), 'lab-34-charges.jsonl'));
    const executions: Execution[] = [];
    const invoices = input.invoices;
    const common = { provider, idempotency: input.idempotency, executions, retryDelayMs: input.retryDelayMs, summarize };

    // ---- Worker A: runs the batch and (optionally) crashes mid-step. ----
    let crashed = false;
    let signalCrash!: () => void;
    const crashSignal = new Promise<'crash'>((resolve) => (signalCrash = () => resolve('crash')));
    const openedA = await ctx.services.memory.open(STORE_NAME);
    let batchRunId = '';
    let finalState: BillingState | null = null;
    let firstRun: Lab34Output['firstRun'];
    try {
      const { workflow } = openBilling(openedA.storage, invoices, {
        ...common,
        instance: 'A',
        ...(input.crashAfter !== 'none' ? { crashAfter: { invoiceId: input.crashAfter, onCrash: () => signalCrash() } } : {}),
      });
      const run = await workflow.createRun({ resourceId: RESOURCE_ID });
      batchRunId = run.runId;
      const finished = streamWorkflow(
        ctx as RunContext<unknown>,
        `${WORKFLOW_ID}#worker-A`,
        { stream: () => run.stream({ inputData: { invoices }, initialState: INITIAL_STATE } as never), cancel: () => run.cancel() },
        { invoices },
      );
      finished.catch(() => {}); // an abandoned (crashed) run never settles; never surface it
      const first = await Promise.race([finished, crashSignal]);
      if (first === 'crash') {
        crashed = true;
        ctx.emit({
          type: 'workflow-step',
          workflowId: `${WORKFLOW_ID}#worker-A`,
          stepId: chargeStepId(input.crashAfter),
          status: 'failed',
          output: { error: 'worker crashed (simulated) after the provider recorded the charge' },
        });
        ctx.log('warn', `Worker A crashed inside ${chargeStepId(input.crashAfter)}, after the provider recorded the charge. Its Mastra instance is discarded.`);
        firstRun = { status: 'crashed', stepsCompleted: executions.filter((e) => e.instance === 'A').map((e) => e.stepId) };
      } else {
        firstRun = { status: first.status, stepsCompleted: first.steps.filter((s) => s.status === 'success').map((s) => s.stepId) };
        const parsed = BatchResultSchema.safeParse(first.result);
        finalState = parsed.success ? parsed.data.state : null;
      }
    } finally {
      await openedA.close();
    }

    // ---- Worker B: a fresh instance detects the interrupted run and restarts it. ----
    let detection: Lab34Output['detection'];
    let restart: Lab34Output['restart'] = null;
    const openedB = await ctx.services.memory.open(STORE_NAME);
    try {
      const { workflow } = openBilling(openedB.storage, invoices, { ...common, instance: 'B' });
      // listActiveWorkflowRuns is how a recovering worker finds interrupted runs; its snapshot carries the
      // persisted workflow state (value). getWorkflowRunById does not expose the state on this version.
      const active = (await workflow.listActiveWorkflowRuns()) as { runs: { runId: string; snapshot?: ActiveSnapshot | string }[] };
      const raw = active.runs.find((r) => r.runId === batchRunId)?.snapshot;
      const listed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ActiveSnapshot | undefined;
      const fallback = listed ? null : ((await workflow.getWorkflowRunById(batchRunId)) as Snapshot | null);
      const snap: Snapshot | null = listed
        ? { status: listed.status, steps: Object.fromEntries(Object.entries(listed.context ?? {}).filter(([k]) => k !== 'input')), value: listed.value }
        : fallback;
      const steps = Object.entries(snap?.steps ?? {});
      detection = {
        status: String(snap?.status ?? 'unknown'),
        completedSteps: steps.filter(([, s]) => s.status === 'success').map(([id]) => id),
        runningSteps: steps.filter(([, s]) => s.status === 'running').map(([id]) => id),
        stateCharged: (snap?.value?.charged ?? []).map((c) => c.invoiceId),
      };
      if (crashed) {
        ctx.log('info', `Worker B found run ${batchRunId} still "${detection.status}" (running: ${detection.runningSteps.join(', ') || 'none'}). Restarting only this run id.`);
        const before = executions.length;
        try {
          const run = await workflow.createRun({ runId: batchRunId, resourceId: RESOURCE_ID });
          const r = (await run.restart({ outputOptions: { includeState: true } })) as { status: string; result?: unknown; state?: unknown; error?: { message?: string } };
          const parsed = BatchResultSchema.safeParse(r.result);
          restart = { status: r.status, result: parsed.success ? parsed.data : null, error: r.error?.message ?? null };
          finalState = parsed.success ? parsed.data.state : null;
        } catch (e) {
          restart = { status: 'failed', result: null, error: (e instanceof Error ? e.message : String(e)).split('\n')[0]!.slice(0, 200) };
        }
        // No restart stream exists: report what worker B executed from the execution log.
        for (const e of executions.slice(before))
          ctx.emit({ type: 'workflow-step', workflowId: `${WORKFLOW_ID}#worker-B (restart)`, stepId: e.stepId, status: 'success', output: { chargedAtEntry: e.chargedAtEntry } });
        ctx.log(restart.status === 'success' ? 'info' : 'error', `Restart ${restart.status}${restart.error ? `: ${restart.error}` : ''}.`);
      }
    } finally {
      await openedB.close();
    }

    const charges = provider.read(batchRunId);
    const chargeCounts = Object.fromEntries(invoices.map((i) => [i.invoiceId, charges.filter((c) => c.invoiceId === i.invoiceId).length]));
    ctx.setResultExtras({ effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, idempotency: input.idempotency } });
    return {
      idempotency: input.idempotency,
      crashAfter: input.crashAfter,
      batchRunId,
      firstRun,
      detection,
      restart,
      executions,
      charges: charges.map(({ invoiceId, chargeId, idempotencyKey }) => ({ invoiceId, chargeId, idempotencyKey })),
      chargeCounts,
      providerCalls: Object.fromEntries(invoices.map((i) => [i.invoiceId, provider.callsFor(batchRunId, i.invoiceId)])),
      finalState,
      expected: {
        invoices: invoices.map((i) => i.invoiceId),
        total: Math.round(invoices.reduce((n, i) => n + i.amount, 0) * 100) / 100,
        transient: Object.fromEntries(invoices.filter((i) => i.failTimes > 0).map((i) => [i.invoiceId, i.failTimes])),
      },
    };
  },

  validate(out) {
    const checks: CheckResult[] = [];
    const ids = out.expected.invoices;
    if (out.crashAfter !== 'none') {
      const crashIdx = ids.indexOf(out.crashAfter);
      const before = ids.slice(0, crashIdx).map(chargeStepId);
      const fromCrash = ids.slice(crashIdx).map(chargeStepId);
      const d = out.detection;
      checks.push({
        id: 'crash-detected',
        label: 'A fresh instance found the interrupted run in storage, with the earlier steps completed',
        passed: d?.status === 'running' && before.every((s) => d.completedSteps.includes(s)) && d.runningSteps.includes(chargeStepId(out.crashAfter)),
        message: d ? `status ${d.status}; completed ${d.completedSteps.length} step(s); running ${d.runningSteps.join(', ') || 'none'}` : 'no snapshot',
      });
      const bSteps = out.executions.filter((e) => e.instance === 'B').map((e) => e.stepId);
      const rerunEarlier = before.filter((s) => bSteps.includes(s));
      checks.push({
        id: 'resumed-after-crash',
        label: 'The restart continued from the interrupted step; no earlier charge step ran again',
        passed: out.restart?.status === 'success' && rerunEarlier.length === 0 && fromCrash.every((s) => bSteps.includes(s)),
        message: rerunEarlier.length ? `re-ran ${rerunEarlier.join(', ')}` : `worker B ran ${bSteps.join(' → ') || 'nothing'} (${out.restart?.status ?? 'no restart'})`,
      });
      const reentry = out.executions.find((e) => e.instance === 'B' && e.stepId === chargeStepId(out.crashAfter));
      const stateOk = JSON.stringify(reentry?.chargedAtEntry ?? null) === JSON.stringify(ids.slice(0, crashIdx));
      const finalOk = out.finalState !== null && JSON.stringify(out.finalState.charged.map((c) => c.invoiceId).sort()) === JSON.stringify([...ids].sort()) && out.finalState.total === out.expected.total;
      checks.push({
        id: 'state-persisted',
        label: 'Workflow state survived the crash and the final state covers every invoice',
        passed: stateOk && finalOk,
        message: `state at re-entry: [${reentry?.chargedAtEntry.join(', ') ?? '—'}]; final total ${out.finalState?.total ?? '—'} (expected ${out.expected.total})`,
      });
    } else {
      const finalOk = out.finalState !== null && out.finalState.charged.length === ids.length && out.finalState.total === out.expected.total;
      checks.push({
        id: 'state-persisted',
        label: 'Workflow state survived the crash and the final state covers every invoice',
        passed: out.firstRun.status === 'success' && finalOk,
        message: `no crash requested; final total ${out.finalState?.total ?? '—'}`,
      });
    }
    const dup = ids.filter((i) => (out.chargeCounts[i] ?? 0) !== 1);
    checks.push({
      id: 'no-duplicate-charges',
      label: 'Every invoice was charged exactly once',
      passed: dup.length === 0,
      message: dup.length ? dup.map((i) => `${i} ×${out.chargeCounts[i] ?? 0}`).join(', ') : `${ids.length} invoice(s), one charge each`,
    });
    const transient = Object.entries(out.expected.transient);
    const notRecovered = transient.filter(([i, n]) => (out.chargeCounts[i] ?? 0) < 1 || (out.providerCalls[i] ?? 0) < n + 1);
    checks.push({
      id: 'transient-recovered',
      label: 'Transient provider errors were retried until the charge succeeded',
      passed: notRecovered.length === 0,
      message: transient.length
        ? transient.map(([i, n]) => `${i}: ${n} × 503, then charged after ${out.providerCalls[i] ?? 0} call(s)`).join('; ')
        : 'no transient failures configured',
    });
    return summarizeChecks(checks);
  },
};

export type { Invoice };
