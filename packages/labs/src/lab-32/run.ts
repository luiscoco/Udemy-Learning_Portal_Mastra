import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type CheckResult, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamWorkflow } from '../shared/workflow-stream.js';
import { lab32Definition } from './definition.js';
import {
  ActivationSchema,
  ApplicantSchema,
  CHECKPOINT_STEP,
  classifyResumeError,
  countOps,
  DocumentSchema,
  Ledger,
  openOnboarding,
  PRE_CHECKPOINT_STEPS,
  WORKFLOW_ID,
  type Activation,
  type Applicant,
  type RequestDrafter,
  type ResumeErrorCode,
  type SideEffect,
  type SubmittedDocument,
} from './onboarding.js';

export const STORE_NAME = 'lab-32-workflows';
const RESOURCE_ID = 'learner';

/**
 * Fields depend on the action (the form hides, and never submits, the others), so each is optional
 * here and the refinement requires what the chosen action needs.
 */
export const Lab32InputSchema = z
  .object({
    action: z.enum(['demo', 'start', 'inspect', 'resume']),
    applicant: ApplicantSchema.optional(),
    documents: z.array(DocumentSchema).min(1).max(5).optional(),
    workflowRunId: z.union([z.uuid(), z.literal('')]).default(''),
    checkpointStyle: z.enum(['suspend', 'rerun']).default('suspend'),
    modelId: z.enum(DEFAULT_LIVE_MODELS).default('openai/gpt-5-mini'),
  })
  .superRefine((v, c) => {
    const need = (field: 'applicant' | 'documents' | 'workflowRunId', message: string) => {
      if (!v[field]) c.addIssue({ code: 'custom', path: [field], message });
    };
    if (v.action === 'demo' || v.action === 'start') need('applicant', 'An applicant is required to start a run');
    if (v.action === 'demo' || v.action === 'resume') need('documents', 'Documents are required to resume');
    if (v.action === 'inspect' || v.action === 'resume') need('workflowRunId', 'Paste the workflow run id returned by a start run');
  });
export type Lab32Input = z.infer<typeof Lab32InputSchema>;

export interface Phase {
  name: 'start' | 'inspect' | 'resume' | 'duplicate-resume' | 'rerun';
  workflowRunId: string;
  status: string;
  /** Steps that executed in this phase, from Mastra's stream. */
  steps: string[];
  suspendPayload?: unknown;
  activation?: Activation;
  error?: { code: ResumeErrorCode; message: string };
}

export interface Lab32Output {
  action: Lab32Input['action'];
  checkpointStyle: Lab32Input['checkpointStyle'] | null;
  workflowRunId: string;
  lineage: string;
  restart: 'in-process (new Mastra instance and storage client on the same file)' | null;
  phases: Phase[];
  ledger: { op: SideEffect; workflowRunId: string; pid: number }[];
  sideEffectCounts: Record<string, number>;
}

/** Offline drafter: a deterministic request-for-documents message. */
export function draftOffline(payload: { name: string; required: string[] }) {
  return `Hello ${payload.name}, to finish opening your account please upload: ${payload.required.join(', ')}.`;
}
export function offlineScript() {
  return (v: PromptView): ScriptedTurn => ({ text: draftOffline(JSON.parse(v.lastUser) as { name: string; required: string[] }) });
}

type Wf = ReturnType<typeof openOnboarding>['workflow'];

interface Snapshot {
  status?: string;
  suspendedPaths?: Record<string, unknown>;
  steps?: Record<string, { status?: string; suspendPayload?: unknown }>;
  payload?: { lineage?: string };
}

