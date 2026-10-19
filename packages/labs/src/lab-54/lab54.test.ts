import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { extractOffline } from './agents.js';
import { backoffMs, runBoundary, StepError, type AttemptRecord } from './boundary.js';
import { lab54Definition } from './definition.js';
import { lab54, type Lab54Output } from './run.js';
import { updateIssues } from './schemas.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab54]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab54Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-54', { input: { ...lab54Definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return { ...result, events };
}
const attemptsOf = (o: Lab54Output, stepId: string) =>
  o.runs[0]!.attempts.filter((a) => a.stepId === stepId).map((a) => (a.ok ? 'ok' : a.code));

describe('lab-54 boundary (unit)', () => {
  const signal = new AbortController().signal;
  it('rethrows while retries remain and returns a typed failure on the last attempt', async () => {
    const records: AttemptRecord[] = [];
    const base = { stepId: 's', maxRetries: 1, schema: z.number(), signal, record: (a: AttemptRecord) => records.push(a) };
    const fail = () => Promise.reject(new StepError('PROVIDER_503', 'down', true));
    await expect(runBoundary({ ...base, retryCount: 0, attempt: fail })).rejects.toThrow('down');
    expect(await runBoundary({ ...base, retryCount: 1, attempt: fail })).toMatchObject({
      ok: false,
      error: { code: 'PROVIDER_503' },
      attempts: 2,
    });
    expect(await runBoundary({ ...base, retryCount: 1, attempt: async () => 'x' })).toMatchObject({
      ok: false,
      error: { code: 'OUTPUT_SCHEMA_INVALID' },
    });
    expect(records.map((r) => [r.attempt, r.ok, r.simulated, r.backoffMs])).toEqual([
      [1, false, true, 0],
      [2, false, true, 100],
      [2, false, false, 100],
    ]);
    expect([0, 1, 2, 3].map(backoffMs)).toEqual([0, 100, 200, 400]);
  });
  it('extracts and validates deterministically', () => {
    expect(extractOffline(lab54Definition.exampleInput.report)).toMatchObject({
      service: 'checkout',
      severity: 'sev1',
      customerImpact: true,
    });
    expect(updateIssues('Search is slow (see L2).', 'checkout')).toEqual([
      'does not mention checkout',
      'contains internal log ids',
    ]);
  });
});

describe('lab-54 Coordinated agent workflow (DoD)', () => {
  it('three agents run with a stable step trace', async () => {
    const { output, validation } = await run();
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.outcome).toMatchObject(lab54Definition.expectedOutput.example.outcome);
    expect(output.runs).toHaveLength(2);
    expect(output.runs[0]!.signature).toBe(
      'extract:success:1:ok | fetch-logs:success | diagnose:success:1:ok | communicate:success:1:ok | assemble:success | outcome:complete',
    );
    expect(output.runs[1]!.signature).toBe(output.runs[0]!.signature);
    expect(output.runs[0]!.calls.map((c) => c.agent)).toEqual(['extractor', 'diagnostician', 'communicator']);
  });

  it('retries a transient failure with backoff and completes', async () => {
    const { output, validation, events } = await run({ fault: 'transient-diagnosis' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(attemptsOf(output, 'diagnose')).toEqual(['PROVIDER_503', 'PROVIDER_503', 'ok']);
    expect(output.runs[0]!.attempts.filter((a) => a.stepId === 'diagnose').map((a) => a.backoffMs)).toEqual([0, 100, 200]);
    expect(events.filter((e) => e.type === 'workflow-step' && String(e.stepId).startsWith('diagnose attempt'))).toHaveLength(6);
  });

  it('catches an invalid agent output at the boundary', async () => {
    const { output, validation } = await run({ fault: 'invalid-extraction', repeatRuns: 1 });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(attemptsOf(output, 'extract')).toEqual(['OUTPUT_SCHEMA_INVALID', 'ok']);
    expect(output.runs[0]!.attempts[0]!.simulated).toBe(true);
  });

  it('contains permanent and critical failures', async () => {
    const degraded = await run({ fault: 'permanent-diagnosis', repeatRuns: 1 });
    expect(degraded.validation.passed, JSON.stringify(degraded.validation.checks)).toBe(true);
    expect(degraded.output.outcome!.update).toContain('under investigation');
    const safe = await run({ fault: 'extract-down', repeatRuns: 1 });
    expect(safe.validation.passed, JSON.stringify(safe.validation.checks)).toBe(true);
    expect(safe.output.runs[0]!.calls.map((c) => c.agent)).toEqual(['extractor', 'extractor', 'extractor']);
    expect(safe.output.agentConversation.messages.at(-1)).toMatchObject({ to: 'human', kind: 'escalation' });
  });

  it('flags an unstable trace', async () => {
    const { output } = await run();
    const tampered = {
      ...output,
      runs: [output.runs[0]!, { ...output.runs[1]!, signature: `${output.runs[1]!.signature} | extra` }],
    };
    const v = lab54.validate!(tampered, lab54Definition.exampleInput as never, {
      events: [],
      mode: 'offline',
    }) as Result['validation'];
    expect(v.checks.find((c) => c.id === 'stable-trace')?.passed).toBe(false);
  });
});
