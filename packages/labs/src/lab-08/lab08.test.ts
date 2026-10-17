import { afterAll, describe, expect, it } from 'vitest';
import type { ExecutionEvent } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab08 } from './run.js';

const example = lab08.definition.exampleInput;
const runner = new LabRunner({
  registry: new LabRegistry([lab08]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
  disconnectGraceMs: 20,
});
afterAll(() => runner.dispose());

describe('lab-08 token streaming', () => {
  it('tokens arrive before completion', async () => {
    const r = runner.start('lab-08', { input: { ...example, tokenDelayMs: 30 } });
    const arrivals: { type: string; at: number }[] = [];
    runner.subscribe(r.runId, (e: ExecutionEvent) => arrivals.push({ type: e.type, at: Date.now() }));
    await runner.waitFor(r.runId);
    const firstToken = arrivals.find((a) => a.type === 'token')!;
    const complete = arrivals.find((a) => a.type === 'complete')!;
    expect(firstToken.at).toBeLessThan(complete.at - 300); // many tokens still to come after the first
    const result = runner.events(r.runId).find((e) => e.type === 'result');
    expect(result).toMatchObject({ validation: { passed: true } });
  });

  it('Cancel aborts the stream: no tokens after cancellation, status cancelled', async () => {
    const r = runner.start('lab-08', { input: { ...example, tokenDelayMs: 100 } });
    let tokensAtCancel = -1;
    runner.subscribe(r.runId, (e) => {
      if (e.type === 'token' && tokensAtCancel === -1 && runner.events(r.runId).filter((x) => x.type === 'token').length === 3) {
        tokensAtCancel = 3;
        runner.cancel(r.runId);
      }
    });
    expect((await runner.waitFor(r.runId)).status).toBe('cancelled');
    await new Promise((res) => setTimeout(res, 400)); // give a non-stopped stream time to leak tokens
    const tokens = runner.events(r.runId).filter((e) => e.type === 'token').length;
    expect(tokens).toBe(3);
  });

  it('client disconnect frees the run after the grace period', async () => {
    const r = runner.start('lab-08', { input: { ...example, tokenDelayMs: 100 } });
    const off = runner.subscribe(r.runId, () => {});
    await new Promise((res) => setTimeout(res, 150));
    off();
    expect((await runner.waitFor(r.runId)).status).toBe('cancelled');
    expect(runner.activeCount).toBe(0);
  });
});
