import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices, stagingOrigin } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { lab73Definition } from './definition.js';
import { simulateRelease, type ReleaseOptions } from './release.js';
import { Lab73InputSchema, lab73 } from './run.js';

const base: ReleaseOptions = {
  scenario: 'healthy',
  strategy: 'single',
  readinessGate: true,
  readinessTimeoutS: 60,
  autoRollback: true,
  tag: '5987a11',
};
const sim = (o: Partial<ReleaseOptions>) => simulateRelease({ ...base, ...o });
const ids = (r: ReturnType<typeof simulateRelease>) => r.steps.map((s) => `${s.stepId}:${s.status}`);

describe('release simulator', () => {
  it('a healthy release passes the gate, moves traffic and the smoke test', () => {
    const r = sim({});
    expect(ids(r)).toEqual([
      'build:success',
      'push:success',
      'create-revision:success',
      'readiness-gate:success',
      'shift-traffic:success',
      'smoke:success',
      'summary:success',
    ]);
    expect(r).toMatchObject({ released: true, rolledBack: false, downtimeS: 0, activeImage: 'mastra-learning-platform:5987a11' });
  });

  it.each(['missing-secret', 'readiness-fails'] as const)(
    '%s: the gate holds, traffic never moves, the release is retired',
    (scenario) => {
      const r = sim({ scenario });
      expect(ids(r)).toContain('readiness-gate:failed');
      expect(ids(r)).toContain('shift-traffic:skipped');
      expect(r).toMatchObject({
        released: false,
        rolledBack: true,
        downtimeS: 0,
        activeImage: 'mastra-learning-platform:previous',
      });
    },
  );

  it('without a gate, learners get downtime until the rollback finishes', () => {
    const r = sim({ scenario: 'missing-secret', readinessGate: false });
    expect(r.downtimeS).toBe(60 + 12); // the timeout, then redeploying the old image
    const bg = sim({ scenario: 'missing-secret', readinessGate: false, strategy: 'blue-green' });
    expect(bg.downtimeS).toBe(61);
    expect(sim({ readinessGate: false }).downtimeS).toBe(12); // even a healthy release serves while starting
  });

  it('slow start depends on the readiness timeout', () => {
    expect(sim({ scenario: 'slow-start' }).released).toBe(false);
    expect(sim({ scenario: 'slow-start', readinessTimeoutS: 90 }).released).toBe(true);
  });

  it('buffered SSE is caught only by the smoke test; blue-green rolls back faster', () => {
    const single = sim({ scenario: 'sse-buffered' });
    const bg = sim({ scenario: 'sse-buffered', strategy: 'blue-green' });
    for (const r of [single, bg]) {
      expect(ids(r)).toContain('readiness-gate:success');
      expect(ids(r)).toContain('smoke:failed');
      expect(r.rolledBack).toBe(true);
    }
    const rollbackS = (r: typeof single) =>
      r.steps.find((s) => s.stepId === 'rollback')!.atS - r.steps.find((s) => s.stepId === 'smoke')!.atS;
    expect(rollbackS(bg)).toBeLessThan(rollbackS(single));
    expect(sim({ scenario: 'sse-buffered', autoRollback: false })).toMatchObject({ rolledBack: false, released: false });
  });

  it('every plan includes a rollback command', () => {
    for (const strategy of ['single', 'blue-green'] as const)
      expect(sim({ strategy }).commands.some((c) => c.includes('rollback'))).toBe(true);
  });
});

describe('Lab 73', () => {
  const services = createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab-73') });
  const runner = new LabRunner({ registry: new LabRegistry([lab73]), services, liveEnabled: false });
  afterAll(() => runner.dispose());

  it('streams one step event per release step and passes its checks', async () => {
    const r = runner.start('lab-73', { input: lab73Definition.exampleInput });
    await runner.waitFor(r.runId);
    const events = runner.events(r.runId);
    const done = events.flatMap((e) => (e.type === 'workflow-step' && e.status !== 'running' ? [e.stepId] : []));
    expect(done).toEqual(['build', 'push', 'create-revision', 'readiness-gate', 'shift-traffic', 'smoke', 'summary']);
    const result = events.find((e) => e.type === 'result');
    expect(result?.type === 'result' && result.validation?.passed).toBe(true);
  });

  it('accepts only https staging origins from the server environment', () => {
    expect(stagingOrigin('https://mlp-staging.example.azurecontainerapps.io/some/path')).toBe(
      'https://mlp-staging.example.azurecontainerapps.io',
    );
    expect(stagingOrigin('http://insecure.example')).toBeUndefined();
    expect(stagingOrigin('https://user:pw@host.example')).toBeUndefined();
    expect(stagingOrigin('not a url')).toBeUndefined();
    expect(createLabServices({ serverMode: 'offline', env: { STAGING_URL: 'https://a.example/x' } }).stagingUrl).toBe(
      'https://a.example',
    );
  });

  it('validates the image tag', () => {
    expect(Lab73InputSchema.safeParse({ ...lab73Definition.exampleInput, tag: 'latest' }).success).toBe(false);
  });
});
