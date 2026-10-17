import type { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import type { RunContext } from '@mlp/lab-engine';

/**
 * Makes a Mastra log line safe to show in the browser: keeps the first line, drops stack frames and
 * replaces absolute file paths/URLs (server internals) with the file name only.
 */
export function sanitizeMastraLog(message: string): string {
  const firstLine = message.split('\n').find((l) => !/^\s+at\s/.test(l)) ?? '';
  return firstLine
    .replace(/file:\/\/\/?\S+?([^/\\\s]+\.[cm]?js)(:\d+:\d+)?/g, '$1')
    .replace(/(?:[A-Za-z]:)?[\\/][^\s:'"]*[\\/]([^\\/\s:'"]+\.[cm]?[jt]s)(:\d+:\d+)?/g, '$1')
    .slice(0, 300);
}

/** Mastra logs an input/output processor abort (an expected rejection) as an error with a stack trace. */
const PROCESSOR_ABORT = /Error executing step \S*processor:([\w-]+): (?:\w*Error: )?(.*)$/;

/**
 * Routes a Mastra Agent's internal logger into the run's event stream (where the engine
 * redacts secrets) instead of printing raw provider errors to the server console.
 * Stack traces and server paths are stripped; processor tripwires are reported as what they are.
 * Usage: `const agent = withLabLogger(ctx, new Agent({ … }))`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withLabLogger<A extends Agent<any, any, any, any, any>>(ctx: RunContext<unknown>, agent: A): A {
  agent.__setLogger({
    ...noopLogger,
    warn: (message: string) => ctx.log('warn', `[mastra] ${sanitizeMastraLog(message)}`),
    error: (message: string) => {
      const line = sanitizeMastraLog(message);
      const abort = line.match(PROCESSOR_ABORT);
      if (abort) ctx.log('warn', `[mastra] processor ${abort[1]} rejected the request: ${abort[2]}`);
      else ctx.log('error', `[mastra] ${line}`);
    },
  } as typeof noopLogger);
  return agent;
}

/** Converts a Mastra usage object into the event contract's usage shape. */
export function usageOf(
  u: { inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null } | undefined,
) {
  if (!u) return undefined;
  return {
    inputTokens: u.inputTokens ?? undefined,
    outputTokens: u.outputTokens ?? undefined,
    totalTokens: u.totalTokens ?? undefined,
  };
}
