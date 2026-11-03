import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab65Definition } from './definition.js';
import { CircuitBreaker, isRetryable, resilientCall, sleep, AttemptTimeout } from './resilience.js';
import { Lab65InputSchema, lab65, type Lab65Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab65]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());
const base = lab65Definition.exampleInput;
const http = (statusCode: number) => Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });

async function run(input: Record<string, unknown>) {
  const r = runner.start('lab-65', { input });
  const snap = await runner.waitFor(r.runId);
  const result = runner.events(r.runId).find((e) => e.type === 'result');
  return { snap, runId: r.runId, result: result?.type === 'result' ? result : undefined };
}

describe('circuit breaker', () => {
  it('opens at the threshold, short-circuits, probes once after the cool-down and closes on success', () => {
    let now = 0;
    const b = new CircuitBreaker('svc', { failureThreshold: 2, coolDownMs: 1_000, now: () => now });
    b.failure('HTTP 503');
    expect(b.state).toBe('closed');
    b.failure('HTTP 503');
    expect(b.state).toBe('open');
    expect(b.allow()).toBe(false);
    now = 999;
    expect(b.allow()).toBe(false);
    now = 1_000;
    expect(b.allow()).toBe(true); // the single half-open probe
    expect(b.allow()).toBe(false); // no second probe in parallel
    b.failure('HTTP 503');
    expect(b.state).toBe('open'); // failed probe re-opens
    now = 2_000;
    expect(b.allow()).toBe(true);
    b.success();
    expect(b.state).toBe('closed');
    expect(b.shortCircuited).toBe(3);
    expect(b.transitions.map((t) => t.to)).toEqual(['open', 'half-open', 'open', 'half-open', 'closed']);
  });
});

describe('resilientCall', () => {
  const breaker = () => new CircuitBreaker('x', { failureThreshold: 10, coolDownMs: 60_000 });
  it('retries retryable failures with a bound, and never retries 401', async () => {
    let calls = 0;
    const flaky = await resilientCall('x', async () => (++calls < 3 ? Promise.reject(http(503)) : 'ok'), {
      attempts: 3,
      timeoutMs: 1_000,
      baseDelayMs: 1,
      breaker: breaker(),
    });
    expect(flaky).toMatchObject({ ok: true, attempts: 3, value: 'ok' });
    calls = 0;
    const bad = await resilientCall(
      'x',
      async () => {
        calls += 1;
        throw http(401);
      },
      { attempts: 3, timeoutMs: 1_000, baseDelayMs: 1, breaker: breaker() },
    );
    expect(bad).toMatchObject({ ok: false, outcome: 'failed', attempts: 1 });
    expect(calls).toBe(1);
    expect([isRetryable(http(429)), isRetryable(http(400)), isRetryable(new AttemptTimeout(1))]).toEqual([true, false, true]);
  });
  it('a timeout aborts the attempt’s signal; a caller abort stops at once', async () => {
    let attemptAborted = false;
    const t0 = Date.now();
    const slow = await resilientCall(
      'x',
      async (signal) => {
        signal.addEventListener('abort', () => (attemptAborted = true));
        await sleep(60_000, signal);
      },
      { attempts: 1, timeoutMs: 100, baseDelayMs: 1, breaker: breaker() },
    );
    expect(slow.outcome).toBe('timeout');
    expect(attemptAborted).toBe(true);
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(new Error('closed chat')), 50);
    const cancelled = await resilientCall('x', (signal) => sleep(60_000, signal), {
      attempts: 3,
      timeoutMs: 10_000,
      baseDelayMs: 1,
      breaker: breaker(),
      signal: ctrl.signal,
    });
    expect(cancelled).toMatchObject({ ok: false, outcome: 'cancelled', attempts: 1 });
    expect(Date.now() - t0).toBeLessThan(5_000);
  });
});

