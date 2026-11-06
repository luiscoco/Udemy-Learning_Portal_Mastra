import { withLiveCheckpoint } from '../shared/live-checkpoint.js';
import { z } from 'zod';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import type { LabServices } from '../services.js';
import { connectWithRetry, type Attempt, type FailureCategory, type ServerDefinition } from './connect.js';
import { startLocalFixture, type LocalFixture } from './fixture-server.js';
import { lab46Definition } from './definition.js';

export const SCENARIOS = ['healthy', 'wrong-path', 'refused', 'timeout', 'protocol-mismatch', 'blocked-host'] as const;
export type Scenario = (typeof SCENARIOS)[number];

/** What a correctly handled run looks like for each scenario. */
export const EXPECTED: Record<Scenario, { status: 'connected' | 'failed'; category?: FailureCategory }> = {
  healthy: { status: 'connected' },
  'wrong-path': { status: 'failed', category: 'not-found' },
  refused: { status: 'failed', category: 'unreachable' },
  timeout: { status: 'failed', category: 'timeout' },
  'protocol-mismatch': { status: 'failed', category: 'protocol-mismatch' },
  'blocked-host': { status: 'failed', category: 'blocked-by-policy' },
};

export const Lab46InputSchema = z.object({
  scenario: z.enum(SCENARIOS),
  timeoutMs: z.number().int().min(300).max(5000).default(1500),
  maxAttempts: z.number().int().min(1).max(3).default(2),
});
export type Lab46Input = z.infer<typeof Lab46InputSchema>;

/** The documented MCPClient server definition for each scenario (all on loopback). */
export function serverDefinitionFor(scenario: Scenario, f: LocalFixture): ServerDefinition {
  const hostOf = (u: string) => new URL(u).host;
  switch (scenario) {
    case 'healthy':
      return { url: f.url, allowedHosts: [f.host] };
    case 'wrong-path':
      return { url: f.url.replace(/\/mcp$/, '/wrong'), allowedHosts: [f.host] };
    case 'refused':
      return { url: f.closedUrl, allowedHosts: [hostOf(f.closedUrl)] };
    case 'timeout':
      return { url: f.silentUrl, allowedHosts: [hostOf(f.silentUrl)] };
    case 'protocol-mismatch':
      return { url: f.url, allowedHosts: [f.host], protocolVersion: 'legacy' };
    case 'blocked-host':
      return { url: f.url, allowedHosts: ['mcp.example.com'] };
  }
}

export interface Lab46Output {
  scenario: Scenario;
  clientConfig: { transport: 'streamable-http'; url: string; allowedHosts: string[]; protocolVersion: string; timeoutMs: number };
  attempts: Attempt[];
  connection: Attempt['outcome'];
  expected: (typeof EXPECTED)[Scenario];
  teardown: { clientsDisconnected: boolean; fixtureClosed: boolean; openSockets: number };
}

const STACK_OR_PATH = /\n\s+at\s|[A-Za-z]:\\|\/(?:home|Users)\//;

