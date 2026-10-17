import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { backoffDelay, classify, retryWithBackoff, type RetryPolicy } from './retry.js';
import { lab10 } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab10]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

const policy: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 100,
  maxDelayMs: 1000,
  perAttemptTimeoutMs: 500,
  totalBudgetMs: 60_000,
  idempotent: true,
};

/** Deterministic hooks: a virtual clock advanced only by sleeps. */
function virtualClock() {
  let t = 0;
  const waits: number[] = [];
  return {
    waits,
    hooks: {
      now: () => t,
      sleep: async (ms: number) => {
        waits.push(ms);
        t += ms;
      },
    },
  };
}

const fail = (statusCode: number, extra: object = {}) =>
  Promise.reject(Object.assign(new Error(`HTTP ${statusCode}`), { statusCode, ...extra }));

describe('retry policy (unit, virtual clock)', () => {
  it('classifies statuses', () => {
    for (const s of [408, 429, 500, 502, 503, 504]) expect(classify({ statusCode: s })).toBe('retryable');
    for (const s of [400, 401, 403, 404, 422]) expect(classify({ statusCode: s })).toBe('non-retryable');
    expect(classify({ timedOut: true })).toBe('retryable');
    expect(classify({})).toBe('non-retryable');
  });

  it('backs off exponentially, capped, and honours Retry-After', () => {
    expect([1, 2, 3, 4, 5].map((n) => backoffDelay(n, policy))).toEqual([100, 200, 400, 800, 1000]);
    expect(backoffDelay(1, policy, 750)).toBe(750);
    expect(backoffDelay(3, policy, 50)).toBe(400);
  });

  it('produces exactly the expected retry count for persistent 503s', async () => {
    const { hooks, waits } = virtualClock();
    let calls = 0;
    const r = await retryWithBackoff(() => (calls++, fail(503)), policy, new AbortController().signal, hooks);
    expect(calls).toBe(4);
    expect(waits).toEqual([100, 200, 400]);
    expect(r.stopReason).toBe('max-attempts');
  });

  it('stops immediately on a non-retryable error', async () => {
    const { hooks, waits } = virtualClock();
    let calls = 0;
    const r = await retryWithBackoff(() => (calls++, fail(401)), policy, new AbortController().signal, hooks);
    expect([calls, waits.length, r.stopReason]).toEqual([1, 0, 'non-retryable']);
  });

  it('never retries after cancellation', async () => {
    const ctrl = new AbortController();
    let calls = 0;
    const p = retryWithBackoff(
      () => {
        calls++;
        ctrl.abort(new Error('cancelled'));
        return fail(503);
      },
      policy,
      ctrl.signal,
      virtualClock().hooks,
    );
    await expect(p).rejects.toThrow('cancelled');
    expect(calls).toBe(1);
  });
});

describe('lab-10 end to end (offline fault injection)', () => {
  it('example: 503, 429, success with waits 200 then 400', async () => {
    const r = runner.start('lab-10', { input: lab10.definition.exampleInput });
    await runner.waitFor(r.runId);
    const result = runner.events(r.runId).find((e) => e.type === 'result') as {
      output: { attempts: { waitMs: number }[]; retries: number };
      validation: { passed: boolean };
    };
    expect(result.validation.passed).toBe(true);
    expect(result.output.retries).toBe(2);
    expect(result.output.attempts.map((a) => a.waitMs)).toEqual([200, 400, 0]);
  });
});
