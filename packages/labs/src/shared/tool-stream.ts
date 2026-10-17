import type { Agent } from '@mastra/core/agent';
import type { RunContext } from '@mlp/lab-engine';
import { usageOf } from './agent-kit.js';

export interface ToolTrace {
  toolCallId: string;
  toolName: string;
  args: unknown;
  /** success = tool ran; invalid = Mastra rejected the input before execute(); error = execute threw or tool unknown */
  status: 'success' | 'invalid' | 'error';
  result?: unknown;
  error?: string;
  durationMs: number;
}

export interface AgentRunResult {
  text: string;
  tools: ToolTrace[];
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

/**
 * Streams an agent run and mirrors it into lab events: text deltas → `token`, tool calls →
 * `tool-start` / `tool-finish` with measured durations. Verified chunk shapes (installed Mastra):
 * tool-call { toolCallId, toolName, args }, tool-result { toolCallId, toolName, args, result }
 * (input validation failures arrive as result { error: true, message }), tool-error { toolCallId, toolName, error }.
 */
export async function streamAgent(
  ctx: RunContext<unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: Agent<any, any, any, any, any>,
  prompt: string,
  options: StreamOptions & { emitTokens?: boolean } = {},
): Promise<AgentRunResult> {
  const { emitTokens = true, ...streamOptions } = options;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await agent.stream(prompt, { ...streamOptions, abortSignal: ctx.signal } as any);
  const started = new Map<string, number>();
  const tools: ToolTrace[] = [];
  let text = '';

  for await (const chunk of stream.fullStream) {
    const p = (chunk as { payload?: Record<string, unknown> }).payload ?? {};
    switch (chunk.type) {
      case 'text-delta': {
        const delta = String(p.text ?? '');
        text += delta;
        if (emitTokens && delta) ctx.emit({ type: 'token', text: delta });
        break;
      }
      case 'tool-call': {
        const id = String(p.toolCallId);
        started.set(id, Date.now());
        ctx.emit({ type: 'tool-start', toolCallId: id, toolName: String(p.toolName), args: p.args });
        break;
      }
      case 'tool-result': {
        const id = String(p.toolCallId);
        const result = p.result as { error?: boolean; message?: string } | undefined;
        const invalid = Boolean(result && typeof result === 'object' && result.error === true);
        const trace: ToolTrace = {
          toolCallId: id,
          toolName: String(p.toolName),
          args: p.args,
          status: invalid ? 'invalid' : 'success',
          ...(invalid ? { error: String(result?.message ?? 'Invalid tool input') } : { result }),
          durationMs: Date.now() - (started.get(id) ?? Date.now()),
        };
        tools.push(trace);
        ctx.emit({
          type: 'tool-finish',
          toolCallId: id,
          toolName: trace.toolName,
          status: invalid ? 'error' : 'success',
          ...(invalid ? { error: trace.error } : { result }),
          durationMs: trace.durationMs,
        });
        break;
      }
      case 'tool-error': {
        const id = String(p.toolCallId);
        const err = p.error as { name?: string; message?: string; cause?: { message?: string } } | undefined;
        const message = err?.cause?.message ?? err?.message ?? err?.name ?? 'Tool failed';
        const trace: ToolTrace = {
          toolCallId: id,
          toolName: String(p.toolName),
          args: p.args,
          status: 'error',
          error: message,
          durationMs: Date.now() - (started.get(id) ?? Date.now()),
        };
        tools.push(trace);
        ctx.emit({
          type: 'tool-finish',
          toolCallId: id,
          toolName: trace.toolName,
          status: 'error',
          error: message,
          durationMs: trace.durationMs,
        });
        break;
      }
      default:
        break;
    }
  }
  ctx.throwIfAborted(); // aborted streams end quietly
  return { text, tools, finishReason: (await stream.finishReason) ?? null, usage: usageOf(await stream.usage) };
}
