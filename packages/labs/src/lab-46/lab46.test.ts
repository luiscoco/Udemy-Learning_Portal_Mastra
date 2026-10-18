import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { classifyFailure, connectWithRetry, sanitizeDetail } from './connect.js';
import { startLocalFixture } from './fixture-server.js';
import { lab46, SCENARIOS, type Lab46Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab46]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab46Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-46', { input: { ...lab46.definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return { ...result, events };
}

describe('lab-46 failure classification (unit)', () => {
  it('maps error details to categories in priority order', () => {
    expect(classifyFailure({ message: 'Host "x" is blocked by the allowedHosts policy' })).toBe('blocked-by-policy');
    expect(classifyFailure({ message: 'Unsupported protocol version: 2025-11-25', httpStatus: 400 })).toBe('protocol-mismatch');
    expect(classifyFailure({ message: 'Error POSTing to endpoint', httpStatus: 404 })).toBe('not-found');
    expect(classifyFailure({ message: 'Unauthorized', httpStatus: 401 })).toBe('rejected');
    expect(classifyFailure({ message: 'Discovery timed out after 500ms' })).toBe('timeout');
    expect(classifyFailure({ message: 'probe failed: fetch failed', code: 'ERA_NEGOTIATION_FAILED' })).toBe('unreachable');
    expect(classifyFailure({ message: 'something odd' })).toBe('unknown');
  });
  it('keeps only a clean first line', () => {
    const raw = 'Failed: boom\n    at f (C:\\repo\\node_modules\\x\\index.js:1:2)\n    at g (/home/u/x.js:3:4)';
    expect(sanitizeDetail(raw)).toBe('Failed: boom');
    expect(sanitizeDetail('read C:\\Users\\me\\secret.txt failed')).toBe('read <path> failed');
  });
});

describe('lab-46 connection helpers against the local fixture', () => {
  it('connects, then a refused port is retried and a 404 is not', async () => {
    const f = await startLocalFixture();
    try {
      const ok = await connectWithRetry('t46-ok', { url: f.url, allowedHosts: [f.host] }, { timeoutMs: 1500, maxAttempts: 2 });
      expect(ok).toHaveLength(1);
      expect(ok[0]!.outcome).toMatchObject({
        status: 'connected',
        protocolVersion: '2026-07-28',
        instructions: expect.stringContaining('course_info'),
      });
      const refused = await connectWithRetry(
        't46-refused',
        { url: f.closedUrl, allowedHosts: [new URL(f.closedUrl).host] },
        { timeoutMs: 500, maxAttempts: 3 },
      );
      expect(refused.map((a) => a.outcome.status === 'failed' && a.outcome.category)).toEqual([
        'unreachable',
        'unreachable',
        'unreachable',
      ]);
      const notFound = await connectWithRetry(
        't46-404',
        { url: f.url.replace('/mcp', '/x'), allowedHosts: [f.host] },
        { timeoutMs: 500, maxAttempts: 3 },
      );
      expect(notFound).toHaveLength(1);
    } finally {
      await f.close();
    }
    expect(f.listening()).toBe(false);
    expect(f.openSockets()).toBe(0);
  });
});

describe('lab-46 Connect MCP server (DoD)', () => {
  it('handshake succeeds offline in the local fixture', async () => {
    const { output, validation, events } = await run();
    expect(validation.passed).toBe(true);
    expect(output.connection).toMatchObject({
      status: 'connected',
      protocolVersion: '2026-07-28',
      serverInfo: { name: 'Course fixture server', version: '1.0.0' },
      tools: [
        { key: 'course_course_info', name: 'course_info' },
        { key: 'course_lab_title', name: 'lab_title' },
      ],
    });
    expect(output.teardown).toEqual({ clientsDisconnected: true, fixtureClosed: true, openSockets: 0 });
    const steps = events.flatMap((e) => (e.type === 'workflow-step' ? [e.stepId] : []));
    expect(steps).toEqual(['start-fixture', 'connect #1', 'teardown']);
  });

  it.each(SCENARIOS.filter((s) => s !== 'healthy'))('%s: connection failure handled', async (scenario) => {
    const { output, validation } = await run({ scenario, timeoutMs: 500, maxAttempts: 2 });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.connection.status).toBe('failed');
    const retriable = scenario === 'refused' || scenario === 'timeout';
    expect(output.attempts).toHaveLength(retriable ? 2 : 1);
    expect(JSON.stringify(output)).not.toMatch(/\n\s+at |node_modules/);
  });

  it('flags a run whose outcome does not match the scenario', async () => {
    const healthyOut = {
      scenario: 'refused',
      attempts: [],
      connection: {
        status: 'connected',
        protocolVersion: '2026-07-28',
        serverInfo: { name: 'x', version: '1' },
        instructions: null,
        tools: [{ key: 'a_b', name: 'b' }],
      },
      teardown: { clientsDisconnected: true, fixtureClosed: true, openSockets: 0 },
    } as unknown as Lab46Output;
    const v = await lab46.validate!(
      healthyOut,
      { scenario: 'refused', timeoutMs: 500, maxAttempts: 2 },
      { events: [], mode: 'offline' },
    );
    expect(v.checks.find((c: { id: string; passed: boolean }) => c.id === 'outcome-expected')?.passed).toBe(false);
  });
});
