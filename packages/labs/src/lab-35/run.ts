import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { classifyResumeError } from '../shared/resume.js';
import { streamWorkflow } from '../shared/workflow-stream.js';
import { lab35Definition } from './definition.js';
import { BRANCH_STEPS, openProcess, ReportSchema, REVIEW_STEP, WORKFLOW_ID, type AuditEntry, type Report } from './process.js';
import { checkControls, MAX_ATTEMPTS, ReviewAttemptSchema, VendorCaseSchema, type Branch, type ReviewAttempt } from './rules.js';

export const STORE_NAME = 'lab-35-workflows';
const RESOURCE_ID = 'learner';

const BRANCHES = ['auto-approved', 'approved', 'rejected', 'blocked', 'pending-review'] as const;

export const Lab35InputSchema = z.object({
  cases: z
    .array(
      VendorCaseSchema.extend({
        reviewAttempts: z.array(ReviewAttemptSchema).max(MAX_ATTEMPTS),
        expectBranch: z.enum(BRANCHES),
      }),
    )
    .min(1)
    .max(4)
    .refine((c) => new Set(c.map((x) => x.caseId)).size === c.length, { message: 'caseId values must be unique' }),
  controls: z.enum(['enforced', 'disabled']),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab35Input = z.infer<typeof Lab35InputSchema>;

export interface CaseOutcome {
  caseId: string;
  requestedBy: string;
  workflowRunId: string;
  expectBranch: Branch;
  /** Final branch from the report, or awaiting-review when attempts ran out of input while still suspended. */
  branch: Branch | 'awaiting-review' | 'error';
  /** Step results in the order Mastra reported them, across the start and every resume. */
  trace: string[];
  report: Report | null;
  audit: AuditEntry[];
  error?: string;
}

export interface Lab35Output {
  controls: Lab35Input['controls'];
  cases: CaseOutcome[];
}

export function summarizeOffline(r: Omit<Report, 'summary'>) {
  const who = r.decision ? `${r.decision.reviewer} (${r.decision.role})` : 'policy';
  return `${r.vendor}: ${r.level} risk (score ${r.score}); outcome ${r.branch}, decided by ${who}.`;
}
export function offlineScript() {
  return (v: PromptView): ScriptedTurn => ({ text: summarizeOffline(JSON.parse(v.lastUser) as Omit<Report, 'summary'>) });
}

type Wf = ReturnType<typeof openProcess>['workflow'];

export const lab35: LabImplementation<Lab35Input, Lab35Output, LabServices> = {
  definition: lab35Definition as LabDefinition,
  inputSchema: Lab35InputSchema,

  async run(ctx, input) {
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript() });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'due-diligence-reporter',
        name: 'Due Diligence Reporter',
        instructions:
          'Write a two-sentence summary of a vendor due-diligence case for the file, from the JSON you receive (vendor, level, score, factors, branch, decision). State the outcome and who decided. Do not add facts that are not in the JSON.',
        model: resolved.model,
      }),
    );
    const audit: AuditEntry[] = [];
    const deps = {
      controls: input.controls,
      audit,
      summarize: async (r: Omit<Report, 'summary'>) => (await agent.generate(JSON.stringify(r), { abortSignal: ctx.signal })).text.trim(),
    };
    const withInstance = async <T>(fn: (wf: Wf) => Promise<T>): Promise<T> => {
      const opened = await ctx.services.memory.open(STORE_NAME);
      try {
        return await fn(openProcess(opened.storage, deps).workflow);
      } finally {
        await opened.close();
      }
    };
    if (input.controls === 'disabled') ctx.log('warn', 'Reviewer controls are disabled (anti-pattern): every attempt is accepted.');

    const outcomes: CaseOutcome[] = [];
    // Phase 1: intake → research → risk review → branch. Medium and high cases suspend for review.
    await withInstance(async (wf) => {
      for (const c of input.cases) {
        ctx.throwIfAborted();
        const { reviewAttempts: _a, expectBranch, ...vendorCase } = c;
        const run = await wf.createRun({ resourceId: RESOURCE_ID });
        const res = await streamWorkflow(ctx as RunContext<unknown>, `${WORKFLOW_ID}#${c.caseId}`, run, vendorCase);
        const o: CaseOutcome = { caseId: c.caseId, requestedBy: c.requestedBy, workflowRunId: run.runId, expectBranch, branch: 'awaiting-review', trace: res.steps.map((s) => s.stepId), report: null, audit: [] };
        settle(o, res.status, res.result, res.error);
        outcomes.push(o);
      }
    });
    // Phase 2: reviewers act later, on a fresh instance (the waiting cases are in storage).
    await withInstance(async (wf) => {
      for (const o of outcomes.filter((x) => x.branch === 'awaiting-review')) {
        const attempts = input.cases.find((c) => c.caseId === o.caseId)!.reviewAttempts;
        for (const attempt of attempts) {
          if (o.branch !== 'awaiting-review') break;
          try {
            const run = await wf.createRun({ runId: o.workflowRunId, resourceId: RESOURCE_ID });
            const res = await streamWorkflow(
              ctx as RunContext<unknown>,
              `${WORKFLOW_ID}#${o.caseId} (review by ${attempt.reviewer})`,
              { stream: () => run.resumeStream({ step: REVIEW_STEP, resumeData: attempt }), cancel: () => run.cancel() },
              attempt,
            );
            o.trace.push(...res.steps.map((s) => s.stepId));
            settle(o, res.status, res.result, res.error);
          } catch (e) {
            const message = (e instanceof Error ? e.message : String(e)).split('\n')[0]!.slice(0, 200);
            o.branch = 'error';
            o.error = `${classifyResumeError(message)}: ${message}`;
          }
          const last = audit.filter((a) => a.caseId === o.caseId).at(-1);
          if (last)
            ctx.log(
              last.accepted ? 'info' : 'warn',
              `${o.caseId}: ${last.reviewer} (${last.role}) ${last.decision} → ${last.accepted ? 'accepted' : `refused: ${last.violations.join(', ')}`}`,
            );
        }
        if (o.branch === 'awaiting-review') ctx.log('info', `${o.caseId}: still waiting for a valid review (no attempts left in the input).`);
      }
    });
    for (const o of outcomes) o.audit = audit.filter((a) => a.caseId === o.caseId);

    ctx.setResultExtras({ effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, controls: input.controls } });
    return { controls: input.controls, cases: outcomes };
  },

  validate(out) {
    const wrong = out.cases.filter((c) => c.branch !== c.expectBranch);
    const acceptedWithViolations = out.cases.flatMap((c) => c.audit.filter((a) => a.accepted && a.violations.length > 0));
    const refusedSilently = out.cases.flatMap((c) => c.audit.filter((a) => !a.accepted && a.violations.length === 0));
    const unsafeAccepted = out.controls === 'disabled' ? out.cases.flatMap((c) => c.audit.filter((a) => a.accepted && violatesWhenEnforced(c, a))) : [];
    const unreviewed = out.cases.filter((c) => {
      const accepted = c.audit.filter((a) => a.accepted);
      if (c.branch === 'approved' || c.branch === 'rejected') return accepted.length !== 1;
      if (c.branch === 'auto-approved') return c.report?.level !== 'low' || c.audit.length > 0;
      if (c.branch === 'blocked') return c.report?.level !== 'blocked' || c.audit.length > 0;
      return accepted.length > 0;
    });
    const badTrace = out.cases.filter((c) => !traceComplete(c));
    const badReport = out.cases.filter(
      (c) => !c.report || !c.report.summary || c.report.factors === undefined || (['approved', 'rejected'].includes(c.report.branch) && !c.report.decision),
    );
    return summarizeChecks([
      {
        id: 'correct-branch',
        label: 'Every case ended on its expected branch',
        passed: wrong.length === 0,
        message: wrong.length ? wrong.map((c) => `${c.caseId}: ${c.branch} ≠ ${c.expectBranch}${c.error ? ` (${c.error})` : ''}`).join('; ') : out.cases.map((c) => `${c.caseId}: ${c.branch}`).join(', '),
      },
      {
        id: 'reviewer-controls-enforced',
        label: 'No decision was accepted in breach of the reviewer controls',
        passed: acceptedWithViolations.length === 0 && refusedSilently.length === 0 && unsafeAccepted.length === 0,
        message: unsafeAccepted.length
          ? `controls disabled: accepted ${unsafeAccepted.map((a) => `${a.caseId} by ${a.reviewer} (${a.role})`).join(', ')}`
          : `${out.cases.reduce((n, c) => n + c.audit.filter((a) => !a.accepted).length, 0)} attempt(s) refused with a named control`,
      },
      {
        id: 'no-unreviewed-decision',
        label: 'Only low risk was approved without a reviewer; reviewed cases have exactly one accepted decision',
        passed: unreviewed.length === 0,
        message: unreviewed.length ? `inconsistent: ${unreviewed.map((c) => c.caseId).join(', ')}` : 'consistent for every case',
      },
      {
        id: 'trace-complete',
        label: 'Each case’s trace shows intake, research, risk review, its branch and the report, in order',
        passed: badTrace.length === 0,
        message: badTrace.length ? `incomplete for ${badTrace.map((c) => c.caseId).join(', ')}` : `${out.cases.length} complete trace(s)`,
      },
      {
        id: 'report-complete',
        label: 'Every case has a report with findings, decision and a summary',
        passed: badReport.length === 0,
        message: badReport.length ? `missing for ${badReport.map((c) => c.caseId).join(', ')}` : 'all reports complete',
      },
    ]);
  },
};

