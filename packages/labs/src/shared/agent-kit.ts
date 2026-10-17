import type { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import type { RunContext } from '@mlp/lab-engine';

/**
 * Routes a Mastra Agent's internal logger into the run's event stream (where the engine
 * redacts secrets) instead of printing raw provider errors to the server console.
 * Usage: `const agent = withLabLogger(ctx, new Agent({ … }))`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withLabLogger<A extends Agent<any, any, any, any, any>>(ctx: RunContext<unknown>, agent: A): A {
  agent.__setLogger({
    ...noopLogger,
    warn: (message: string) => ctx.log('warn', `[mastra] ${message}`),
    error: (message: string) => ctx.log('error', `[mastra] ${message}`),
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
