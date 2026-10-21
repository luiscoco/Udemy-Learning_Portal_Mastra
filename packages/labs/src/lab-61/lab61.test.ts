import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab61Definition } from './definition.js';
import { Lab61InputSchema, lab61, type Lab61Output } from './run.js';
import { startDemo } from './server.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab61]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

describe('Lab 61', () => {
  it('executes real HTTP probes, checks all defences and never emits credentials', async () => {
    const passcode = 'invented-secret-demo-61';
    const run = runner.start('lab-61', { input: { ...lab61Definition.exampleInput, passcode } });
    expect((await runner.waitFor(run.runId)).status).toBe('succeeded');
    const events = runner.events(run.runId);
    const result = events.find((e) => e.type === 'result');
    expect(result?.type === 'result' && result.validation?.passed).toBe(true);
    expect(result?.type === 'result' && (result.output as Lab61Output).statuses).toEqual(
      lab61Definition.expectedOutput.example.statuses,
    );
    expect(JSON.stringify(events)).not.toContain(passcode);
    expect(JSON.stringify(events)).not.toContain('mlp_session=');
    expect(events.filter((e) => e.type === 'workflow-step')).toHaveLength(6);
  });
  it('rejects identical demo learners and out-of-range input', () => {
    expect(Lab61InputSchema.safeParse({ username: 'Alice', otherUser: 'alice', ttlMs: 1_000 }).success).toBe(false);
    expect(Lab61InputSchema.safeParse({ username: 'alice', otherUser: 'bob', ttlMs: 999 }).success).toBe(false);
  });
  it('closes its listener after normal completion or cancellation', async () => {
    for (const cancel of [false, true]) {
      const ctrl = new AbortController();
      const demo = await startDemo({ users: ['alice'], ttlMs: 1_000, signal: ctrl.signal });
      expect((await fetch(demo.base + '/api/runs')).status).toBe(401);
      if (cancel) ctrl.abort();
      await demo.close();
      await expect(fetch(demo.base + '/api/runs')).rejects.toThrow();
    }
  });
});