function settle(o: CaseOutcome, status: string, result: unknown, error?: string) {
  if (status === 'suspended') return;
  const parsed = ReportSchema.safeParse(result);
  if (status === 'success' && parsed.success) {
    o.report = parsed.data;
    o.branch = parsed.data.branch;
  } else {
    o.branch = 'error';
    o.error = error ?? `workflow ${status}`;
  }
}

/** Re-evaluates an accepted attempt with the controls on (exposes the disabled-controls contrast). */
function violatesWhenEnforced(c: CaseOutcome, a: AuditEntry) {
  const level = c.report?.level;
  if (level !== 'medium' && level !== 'high') return false;
  return checkControls(c.requestedBy, level, a as unknown as ReviewAttempt).length > 0;
}

function traceComplete(c: CaseOutcome) {
  const t = c.trace;
  const at = (id: string) => t.indexOf(id);
  const branchStep = BRANCH_STEPS.find((s) => t.includes(s));
  if (!branchStep) return false;
  const research = ['registryLookup', 'sanctionsScreen', 'mediaScan'].map(at);
  return (
    at('intake') === 0 &&
    research.every((i) => i > 0 && i < at('riskReview')) &&
    at('riskReview') < at(branchStep) &&
    t.lastIndexOf('report') === t.length - 1 &&
    t.lastIndexOf(branchStep) < t.lastIndexOf('report')
  );
}