export const lab32: LabImplementation<Lab32Input, Lab32Output, LabServices> = {
  definition: lab32Definition as LabDefinition,
  inputSchema: Lab32InputSchema,

  async run(ctx, input) {
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript() });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'request-drafter',
        name: 'Request Drafter',
        instructions:
          'Write a short, friendly message (two sentences at most) asking the customer to upload the listed documents to finish opening their account. The user message is JSON { name, plan, required }.',
        model: resolved.model,
      }),
    );
    const draft: RequestDrafter = async (a: Applicant, required: string[]) => {
      const r = await agent.generate(JSON.stringify({ name: a.name, plan: a.plan, required }), { abortSignal: ctx.signal });
      return r.text.trim();
    };
    const ledger = new Ledger(join(dirname(ctx.services.memory.file(STORE_NAME)), 'lab-32-ledger.jsonl'));
    const phases: Phase[] = [];

    /** Opens storage, builds a fresh Mastra + workflow on it, and always closes the storage client. */
    const withInstance = async <T>(fn: (wf: Wf) => Promise<T>): Promise<T> => {
      const opened = await ctx.services.memory.open(STORE_NAME);
      try {
        return await fn(openOnboarding(opened.storage, { draft, ledger }).workflow);
      } finally {
        await opened.close();
      }
    };

    const start = (wf: Wf, lineage: string, name: Phase['name'], prefilled?: SubmittedDocument[]) =>
      runStart(ctx, wf, { runId: name === 'start' ? lineage : undefined, lineage, applicant: input.applicant!, prefilled, name });

    let lineage = input.workflowRunId;
    let workflowRunId = input.workflowRunId;
    let restart: Lab32Output['restart'] = null;

    if (input.action === 'demo' || input.action === 'start') {
      lineage = workflowRunId = randomUUID();
      phases.push(await withInstance((wf) => start(wf, lineage, 'start')));
      ctx.log('info', 'In-process restart: the storage client is closed and a new Mastra instance is built on the same file.');
      restart = 'in-process (new Mastra instance and storage client on the same file)';
      phases.push(await withInstance((wf) => inspect(ctx, wf, workflowRunId)));
      if (input.action === 'demo') {
        await withInstance(async (wf) => {
          if (input.checkpointStyle === 'suspend') {
            phases.push(await resume(ctx, wf, workflowRunId, input.documents!, 'resume'));
          } else {
            ctx.log('warn', 'Anti-pattern: “resuming” by starting a new run with the documents up front.');
            const rerun = await start(wf, lineage, 'rerun', input.documents!);
            workflowRunId = rerun.workflowRunId;
            phases.push(rerun);
          }
          phases.push(await resume(ctx, wf, workflowRunId, input.documents!, 'duplicate-resume'));
        });
      } else {
        ctx.log('info', `Workflow run ${workflowRunId} is suspended. Restart the API if you like, then resume it with this id.`);
      }
    } else if (input.action === 'inspect') {
      const p = await withInstance((wf) => inspect(ctx, wf, workflowRunId));
      lineage = (p as Phase & { lineage?: string }).lineage ?? workflowRunId;
      phases.push(p);
    } else {
      const p = await withInstance(async (wf) => {
        const found = await inspect(ctx, wf, workflowRunId);
        lineage = (found as Phase & { lineage?: string }).lineage ?? workflowRunId;
        return found.error ? { ...found, name: 'resume' as const } : resume(ctx, wf, workflowRunId, input.documents!, 'resume');
      });
      phases.push(p);
    }

    const entries = ledger.read(lineage);
    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, action: input.action },
    });
    return {
      action: input.action,
      checkpointStyle: input.action === 'demo' ? input.checkpointStyle : null,
      workflowRunId,
      lineage,
      restart,
      phases: phases.map(({ lineage: _l, ...p }: Phase & { lineage?: string }) => p),
      ledger: entries.map(({ op, workflowRunId: id, pid }) => ({ op, workflowRunId: id, pid })),
      sideEffectCounts: countOps(entries),
    };
  },

  validate(out) {
    const byName = (n: Phase['name']) => out.phases.find((p) => p.name === n);
    const started = byName('start');
    const inspected = byName('inspect');
    const completing = byName('resume') ?? byName('rerun');
    const dup = byName('duplicate-resume');
    const counts = out.sideEffectCounts;
    const preOps: SideEffect[] = ['account-created', 'fee-charged', 'request-drafted'];
    const checks: CheckResult[] = [];
    if (started) {
      const required = (started.suspendPayload as { required?: string[] } | undefined)?.required ?? [];
      checks.push({
        id: 'suspended-at-checkpoint',
        label: 'The workflow suspended at the documents checkpoint',
        passed: started.status === 'suspended' && required.length > 0,
        message: started.status === 'suspended' ? `waiting for ${required.join(', ')}` : `status ${started.status}`,
      });
    }
    if (inspected) {
      checks.push({
        id: 'snapshot-persisted',
        label: 'A fresh Mastra instance read the run back from storage as suspended',
        passed: inspected.status === 'suspended',
        message: inspected.error ? `${inspected.error.code}: ${inspected.error.message}` : `snapshot status ${inspected.status}`,
      });
    }
    if (completing) {
      const rerunSteps = completing.steps.filter((s) => (PRE_CHECKPOINT_STEPS as readonly string[]).includes(s));
      checks.push({
        id: 'resumed-from-checkpoint',
        label: 'The run continued from the checkpoint (no earlier step ran again)',
        passed: !completing.error && rerunSteps.length === 0 && (completing.status === 'success' || completing.status === 'suspended'),
        message: completing.error
          ? `${completing.error.code}: ${completing.error.message}`
          : rerunSteps.length
            ? `re-ran ${rerunSteps.join(', ')}`
            : `${completing.steps.join(' → ') || 'no step'} (${completing.status})`,
      });
      const dupOps = Object.entries(counts).filter(([, n]) => n > 1);
      checks.push({
        id: 'no-duplicate-side-effects',
        label: 'Every side effect happened at most once for this application',
        passed: dupOps.length === 0 && preOps.every((op) => counts[op] === 1),
        message: dupOps.length ? dupOps.map(([op, n]) => `${op} ×${n}`).join(', ') : Object.entries(counts).map(([op, n]) => `${op} ×${n}`).join(', '),
      });
    }
    if (dup) {
      checks.push({
        id: 'duplicate-resume-rejected',
        label: 'Resuming the completed run again was rejected',
        passed: dup.error?.code === 'NOT_SUSPENDED' || dup.error?.code === 'ALREADY_RESUMED',
        message: dup.error ? `${dup.error.code}: ${dup.error.message}` : `unexpectedly ${dup.status}`,
      });
    }
    return summarizeChecks(checks);
  },
};

