import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type AgentConversation, type ConversationMessage, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { runTypedWorkflow, type StepTrace } from '../shared/workflow-stream.js';
import { AGENT_IDS, communicatorScript, diagnosticianScript, extractorScript, INSTRUCTIONS, type AgentId } from './agents.js';
import type { AttemptRecord } from './boundary.js';
import { lab54Definition } from './definition.js';
import { DiagnosisSchema, IncidentSchema, LOGS, OutcomeSchema, updateIssues, type Outcome } from './schemas.js';
import { buildIncidentWorkflow, FAULTS, WORKFLOW_ID, type Deps } from './workflow.js';

export const Lab54InputSchema = z.object({
  report: z.string().trim().min(10).max(2_000),
  fault: z.enum(FAULTS),
  stepRetries: z.number().int().min(0).max(3),
  repeatRuns: z.number().int().min(1).max(3),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab54Input = z.infer<typeof Lab54InputSchema>;

export interface RunRecord {
  workflowStatus: string;
  steps: { stepId: string; status: string; durationMs: number }[];
  attempts: AttemptRecord[];
  calls: Deps['calls'];
  outcome: Outcome | null;
  /** Structural trace: step, status, attempts and ok, in streamed order. Must be identical across runs. */
  signature: string;
  error: string | null;
}

export interface Lab54Output {
  runs: RunRecord[];
  /** The first run's outcome (the others are compared through their signatures). */
  outcome: Outcome | null;
  agentConversation: AgentConversation;
}

const AGENT_STEPS: Record<AgentId, string> = { extractor: 'extract', diagnostician: 'diagnose', communicator: 'communicate' };

export function signatureOf(steps: readonly StepTrace[], attempts: readonly AttemptRecord[], outcome: Outcome | null): string {
  return steps
    .filter((s) => s.stepId !== WORKFLOW_ID)
    .map((s) => {
      const a = attempts.filter((x) => x.stepId === s.stepId);
      return a.length ? `${s.stepId}:${s.status}:${a.length}:${a.at(-1)!.ok ? 'ok' : a.at(-1)!.code}` : `${s.stepId}:${s.status}`;
    })
    .concat(`outcome:${outcome?.status ?? 'none'}`)
    .join(' | ');
}

export const lab54: LabImplementation<Lab54Input, Lab54Output, LabServices> = {
  definition: lab54Definition as LabDefinition,
  inputSchema: Lab54InputSchema,

  async run(ctx, input) {
    const scripts = { extractor: extractorScript(), diagnostician: diagnosticianScript(), communicator: communicatorScript() };
    const resolved = AGENT_IDS.map(
      (id) => [id, ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: scripts[id] })] as const,
    );
    const agents = Object.fromEntries(
      resolved.map(([id, m]) => [
        id,
        withLabLogger(ctx, new Agent({ id, name: id, instructions: INSTRUCTIONS[id], model: m.model })),
      ]),
    ) as Deps['agents'];

    const messages: ConversationMessage[] = [];
    const runs: RunRecord[] = [];
    for (let i = 0; i < input.repeatRuns; i++) {
      ctx.log('info', `Run ${i + 1}/${input.repeatRuns}`);
      const attempts: AttemptRecord[] = [];
      const calls: Deps['calls'] = [];
      // The transcript shows the first run; the others are compared through their trace signatures.
      const post: Deps['post'] = (m) => {
        if (i === 0) messages.push({ seq: messages.length + 1, ...m });
      };
      const workflow = buildIncidentWorkflow({
        ctx,
        agents,
        fault: input.fault,
        maxRetries: input.stepRetries,
        record: (a) => attempts.push(a),
        calls,
        post,
      });
      const res = await runTypedWorkflow(ctx, WORKFLOW_ID, await workflow.createRun(), { report: input.report }, OutcomeSchema);
      runs.push({
        workflowStatus: res.status,
        steps: res.steps
          .filter((s) => s.stepId !== WORKFLOW_ID)
          .map((s) => ({ stepId: s.stepId, status: s.status, durationMs: s.durationMs })),
        attempts,
        calls,
        outcome: res.typed,
        signature: signatureOf(res.steps, attempts, res.typed),
        error: res.error ?? null,
      });
      ctx.log('info', `signature ${i + 1}: ${runs.at(-1)!.signature}`);
    }
    ctx.setResultExtras({
      effective: {
        mode: ctx.mode,
        modelId: input.modelId,
        simulated: resolved[0]![1].simulated,
        stepRetries: input.stepRetries,
        repeatRuns: input.repeatRuns,
      },
    });

    const outcome = runs[0]!.outcome;
    if (outcome?.status === 'complete' || outcome?.status === 'degraded')
      messages.push({
        seq: messages.length + 1,
        from: 'workflow',
        to: 'status-page',
        kind: 'final',
        stepId: 'assemble',
        round: null,
        summary: outcome.status === 'complete' ? 'Update published' : 'Update published without a diagnosis (degraded)',
        content: outcome.update ?? '',
      });
    if (outcome?.status !== 'complete')
      messages.push({
        seq: messages.length + 1,
        from: 'workflow',
        to: 'human',
        kind: 'escalation',
        stepId: 'assemble',
        round: null,
        summary: outcome ? `Status ${outcome.status}: needs an on-call engineer` : 'The workflow failed',
        content: (outcome?.failures ?? []).map((f) => `${f.stepId}: ${f.code}`).join('\n') || (runs[0]!.error ?? ''),
      });

    return {
      runs,
      outcome,
      agentConversation: {
        agents: [
          {
            id: 'workflow',
            name: 'Workflow (typed steps)',
            role: 'Fixes the order, validates every hand-over, retries and contains failures',
            tools: [],
          },
          { id: 'extractor', name: 'Extractor agent', role: 'Report → typed Incident', tools: [] },
          { id: 'diagnostician', name: 'Diagnostician agent', role: 'Incident + logs → typed Diagnosis', tools: [] },
          { id: 'communicator', name: 'Communicator agent', role: 'Incident + Diagnosis → public update', tools: [] },
        ],
        messages,
        outcome: {
          status: outcome?.status === 'complete' ? 'published' : outcome ? 'needs-human' : 'failed',
          text: outcome?.update ?? '',
          issues: (outcome?.failures ?? []).map((f) => `${f.stepId}: ${f.code}`),
        },
      },
    };
  },

  validate(out, input) {
    const first = out.runs[0]!;
    const o = first.outcome;

    // Agents run in the fixed order, and the later agents run only when the extraction succeeded.
    const order = first.calls.map((c) => c.agent).filter((a, i, all) => all.indexOf(a) === i);
    const extracted = !!o?.incident;
    const coordinatedOk =
      out.runs.every((r) => r.workflowStatus === 'success') &&
      JSON.stringify(order) === JSON.stringify(extracted ? AGENT_IDS : ['extractor']) &&
      first.calls.every((c) => c.stepId === AGENT_STEPS[c.agent]);

    // Values that crossed a boundary match their schemas and the cross-step rules.
    const logIds = new Set(o?.incident ? LOGS[o.incident.service].map((l) => l.id) : []);
    const typedOk =
      !!o &&
      (o.incident === null || IncidentSchema.safeParse(o.incident).success) &&
      (o.diagnosis === null ||
        (DiagnosisSchema.safeParse(o.diagnosis).success && o.diagnosis.evidence.every((e) => logIds.has(e)))) &&
      (o.update === null || (!!o.incident && updateIssues(o.update, o.incident.service).length === 0)) &&
      first.attempts.filter((a) => a.code === 'OUTPUT_SCHEMA_INVALID').every((a) => !a.ok);

    // At most retries + 1 attempts per step; a failed attempt is followed by another unless retries are exhausted;
    // backoff doubles from 100 ms.
    const perStep = ['extract', 'diagnose', 'communicate'].map((id) => first.attempts.filter((a) => a.stepId === id));
    const retryOk = perStep.every(
      (a) =>
        a.length <= input.stepRetries + 1 &&
        a.every((x, i) => x.attempt === i + 1 && x.backoffMs === (i === 0 ? 0 : 100 * 2 ** (i - 1))) &&
        a.slice(0, -1).every((x) => !x.ok) &&
        (a.length === 0 || a.at(-1)!.ok || a.length === input.stepRetries + 1),
    );
    const diag = perStep[1]!;
    const faultRetryOk =
      input.fault === 'transient-diagnosis'
        ? input.stepRetries >= 2
          ? diag.length === 3 && diag[2]!.ok
          : o?.status === 'degraded'
        : input.fault === 'invalid-extraction'
          ? input.stepRetries >= 1
            ? perStep[0]![0]?.code === 'OUTPUT_SCHEMA_INVALID' && !!perStep[0]!.at(-1)?.ok
            : o?.status === 'failed-safe'
          : true;

    const expected =
      input.fault === 'extract-down' || (input.fault === 'invalid-extraction' && input.stepRetries === 0)
        ? 'failed-safe'
        : input.fault === 'permanent-diagnosis' || (input.fault === 'transient-diagnosis' && input.stepRetries < 2)
          ? 'degraded'
          : 'complete';
    const boundaryOk =
      out.runs.every((r) => r.workflowStatus === 'success' && r.error === null) &&
      o?.status === expected &&
      (o.status !== 'failed-safe' || o.update === null);

    const signatures = new Set(out.runs.map((r) => r.signature));
    return summarizeChecks([
      {
        id: 'agents-coordinated',
        label:
          'The agents run in the fixed order extractor → diagnostician → communicator, each only when its typed input exists',
        passed: coordinatedOk,
        message: `agent order: ${order.join(' → ') || 'none'}`,
      },
      {
        id: 'typed-boundaries',
        label: 'Every value passed between steps matches its schema and the cross-step rules',
        passed: typedOk,
        message: o
          ? `incident ${o.incident ? 'valid' : 'none'}, diagnosis ${o.diagnosis ? 'valid' : 'none'}, update ${o.update ? 'valid' : 'none'}`
          : 'no outcome',
      },
      {
        id: 'retry-behavior',
        label: 'Failed attempts are retried with doubling backoff, up to the retry limit',
        passed: retryOk && faultRetryOk,
        message: perStep
          .map(
            (a, i) =>
              `${['extract', 'diagnose', 'communicate'][i]}: ${a.map((x) => (x.ok ? 'ok' : x.code)).join(', ') || 'not run'}`,
          )
          .join('; '),
      },
      {
        id: 'error-boundaries',
        label: 'Failures are contained: the workflow succeeds with the expected complete, degraded or failed-safe status',
        passed: boundaryOk,
        message: `status ${o?.status ?? 'none'} (expected ${expected})`,
      },
      {
        id: 'stable-trace',
        label: 'Repeated runs of the same input produce the same step trace',
        passed: signatures.size === 1,
        message: signatures.size === 1 ? `${out.runs.length} run(s): ${first.signature}` : [...signatures].join(' ≠ '),
      },
    ]);
  },
};
