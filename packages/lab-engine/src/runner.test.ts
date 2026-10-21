import { afterEach, describe, expect, it } from 'vitest';
import { ExecutionEventSchema, type ExecutionEvent } from '@mlp/contracts';
import { LabError } from './errors.js';
import { LabRegistry } from './registry.js';
import { LabRunner, type RunnerOptions } from './runner.js';
import { makeTestDefinition, makeTestLab } from './testing.js';

const SECRET = 'sk-test-SUPERSECRET-123456789';
const runners: LabRunner[] = [];

function setup(opts: Partial<RunnerOptions<unknown>> = {}) {
  const registry = new LabRegistry([makeTestLab()]);
  const runner = new LabRunner({ registry, services: {}, liveEnabled: false, secrets: [SECRET], ...opts });
  runners.push(runner);
  return runner;
}

afterEach(async () => {
  await Promise.all(runners.splice(0).map((r) => r.dispose()));
});

function collect(runner: LabRunner, runId: string): ExecutionEvent[] {
  const out: ExecutionEvent[] = [];
  runner.subscribe(runId, (e) => out.push(e));
  return out;
}

const last = <T>(a: readonly T[]) => a[a.length - 1];

describe('LabRunner.start validation', () => {
  it('keeps owner metadata server-side while allowing existing direct runner callers', async () => {
    const r = setup();
    const owned = r.start('lab-99', { input: { text: 'hello' } }, { ownerId: 'dev:alice' });
    await r.waitFor(owned.runId);
    expect(r.ownerOf(owned.runId)).toBe('dev:alice');
    expect(JSON.stringify({ snapshot: r.get(owned.runId), events: r.events(owned.runId) })).not.toContain('dev:alice');
    const legacy = r.start('lab-99', { input: { text: 'hello' } });
    expect(r.ownerOf(legacy.runId)).toBeNull();
    expect(r.ownerOf('missing')).toBeUndefined();
  });
  it('rejects unknown labs with NOT_FOUND', () => {
    const r = setup();
    expect(() => r.start('lab-42', { input: {} })).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('rejects invalid input with field details', () => {
    const r = setup();
    try {
      r.start('lab-99', { input: { text: '' } });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(LabError);
      expect((err as LabError).code).toBe('VALIDATION_FAILED');
      expect((err as LabError).details?.[0]?.path).toBe('input.text');
    }
  });

  it('rejects malformed execution requests', () => {
    const r = setup();
    expect(() => r.start('lab-99', { input: 'nope' })).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('refuses live mode when the server is offline', () => {
    const registry = new LabRegistry([
      makeTestLab({
        execution: { modes: ['offline', 'live'], defaultTimeoutMs: 1000, maxTimeoutMs: 2000, budget: {}, costNotice: 'x' },
      }),
    ]);
    const r = new LabRunner({ registry, services: {}, liveEnabled: false });
    runners.push(r);
    expect(() => r.start('lab-99', { input: { text: 'a' }, mode: 'live' })).toThrowError(
      expect.objectContaining({ code: 'NOT_CONFIGURED', message: expect.stringContaining('MASTRA_MODE=live') }),
    );
  });

  it('refuses live mode for offline-only labs even when live is enabled', () => {
    const r = setup({ liveEnabled: true });
    expect(() => r.start('lab-99', { input: { text: 'a' }, mode: 'live' })).toThrowError(
      expect.objectContaining({ code: 'NOT_CONFIGURED' }),
    );
  });

  it('enforces the concurrency limit with a retryable error', () => {
    const r = setup({ maxConcurrentRuns: 1 });
    r.start('lab-99', { input: { text: 'a', delayMs: 1000 } });
    try {
      r.start('lab-99', { input: { text: 'b' } });
      expect.unreachable();
    } catch (err) {
      expect((err as LabError).code).toBe('TOO_MANY_REQUESTS');
      expect((err as LabError).retryable).toBe(true);
    }
  });
});

describe('LabRunner execution', () => {
  it('streams schema-valid events ending in exactly one complete', async () => {
    const r = setup();
    const run = r.start('lab-99', { input: { text: 'hello' } }, { requestId: 'req-1', correlationId: 'corr-1' });
    const events = collect(r, run.runId);
    const snap = await r.waitFor(run.runId);
    expect(snap.status).toBe('succeeded');
    for (const e of events) ExecutionEventSchema.parse(e);
    expect(events.map((e) => e.type)).toEqual(['log', 'token', 'result', 'complete']);
    expect(events.filter((e) => e.type === 'complete')).toHaveLength(1);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(events.every((e) => e.correlationId === 'corr-1')).toBe(true);
    const result = events.find((e) => e.type === 'result');
    expect(result).toMatchObject({ output: { echo: 'hello' }, validation: { passed: true } });
  });

  it('cancels an active run', async () => {
    const r = setup();
    const run = r.start('lab-99', { input: { text: 'x', delayMs: 5000 } });
    const events = collect(r, run.runId);
    r.cancel(run.runId);
    const snap = await r.waitFor(run.runId);
    expect(snap.status).toBe('cancelled');
    expect(events.at(-2)).toMatchObject({ type: 'error', code: 'CANCELLED' });
    expect(last(events)).toMatchObject({ type: 'complete', status: 'cancelled' });
  });

  it('times out at the deadline even if the lab ignores the abort signal', async () => {
    const r = setup();
    const started = Date.now();
    const run = r.start('lab-99', { input: { text: 'x', delayMs: 3000, behavior: 'ignore-abort' }, timeoutMs: 150 });
    expect(run.deadlineMs).toBe(150);
    const events = collect(r, run.runId);
    const snap = await r.waitFor(run.runId);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(snap.status).toBe('timeout');
    expect(events.at(-2)).toMatchObject({ type: 'error', code: 'TIMEOUT', retryable: true });
  });

  it('clamps the deadline to the lab maximum and the server maximum', () => {
    const r = setup({ serverMaxTimeoutMs: 1000 });
    const run = r.start('lab-99', { input: { text: 'x' }, timeoutMs: 100_000 });
    expect(run.deadlineMs).toBe(1000);
  });

  it('maps LabError to its canonical code', async () => {
    const r = setup();
    const run = r.start('lab-99', { input: { text: 'x', behavior: 'lab-error' } });
    const events = collect(r, run.runId);
    expect((await r.waitFor(run.runId)).status).toBe('failed');
    expect(events.at(-2)).toMatchObject({ type: 'error', code: 'PROVIDER_ERROR', retryable: true });
  });

  it('hides internal error details behind a generic message', async () => {
    const r = setup();
    const run = r.start('lab-99', { input: { text: 'x', behavior: 'crash' } });
    const events = collect(r, run.runId);
    await r.waitFor(run.runId);
    const err = events.find((e) => e.type === 'error');
    expect(err).toMatchObject({ code: 'INTERNAL', message: 'Lab execution failed' });
    expect(JSON.stringify(events)).not.toContain('kaboom');
  });

  it('redacts configured secrets from error events', async () => {
    const r = setup();
    const run = r.start('lab-99', { input: { text: 'x', behavior: 'leak-secret', secret: SECRET } });
    const events = collect(r, run.runId);
    await r.waitFor(run.runId);
    const text = JSON.stringify(events);
    expect(text).not.toContain(SECRET);
    expect(text).toContain('sk-…6789');
  });

  it('bounds the event buffer and annotates truncation', async () => {
    const r = setup({ maxEventsPerRun: 10 });
    const run = r.start('lab-99', { input: { text: 'x', behavior: 'flood' } });
    await r.waitFor(run.runId);
    const events = r.events(run.runId);
    expect(events.length).toBeLessThanOrEqual(13);
    expect(events.some((e) => e.annotations?.truncated === true)).toBe(true);
    expect(last(events)).toMatchObject({ type: 'complete', status: 'succeeded' });
  });

  it('replays buffered events to late subscribers', async () => {
    const r = setup();
    const run = r.start('lab-99', { input: { text: 'late' } });
    await r.waitFor(run.runId);
    const replay: ExecutionEvent[] = [];
    r.subscribe(run.runId, (e) => replay.push(e), 1);
    expect(replay.map((e) => e.seq)).toEqual([2, 3]);
  });
});

describe('LabRunner disconnect handling', () => {
  it('aborts the run after the grace period when the last subscriber leaves', async () => {
    const r = setup({ disconnectGraceMs: 20 });
    const run = r.start('lab-99', { input: { text: 'x', delayMs: 5000 } });
    const unsubscribe = r.subscribe(run.runId, () => {});
    expect(r.listenerCount(run.runId)).toBe(1);
    unsubscribe();
    expect(r.listenerCount(run.runId)).toBe(0);
    const snap = await r.waitFor(run.runId);
    expect(snap.status).toBe('cancelled');
    expect(r.activeCount).toBe(0);
  });

  it('keeps the run alive if a subscriber reconnects within the grace period', async () => {
    const r = setup({ disconnectGraceMs: 50 });
    const run = r.start('lab-99', { input: { text: 'x', delayMs: 120 } });
    r.subscribe(run.runId, () => {})();
    const events: ExecutionEvent[] = [];
    r.subscribe(run.runId, (e) => events.push(e));
    expect((await r.waitFor(run.runId)).status).toBe('succeeded');
  });
});

describe('LabRegistry', () => {
  it('rejects definitions with two hints', () => {
    const def = makeTestDefinition();
    const bad = makeTestLab({ guide: { ...def.guide, hints: def.guide.hints.slice(0, 2) } });
    expect(() => new LabRegistry([bad])).toThrow(/hints/);
  });

  it('rejects source paths with traversal', () => {
    expect(() => new LabRegistry([makeTestLab({ sourceFiles: [{ path: '../../.env', title: 'x' }] })])).toThrow(/sourceFiles/);
  });

  it('rejects an example input that fails the lab schema', () => {
    expect(() => new LabRegistry([makeTestLab({ exampleInput: { text: '' } })])).toThrow(/exampleInput/);
  });

  it('rejects duplicate ids', () => {
    expect(() => new LabRegistry([makeTestLab(), makeTestLab()])).toThrow(/already registered/);
  });
});

describe('LabRunner approvals', () => {
  async function waitForApproval(runner: LabRunner, runId: string) {
    for (let i = 0; i < 100; i++) {
      const req = runner.events(runId).find((e) => e.type === 'approval-request');
      if (req && req.type === 'approval-request') return req;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('no approval-request event');
  }

  it('pauses until a decision arrives and emits request/resolved events', async () => {
    const r = setup();
    const run = r.start('lab-99', { input: { text: 'hi', behavior: 'approval' } });
    const req = await waitForApproval(r, run.runId);
    expect(ExecutionEventSchema.parse(req)).toMatchObject({ toolName: 'echo', args: { text: 'hi' }, message: 'Echo "hi"?' });
    expect(r.get(run.runId)).toMatchObject({ status: 'running', pendingApprovals: 1 });
    expect(r.resolveApproval(run.runId, req.approvalId, 'approve').pendingApprovals).toBe(0);
    const snap = await r.waitFor(run.runId);
    expect(snap.status).toBe('succeeded');
    const events = r.events(run.runId);
    expect(events.find((e) => e.type === 'approval-resolved')).toMatchObject({ decision: 'approve', by: 'user' });
    expect(events.find((e) => e.type === 'result')).toMatchObject({ output: { echo: 'hi' } });
  });

  it('first decision wins; later or unknown decisions are CONFLICT, unknown runs NOT_FOUND', async () => {
    const r = setup();
    const run = r.start('lab-99', { input: { text: 'hi', behavior: 'approval' } });
    const req = await waitForApproval(r, run.runId);
    expect(() => r.resolveApproval(run.runId, 'nope', 'approve')).toThrowError(expect.objectContaining({ code: 'CONFLICT' }));
    r.resolveApproval(run.runId, req.approvalId, 'decline', 'not today');
    expect(() => r.resolveApproval(run.runId, req.approvalId, 'approve')).toThrowError(
      expect.objectContaining({ code: 'CONFLICT' }),
    );
    await r.waitFor(run.runId);
    expect(r.events(run.runId).find((e) => e.type === 'result')).toMatchObject({ output: { echo: 'declined (user)' } });
    expect(r.events(run.runId).find((e) => e.type === 'approval-resolved')).toMatchObject({ reason: 'not today' });
    expect(() => r.resolveApproval(run.runId, req.approvalId, 'approve')).toThrowError(
      expect.objectContaining({ code: 'CONFLICT' }),
    );
    expect(() => r.resolveApproval('missing', req.approvalId, 'approve')).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('auto-declines after the approval timeout', async () => {
    const r = setup({ approvalTimeoutMs: 50 });
    const run = r.start('lab-99', { input: { text: 'hi', behavior: 'approval' } });
    expect((await r.waitFor(run.runId)).status).toBe('succeeded');
    expect(r.events(run.runId).find((e) => e.type === 'approval-resolved')).toMatchObject({ decision: 'decline', by: 'timeout' });
    expect(r.events(run.runId).find((e) => e.type === 'result')).toMatchObject({ output: { echo: 'declined (timeout)' } });
  });

  it('does not count waiting time against the deadline, but resumes the clock afterwards', async () => {
    const r = setup();
    const ok = r.start('lab-99', { input: { text: 'hi', behavior: 'approval' }, timeoutMs: 300 });
    const req = await waitForApproval(r, ok.runId);
    await new Promise((res) => setTimeout(res, 600));
    r.resolveApproval(ok.runId, req.approvalId, 'approve');
    expect((await r.waitFor(ok.runId)).status).toBe('succeeded');

    const slow = r.start('lab-99', { input: { text: 'hi', behavior: 'approval', delayMs: 2000 }, timeoutMs: 300 });
    r.resolveApproval(slow.runId, (await waitForApproval(r, slow.runId)).approvalId, 'approve');
    expect((await r.waitFor(slow.runId)).status).toBe('timeout');
  });

  it('cancelling a waiting run ends it as cancelled', async () => {
    const r = setup();
    const run = r.start('lab-99', { input: { text: 'hi', behavior: 'approval' } });
    const req = await waitForApproval(r, run.runId);
    r.cancel(run.runId);
    expect((await r.waitFor(run.runId)).status).toBe('cancelled');
    expect(r.get(run.runId)?.pendingApprovals).toBe(0);
    expect(() => r.resolveApproval(run.runId, req.approvalId, 'approve')).toThrowError(
      expect.objectContaining({ code: 'CONFLICT' }),
    );
  });
});

describe('LabRunner run tokens and approval capacity', () => {
  async function waitForRequest(runner: LabRunner, runId: string) {
    for (let i = 0; i < 100; i++) {
      const e = runner.events(runId).find((x) => x.type === 'approval-request');
      if (e?.type === 'approval-request') return e;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('no approval-request event');
  }

  it('returns a private run token and authorizes only that token', async () => {
    const r = setup();
    const run = r.start('lab-99', { input: { text: 'hi', behavior: 'approval' } });
    expect(run.runToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(r.get(run.runId))).not.toContain(run.runToken);
    expect(() => r.authorize(run.runId, run.runToken)).not.toThrow();
    expect(() => r.authorize(run.runId, undefined)).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(() => r.authorize(run.runId, run.runToken.slice(0, -1) + 'x')).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
    expect(() => r.authorize('missing', run.runToken)).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
    const other = r.start('lab-99', { input: { text: 'x' } });
    expect(() => r.authorize(run.runId, other.runToken)).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));
    r.resolveApproval(run.runId, (await waitForRequest(r, run.runId)).approvalId, 'approve');
    await r.waitFor(run.runId);
    expect(JSON.stringify(r.events(run.runId))).not.toContain(run.runToken);
  });

  it('a run waiting for approval frees its concurrency slot', async () => {
    const r = setup({ maxConcurrentRuns: 1 });
    const waiting = r.start('lab-99', { input: { text: 'hi', behavior: 'approval' } });
    await waitForRequest(r, waiting.runId);
    expect([r.activeCount, r.waitingCount]).toEqual([0, 1]);
    const next = r.start('lab-99', { input: { text: 'next' } });
    expect((await r.waitFor(next.runId)).status).toBe('succeeded');
    r.cancel(waiting.runId);
    await r.waitFor(waiting.runId);
  });

  it('auto-declines with by "limit" when too many runs are already waiting', async () => {
    const r = setup({ maxPendingApprovals: 1 });
    const first = r.start('lab-99', { input: { text: 'one', behavior: 'approval' } });
    await waitForRequest(r, first.runId);
    const second = r.start('lab-99', { input: { text: 'two', behavior: 'approval' } });
    expect((await r.waitFor(second.runId)).status).toBe('succeeded');
    expect(r.events(second.runId).find((e) => e.type === 'approval-resolved')).toMatchObject({
      decision: 'decline',
      by: 'limit',
    });
    expect(r.events(second.runId).find((e) => e.type === 'result')).toMatchObject({ output: { echo: 'declined (limit)' } });
    r.resolveApproval(first.runId, (await waitForRequest(r, first.runId)).approvalId, 'approve');
    expect(r.events(first.runId).find((e) => e.type === 'approval-resolved')).toMatchObject({ by: 'user' });
    await r.waitFor(first.runId);
  });
});