async function runStart(
  ctx: RunContext<LabServices>,
  wf: Wf,
  o: { runId?: string; lineage: string; applicant: Applicant; prefilled?: SubmittedDocument[]; name: Phase['name'] },
): Promise<Phase> {
  const run = await wf.createRun({ ...(o.runId ? { runId: o.runId } : {}), resourceId: RESOURCE_ID });
  const res = await streamWorkflow(ctx as RunContext<unknown>, `${WORKFLOW_ID}#${o.name}`, run, {
    lineage: o.lineage,
    applicant: o.applicant,
    ...(o.prefilled ? { prefilledDocuments: o.prefilled } : {}),
  });
  const rec = res.stepRecords[CHECKPOINT_STEP] as { suspendPayload?: unknown } | undefined;
  const activation = ActivationSchema.safeParse(res.result);
  return {
    name: o.name,
    workflowRunId: run.runId,
    status: res.status,
    steps: res.steps.map((s) => s.stepId),
    ...(res.status === 'suspended' ? { suspendPayload: rec?.suspendPayload } : {}),
    ...(activation.success ? { activation: activation.data } : {}),
  };
}

async function inspect(ctx: RunContext<LabServices>, wf: Wf, runId: string): Promise<Phase & { lineage?: string }> {
  const snap = (await wf.getWorkflowRunById(runId)) as Snapshot | null;
  if (!snap) {
    ctx.log('warn', `No persisted run ${runId}.`);
    return { name: 'inspect', workflowRunId: runId, status: 'unknown', steps: [], error: { code: 'UNKNOWN_RUN', message: 'no persisted snapshot for this workflow run id' } };
  }
  const suspendedStep = Object.keys(snap.suspendedPaths ?? {})[0];
  ctx.log('info', `Snapshot read from storage: ${snap.status}${suspendedStep ? ` at ${suspendedStep}` : ''}.`);
  return {
    name: 'inspect',
    workflowRunId: runId,
    status: String(snap.status),
    steps: [],
    ...(suspendedStep ? { suspendPayload: snap.steps?.[suspendedStep]?.suspendPayload } : {}),
    ...(snap.payload?.lineage ? { lineage: snap.payload.lineage } : {}),
  };
}

async function resume(ctx: RunContext<LabServices>, wf: Wf, runId: string, documents: SubmittedDocument[], name: 'resume' | 'duplicate-resume'): Promise<Phase> {
  try {
    const run = await wf.createRun({ runId, resourceId: RESOURCE_ID });
    const res = await streamWorkflow(
      ctx as RunContext<unknown>,
      `${WORKFLOW_ID}#${name}`,
      { stream: () => run.resumeStream({ step: CHECKPOINT_STEP, resumeData: { documents } }), cancel: () => run.cancel() },
      { documents },
    );
    if (res.status === 'failed' && res.error) throw new Error(res.error);
    const rec = res.stepRecords[CHECKPOINT_STEP] as { suspendPayload?: unknown } | undefined;
    const activation = ActivationSchema.safeParse(res.result);
    return {
      name,
      workflowRunId: runId,
      status: res.status,
      steps: res.steps.map((s) => s.stepId),
      ...(res.status === 'suspended' ? { suspendPayload: rec?.suspendPayload } : {}),
      ...(activation.success ? { activation: activation.data } : {}),
    };
  } catch (e) {
    ctx.throwIfAborted();
    const message = (e instanceof Error ? e.message : String(e)).split('\n')[0]!.slice(0, 200);
    const code = classifyResumeError(message);
    ctx.log(name === 'duplicate-resume' ? 'info' : 'warn', `Resume rejected (${code}): ${message}`);
    return { name, workflowRunId: runId, status: 'rejected', steps: [], error: { code, message } };
  }
}
