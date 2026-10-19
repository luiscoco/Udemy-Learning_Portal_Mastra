import { z } from 'zod';
import type { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { ConversationMessage } from '@mlp/contracts';
import type { RunContext } from '@mlp/lab-engine';
import { prompts, type AgentId } from './agents.js';
import { runBoundary, StepError, type AttemptRecord } from './boundary.js';
import {
  DiagnosisSchema,
  IncidentSchema,
  LOGS,
  OutcomeSchema,
  PipelineSchema,
  UpdateSchema,
  updateIssues,
  type Diagnosis,
  type Incident,
  type Pipeline,
  type Result,
} from './schemas.js';

export const FAULTS = ['none', 'invalid-extraction', 'transient-diagnosis', 'permanent-diagnosis', 'extract-down'] as const;
export type Fault = (typeof FAULTS)[number];
export const WORKFLOW_ID = 'incident-workflow';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = Agent<any, any, any, any, any>;

export interface Deps {
  ctx: RunContext<unknown>;
  agents: Record<AgentId, AnyAgent>;
  fault: Fault;
  maxRetries: number;
  record: (a: AttemptRecord) => void;
  /** Agent calls actually made, in order (evidence for the coordination check). */
  calls: { agent: AgentId; stepId: string; attempt: number }[];
  post: (m: Omit<ConversationMessage, 'seq'>) => void;
}

const skipped = <T>(): Result<T> => ({
  ok: false,
  error: { code: 'SKIPPED_UPSTREAM', message: 'the extraction failed' },
  attempts: 0,
});
const outage = () => new StepError('PROVIDER_503', 'simulated provider outage (503)', true);

/**
 * extract → fetch-logs → diagnose → communicate → assemble. Every step is typed; agent steps run inside an
 * error boundary with Mastra retries, and pass on a Result instead of throwing past the boundary.
 */
export function buildIncidentWorkflow(d: Deps) {
  const { ctx } = d;
  const agentStep = <T>(
    stepId: string,
    agent: AgentId,
    retryCount: number,
    schema: z.ZodType<T>,
    prompt: string,
    attempt: () => Promise<unknown>,
    injected = false,
  ) => {
    const n = retryCount + 1;
    d.post({
      from: 'workflow',
      to: agent,
      kind: 'task',
      stepId,
      round: n,
      summary: n === 1 ? `Attempt 1` : `Retry ${retryCount} (attempt ${n})`,
      content: prompt,
    });
    return runBoundary({
      stepId,
      retryCount,
      maxRetries: d.maxRetries,
      schema,
      signal: ctx.signal,
      injected,
      record: (a) => {
        d.record(a);
        ctx.emit({
          type: 'workflow-step',
          workflowId: WORKFLOW_ID,
          stepId: `${stepId} attempt ${a.attempt}`,
          status: a.ok ? 'success' : 'failed',
          output: a.ok ? { backoffMs: a.backoffMs } : { code: a.code, simulated: a.simulated, backoffMs: a.backoffMs },
          durationMs: a.durationMs,
        });
        d.post({
          from: agent,
          to: 'workflow',
          kind: 'result',
          stepId,
          round: a.attempt,
          summary: a.ok
            ? `Attempt ${a.attempt} succeeded (validated)`
            : `Attempt ${a.attempt} failed: ${a.code}${a.simulated ? ' (simulated fault)' : ''}${a.attempt <= d.maxRetries ? ', retrying' : ', retries exhausted'}`,
          content: a.ok ? '(see the step output)' : (a.message ?? ''),
        });
      },
      attempt: async () => {
        d.calls.push({ agent, stepId, attempt: n });
        return attempt();
      },
    });
  };

  const extract = createStep({
    id: 'extract',
    description: 'The extractor turns the report into a typed Incident.',
    inputSchema: z.object({ report: z.string() }),
    outputSchema: PipelineSchema,
    retries: d.maxRetries,
    execute: async ({ inputData, retryCount }) => {
      const prompt = prompts.extract(inputData.report);
      const injected = d.fault === 'invalid-extraction' && retryCount === 0;
      const incident = await agentStep<Incident>(
        'extract',
        'extractor',
        retryCount ?? 0,
        IncidentSchema,
        prompt,
        async () => {
          if (d.fault === 'extract-down') throw outage();
          const r = await d.agents.extractor.generate(prompt, {
            structuredOutput: { schema: IncidentSchema },
            abortSignal: ctx.signal,
          });
          // Fault injection: the first answer is corrupted in transit; the boundary's validation must catch it.
          return injected ? { ...(r.object as object), severity: 'urgent!!' } : r.object;
        },
        injected,
      );
      return { report: inputData.report, incident, logs: null, diagnosis: null, update: null };
    },
  });

  const fetchLogs = createStep({
    id: 'fetch-logs',
    description: 'Deterministic: reads the logs of the extracted service (no agent decides this).',
    inputSchema: PipelineSchema,
    outputSchema: PipelineSchema,
    execute: async ({ inputData: s }) => ({ ...s, logs: s.incident.ok ? LOGS[s.incident.value.service] : null }),
  });

  const diagnose = createStep({
    id: 'diagnose',
    description: 'The diagnostician explains the likely cause, citing log line ids.',
    inputSchema: PipelineSchema,
    outputSchema: PipelineSchema,
    retries: d.maxRetries,
    execute: async ({ inputData: s, retryCount }) => {
      if (!s.incident.ok || !s.logs) return { ...s, diagnosis: skipped<Diagnosis>() };
      const incident = s.incident.value;
      const logs = s.logs;
      const rc = retryCount ?? 0;
      const prompt = prompts.diagnose(incident, logs);
      const injected = d.fault === 'permanent-diagnosis' || (d.fault === 'transient-diagnosis' && rc < 2);
      const diagnosis = await agentStep<Diagnosis>('diagnose', 'diagnostician', rc, DiagnosisSchema, prompt, async () => {
        if (injected) throw outage();
        const r = await d.agents.diagnostician.generate(prompt, {
          structuredOutput: { schema: DiagnosisSchema },
          abortSignal: ctx.signal,
        });
        const value = DiagnosisSchema.parse(r.object);
        const ids = new Set(logs.map((l) => l.id));
        const unknown = value.evidence.filter((e) => !ids.has(e));
        if (unknown.length)
          throw new StepError('EVIDENCE_NOT_IN_LOGS', `evidence ${unknown.join(', ')} is not among the fetched logs`);
        return value;
      });
      return { ...s, diagnosis };
    },
  });

  const communicate = createStep({
    id: 'communicate',
    description: 'The communicator writes the public update from the typed incident and diagnosis.',
    inputSchema: PipelineSchema,
    outputSchema: PipelineSchema,
    retries: d.maxRetries,
    execute: async ({ inputData: s, retryCount }) => {
      if (!s.incident.ok) return { ...s, update: skipped<string>() };
      const incident = s.incident.value;
      const diagnosis = s.diagnosis?.ok ? s.diagnosis.value : null;
      const prompt = prompts.communicate(incident, diagnosis);
      const update = await agentStep<string>('communicate', 'communicator', retryCount ?? 0, UpdateSchema, prompt, async () => {
        const r = await d.agents.communicator.generate(prompt, { abortSignal: ctx.signal });
        const text = r.text.trim();
        const issues = updateIssues(text, incident.service);
        if (issues.length) throw new StepError('UPDATE_INVALID', issues.join('; '));
        return text;
      });
      return { ...s, update };
    },
  });

  const assemble = createStep({
    id: 'assemble',
    description: 'Deterministic: decides the final status from the typed results.',
    inputSchema: PipelineSchema,
    outputSchema: OutcomeSchema,
    execute: async ({ inputData: s }) => assembleOutcome(s),
  });

  return createWorkflow({ id: WORKFLOW_ID, inputSchema: z.object({ report: z.string() }), outputSchema: OutcomeSchema })
    .then(extract)
    .then(fetchLogs)
    .then(diagnose)
    .then(communicate)
    .then(assemble)
    .commit();
}

/** complete: all three agents succeeded; degraded: published without a diagnosis; failed-safe: nothing published. */
export function assembleOutcome(s: Pipeline) {
  const failures = (
    [
      ['extract', s.incident],
      ['diagnose', s.diagnosis],
      ['communicate', s.update],
    ] as const
  ).flatMap(([stepId, r]) => (r && !r.ok ? [{ stepId, code: r.error.code }] : []));
  const incident = s.incident.ok ? s.incident.value : null;
  const diagnosis = s.diagnosis?.ok ? s.diagnosis.value : null;
  const update = s.update?.ok ? s.update.value : null;
  const status = !incident || !update ? 'failed-safe' : diagnosis ? 'complete' : 'degraded';
  return { status, incident, diagnosis, update: status === 'failed-safe' ? null : update, failures } as const;
}
