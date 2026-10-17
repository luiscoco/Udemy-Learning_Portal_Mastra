import type { Agent } from '@mastra/core/agent';
import type { RunContext } from '@mlp/lab-engine';
import { usageOf } from './agent-kit.js';

export interface ToolTrace {
  toolCallId: string;
  toolName: string;
  args: unknown;
  /**
   * success = tool ran; invalid = Mastra rejected the input before execute();
   * error = execute threw or tool unknown; denied = a human declined the approval request.
   */
  status: 'success' | 'invalid' | 'error' | 'denied';
  result?: unknown;
  error?: string;
  durationMs: number;
}

export interface PendingApproval {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface AgentRunResult {
  text: string;
  tools: ToolTrace[];
  /** Tool calls suspended by `requireApproval`, waiting for approveToolCall / declineToolCall. */
  pendingApprovals: PendingApproval[];
  runId: string | null;
  finishReason: string | null;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

/** The subset of agent.stream() options the labs use (passed through unchanged). */
export interface StreamOptions {
  maxSteps?: number;
  requestContext?: unknown;
  toolChoice?: unknown;
  activeTools?: string[];
  [key: string]: unknown;
}

/** Minimal shape of a Mastra stream output (agent.stream / approveToolCall / declineToolCall). */
interface StreamLike {
  fullStream: AsyncIterable<{ type: string; payload?: unknown }>;
  finishReason: PromiseLike<string | undefined | null>;
  usage: PromiseLike<{ inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null } | undefined>;
  runId?: string;
}

/**
 * Mirrors a Mastra stream into lab events: text deltas → `token`, tool calls → `tool-start` /
 * `tool-finish` with measured durations, approval requests → a suspended workflow step.
 * Verified chunk shapes (installed Mastra): tool-call / tool-call-approval { toolCallId, toolName, args },
 * tool-result { …, result } (input validation failures arrive as result { error: true, message }),
 * tool-error { …, error }, tool-output-denied { toolCallId, toolName } after declineToolCall.
 */
export async function consumeStream(
  ctx: RunContext<unknown>,
  stream: StreamLike,
  options: { emitTokens?: boolean; startedAt?: Map<string, number> } = {},
): Promise<AgentRunResult> {
  const { emitTokens = true } = options;
  const started = options.startedAt ?? new Map<string, number>();
  const tools: ToolTrace[] = [];
  const pendingApprovals: PendingApproval[] = [];
  let text = '';
  const since = (id: string) => Date.now() - (started.get(id) ?? Date.now());

  for await (const chunk of stream.fullStream) {
    const p = (chunk.payload ?? {}) as Record<string, unknown>;
    const id = String(p.toolCallId ?? '');
    const toolName = String(p.toolName ?? '');
    switch (chunk.type) {
      case 'text-delta': {
        const delta = String(p.text ?? '');
        text += delta;
        if (emitTokens && delta) ctx.emit({ type: 'token', text: delta });
        break;
      }
      case 'tool-call': {
        started.set(id, Date.now());
        ctx.emit({ type: 'tool-start', toolCallId: id, toolName, args: p.args });
        break;
      }
      case 'tool-call-approval': {
        pendingApprovals.push({ toolCallId: id, toolName, args: p.args });
        ctx.emit({
          type: 'workflow-step',
          stepId: `approval-${toolName}`,
          status: 'suspended',
          input: { toolCallId: id, args: p.args },
        });
        break;
      }
      case 'tool-result': {
        const result = p.result as { error?: boolean; message?: string } | undefined;
        const invalid = Boolean(result && typeof result === 'object' && result.error === true);
        const trace: ToolTrace = {
          toolCallId: id,
          toolName,
          args: p.args,
          status: invalid ? 'invalid' : 'success',
          ...(invalid ? { error: String(result?.message ?? 'Invalid tool input') } : { result }),
          durationMs: since(id),
        };
        tools.push(trace);
        ctx.emit({
          type: 'tool-finish',
          toolCallId: id,
          toolName,
          status: invalid ? 'error' : 'success',
          ...(invalid ? { error: trace.error } : { result }),
          durationMs: trace.durationMs,
        });
        break;
      }
      case 'tool-error': {
        const err = p.error as { name?: string; message?: string; cause?: { message?: string } } | undefined;
        const message = err?.cause?.message ?? err?.message ?? err?.name ?? 'Tool failed';
        const trace: ToolTrace = {
          toolCallId: id,
          toolName,
          args: p.args,
          status: 'error',
          error: message,
          durationMs: since(id),
        };
        tools.push(trace);
        ctx.emit({
          type: 'tool-finish',
          toolCallId: id,
          toolName,
          status: 'error',
          error: message,
          durationMs: trace.durationMs,
        });
        break;
      }
      case 'tool-output-denied': {
        const trace: ToolTrace = {
          toolCallId: id,
          toolName,
          args: p.args,
          status: 'denied',
          error: 'Declined by the user',
          durationMs: since(id),
        };
        tools.push(trace);
        ctx.emit({
          type: 'tool-finish',
          toolCallId: id,
          toolName,
          status: 'denied',
          error: trace.error,
          durationMs: trace.durationMs,
        });
        break;
      }
      default:
        break;
    }
  }
  ctx.throwIfAborted(); // aborted streams end quietly
  return {
    text,
    tools,
    pendingApprovals,
    runId: stream.runId ?? null,
    finishReason: (await stream.finishReason) ?? null,
    usage: usageOf(await stream.usage),
  };
}

/** Starts agent.stream() with the run's abort signal and mirrors it into lab events. */
export async function streamAgent(
  ctx: RunContext<unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: Agent<any, any, any, any, any>,
  prompt: string,
  options: StreamOptions & { emitTokens?: boolean; startedAt?: Map<string, number> } = {},
): Promise<AgentRunResult> {
  const { emitTokens = true, startedAt, ...streamOptions } = options;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await agent.stream(prompt, { ...streamOptions, abortSignal: ctx.signal } as any);
  return consumeStream(ctx, stream as unknown as StreamLike, { emitTokens, startedAt });
}
