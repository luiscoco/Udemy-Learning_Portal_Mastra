import type { ZodType } from 'zod';
import type { RunContext } from '@mlp/lab-engine';

/** One step as it actually ran (from the workflow stream, not from assumptions). */
export interface StepTrace {
  stepId: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface WorkflowRunResult<T = unknown> {
  status: string;
  result: T | undefined;
  stepExecutionPath: string[];
  steps: StepTrace[];
  error?: string;
}

/** Minimal structural view of a Mastra workflow run (createRun() result). */
interface RunLike {
  stream(args: { inputData?: unknown }): {
    fullStream: AsyncIterable<{ type: string; payload?: unknown }>;
    result: PromiseLike<unknown>;
  };
  cancel(): Promise<void>;
}

/**
 * Streams a Mastra workflow run into lab events. Verified chunk types (installed Mastra):
 * workflow-start { workflowId }, workflow-step-start { id, payload }, workflow-step-result { id, status,
 * output }, workflow-finish { workflowStatus }. Cancelling the lab run cancels the workflow run.
 */
export async function streamWorkflow<T = unknown>(
  ctx: RunContext<unknown>,
  workflowId: string,
  run: RunLike,
  inputData: unknown,
): Promise<WorkflowRunResult<T>> {
  const onAbort = () => void run.cancel().catch(() => {});
  ctx.signal.addEventListener('abort', onAbort, { once: true });
  const started = new Map<string, number>();
  const steps: StepTrace[] = [];
  const t0 = Date.now();
  try {
    const stream = run.stream({ inputData });
    for await (const chunk of stream.fullStream) {
      const p = (chunk.payload ?? {}) as Record<string, unknown>;
      const id = String(p.id ?? p.stepName ?? '');
      switch (chunk.type) {
        case 'workflow-start':
          ctx.emit({ type: 'workflow-step', workflowId, stepId: workflowId, status: 'running', input: inputData });
          break;
        case 'workflow-step-start':
          started.set(id, Date.now());
          ctx.emit({ type: 'workflow-step', workflowId, stepId: id, status: 'running', input: p.payload });
          break;
        case 'workflow-step-result': {
          const durationMs = Date.now() - (started.get(id) ?? Date.now());
          const ok = p.status === 'success';
          const error = p.error ? String((p.error as { message?: string }).message ?? p.error) : undefined;
          steps.push({
            stepId: id,
            status: String(p.status ?? 'unknown'),
            input: undefined,
            output: p.output,
            ...(error ? { error } : {}),
            durationMs,
          });
          ctx.emit({
            type: 'workflow-step',
            workflowId,
            stepId: id,
            status: ok ? 'success' : p.status === 'suspended' ? 'suspended' : 'failed',
            output: ok ? p.output : { error },
            durationMs,
          });
          break;
        }
        case 'workflow-finish': {
          const status = String(p.workflowStatus ?? 'unknown');
          ctx.emit({
            type: 'workflow-step',
            workflowId,
            stepId: workflowId,
            status: status === 'success' ? 'success' : status === 'suspended' ? 'suspended' : 'failed',
            durationMs: Date.now() - t0,
          });
          break;
        }
        default:
          break;
      }
    }
    ctx.throwIfAborted();
    const final = (await stream.result) as {
      status: string;
      result?: T;
      stepExecutionPath?: string[];
      error?: { message?: string } | string;
    };
    return {
      status: final.status,
      result: final.result,
      stepExecutionPath: final.stepExecutionPath ?? steps.map((s) => s.stepId),
      steps,
      ...(final.error
        ? { error: typeof final.error === 'string' ? final.error : String(final.error.message ?? final.error) }
        : {}),
    };
  } finally {
    ctx.signal.removeEventListener('abort', onAbort);
  }
}

export interface TypedRunResult<T> extends WorkflowRunResult<unknown> {
  /** True when the final result passed the workflow's outputSchema (checked by this app, not by Mastra). */
  outputValid: boolean;
  outputIssues: { path: string; message: string }[];
  typed: T | null;
}

/**
 * Runs a workflow and validates its final result against the output schema. Mastra validates workflow
 * INPUT at runtime but not step/workflow OUTPUT (verified on 1.78.0), so this app-level check is what
 * makes "typed output" true at runtime.
 */
export async function runTypedWorkflow<T>(
  ctx: RunContext<unknown>,
  workflowId: string,
  run: RunLike,
  inputData: unknown,
  outputSchema: ZodType<T>,
): Promise<TypedRunResult<T>> {
  const res = await streamWorkflow(ctx, workflowId, run, inputData);
  if (res.status !== 'success') return { ...res, outputValid: false, outputIssues: [], typed: null };
  const parsed = outputSchema.safeParse(res.result);
  if (parsed.success) return { ...res, outputValid: true, outputIssues: [], typed: parsed.data };
  const outputIssues = parsed.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
  for (const i of outputIssues) ctx.log('error', `Workflow output does not match its schema: ${i.path}: ${i.message}`);
  return { ...res, outputValid: false, outputIssues, typed: null };
}