describe('Lab 65', () => {
  it('example: fallback answers, flaky tracker recovers, the down service is cut off, all questions answered', async () => {
    const { snap, result } = await run(base);
    expect(snap.status).toBe('succeeded');
    expect(result?.validation?.passed).toBe(true);
    const out = result!.output as Lab65Output;
    expect(out.questions.map((q) => `${q.status}:${q.answeredBy}`)).toEqual(Array(4).fill('answered:fallback'));
    const primaryAttempts = out.calls.filter((c) => c.dep === 'primary' && c.outcome !== 'short-circuit');
    expect(primaryAttempts).toHaveLength(3); // bounded: never more, in the whole run
    expect(out.breakers.recommendations).toMatchObject({ state: 'open', shortCircuited: 1 });
    expect(out.calls.filter((c) => c.dep === 'tracker' && c.question === 1).map((c) => c.outcome)).toEqual([
      'failed',
      'failed',
      'ok',
    ]);
    expect(out.questions[1]!.answer).toMatch(/Recommendations are unavailable/);
    expect(out.questions[1]!.degraded).toEqual(['recommendations']);
  });

  it('a rejected key is tried once per model call and never retried', async () => {
    const { result } = await run({ ...base, primaryFault: 'bad-key', trackerFault: 'none', recommendationsFault: 'none' });
    const out = result!.output as Lab65Output;
    expect(result?.validation?.passed).toBe(true);
    expect(out.calls.filter((c) => c.dep === 'primary' && c.attempt > 1 && c.outcome !== 'short-circuit')).toEqual([]);
  });

  it('cancelling one question aborts its slow call; the next questions are answered', async () => {
    const { result } = await run({
      ...base,
      primaryFault: 'none',
      trackerFault: 'slow',
      recommendationsFault: 'none',
      cancelQuestion: 1,
      toolTimeoutMs: 2_000,
    });
    const out = result!.output as Lab65Output;
    expect(result?.validation?.passed).toBe(true);
    expect(out.questions[0]!.status).toBe('cancelled');
    const q1Tracker = out.calls.filter((c) => c.question === 1 && c.dep === 'tracker');
    expect(q1Tracker.map((c) => c.outcome)).toEqual(['cancelled']); // ended at the cancel, not at the 2 s timeout
    expect(q1Tracker[0]!.durationMs).toBeLessThan(2_000);
    expect(out.questions.slice(1).every((q) => q.status === 'answered')).toBe(true);
  });

  it('a slow primary times out per attempt, then the fallback answers', async () => {
    const { result } = await run({
      ...base,
      primaryFault: 'slow',
      trackerFault: 'none',
      recommendationsFault: 'none',
      modelTimeoutMs: 200,
      questions: 'Where is my order ORD-5001?',
    });
    const out = result!.output as Lab65Output;
    expect(result?.validation?.passed).toBe(true);
    // Three bounded attempts; once Mastra switched to the fallback it keeps it for the rest of that stream.
    expect(out.calls.filter((c) => c.dep === 'primary').map((c) => c.outcome)).toEqual(['timeout', 'timeout', 'timeout']);
    expect(out.calls.filter((c) => c.dep === 'primary').every((c) => c.durationMs < 200 + 2_000)).toBe(true);
    expect(out.questions[0]!.answeredBy).toBe('fallback');
  });

  it('Stop cancels the whole run promptly, even while a model call hangs', async () => {
    const r = runner.start('lab-65', { input: { ...base, primaryFault: 'slow', modelTimeoutMs: 30_000, coolDownMs: 0 } });
    await sleep(300);
    const t0 = Date.now();
    runner.cancel(r.runId);
    expect((await runner.waitFor(r.runId)).status).toBe('cancelled');
    expect(Date.now() - t0).toBeLessThan(3_000);
  });

  it('validates inputs', () => {
    expect(Lab65InputSchema.safeParse({ ...base, questions: '' }).success).toBe(false);
    expect(Lab65InputSchema.safeParse({ ...base, questions: Array(7).fill('Where is ORD-5001?').join('\n') }).success).toBe(
      false,
    );
    expect(Lab65InputSchema.safeParse({ ...base, maxAttempts: 5 }).success).toBe(false);
  });
});