const baseLab46: LabImplementation<Lab46Input, Lab46Output, LabServices> = {
  definition: lab46Definition as LabDefinition,
  inputSchema: Lab46InputSchema,

  async run(ctx, input) {
    const t0 = performance.now();
    const fixture = await startLocalFixture();
    ctx.emit({
      type: 'workflow-step',
      stepId: 'start-fixture',
      status: 'success',
      output: { server: 'course-fixture 1.0.0', transport: 'streamable-http', listening: 'loopback only' },
      durationMs: Math.round(performance.now() - t0),
    });
    try {
      const def = serverDefinitionFor(input.scenario, fixture);
      ctx.log(
        'info',
        `Connecting to ${def.url}${def.protocolVersion ? ` (protocolVersion pinned to ${def.protocolVersion})` : ''}`,
      );
      const attempts = await connectWithRetry(`lab46-${ctx.runId}`, def, {
        timeoutMs: input.timeoutMs,
        maxAttempts: input.maxAttempts,
        signal: ctx.signal,
        onAttempt: (a) => {
          const o = a.outcome;
          ctx.emit({
            type: 'workflow-step',
            stepId: `connect #${a.n}`,
            status: o.status === 'connected' ? 'success' : 'failed',
            output:
              o.status === 'connected'
                ? { protocolVersion: o.protocolVersion, server: o.serverInfo?.name, tools: o.tools.map((t) => t.name) }
                : { category: o.category, retriable: o.retriable, detail: o.detail },
            durationMs: a.ms,
          });
          if (o.status === 'connected')
            ctx.log('info', `Attempt ${a.n}: connected with protocol ${o.protocolVersion} in ${a.ms} ms`);
          else
            ctx.log(
              'warn',
              `Attempt ${a.n}: ${o.category}${o.retriable ? (a.n < input.maxAttempts ? ', retrying' : ', no attempts left') : ', not retriable'}`,
            );
        },
      });
      const connection = attempts.at(-1)!.outcome;
      return {
        scenario: input.scenario,
        clientConfig: {
          transport: 'streamable-http',
          url: def.url,
          allowedHosts: def.allowedHosts,
          protocolVersion: def.protocolVersion ?? 'auto (server/discover probe)',
          timeoutMs: input.timeoutMs,
        },
        attempts,
        connection,
        expected: EXPECTED[input.scenario],
        teardown: await teardown(fixture, attempts),
      };
    } finally {
      await fixture.close();
    }

    async function teardown(f: LocalFixture, attempts: Attempt[]) {
      await f.close();
      const result = {
        clientsDisconnected: attempts.every((a) => a.disconnected),
        fixtureClosed: !f.listening(),
        openSockets: f.openSockets(),
      };
      ctx.emit({ type: 'workflow-step', stepId: 'teardown', status: 'success', output: result });
      return result;
    }
  },

  validate(out, input) {
    const c = out.connection;
    const expected = EXPECTED[input.scenario];
    const outcomeOk =
      c.status === expected.status &&
      (c.status === 'connected'
        ? c.protocolVersion !== null && c.serverInfo !== null && c.tools.length > 0
        : c.category === expected.category);
    const failures = out.attempts.flatMap((a) => (a.outcome.status === 'failed' ? [a.outcome] : []));
    const classified = failures.every((f) => f.category !== 'unknown' && f.message.length > 0 && f.hint.length > 0);
    const lastFailed = c.status === 'failed';
    const retryOk = lastFailed
      ? c.retriable
        ? out.attempts.length === input.maxAttempts
        : out.attempts.length === 1
      : out.attempts.slice(0, -1).every((a) => a.outcome.status === 'failed' && a.outcome.retriable);
    const serialized = JSON.stringify(out);
    const sanitized = !STACK_OR_PATH.test(serialized);
    const released = out.teardown.clientsDisconnected && out.teardown.fixtureClosed && out.teardown.openSockets === 0;
    return summarizeChecks([
      {
        id: 'outcome-expected',
        label: 'The connection outcome matches the scenario (handshake details when healthy, the expected category otherwise)',
        passed: outcomeOk,
        message:
          c.status === 'connected'
            ? `connected: protocol ${c.protocolVersion}, ${c.serverInfo?.name} ${c.serverInfo?.version}, ${c.tools.length} tool(s)`
            : `failed as ${c.category} (expected ${expected.category ?? 'a connection'})`,
      },
      {
        id: 'failure-classified',
        label: 'Every failed attempt has a known category, a learner-facing message and a hint',
        passed: classified,
        message: failures.length
          ? `${failures.length} failed attempt(s), categories: ${[...new Set(failures.map((f) => f.category))].join(', ')}`
          : 'no failures to classify',
      },
      {
        id: 'retry-policy',
        label: 'Only retriable failures (timeout, unreachable) are retried, up to maxAttempts',
        passed: retryOk,
        message: `${out.attempts.length} attempt(s) of at most ${input.maxAttempts}`,
      },
      {
        id: 'errors-sanitized',
        label: 'No stack traces or local file paths reach the output',
        passed: sanitized,
        message: sanitized ? 'output is clean' : 'a stack frame or local path was found in the output',
      },
      {
        id: 'resources-released',
        label: 'Every client is disconnected and the fixture server is closed with no open sockets',
        passed: released,
        message: `clients disconnected: ${out.teardown.clientsDisconnected}, fixture closed: ${out.teardown.fixtureClosed}, open sockets: ${out.teardown.openSockets}`,
      },
    ]);
  },
};

export const lab46 = withLiveCheckpoint(baseLab46);
