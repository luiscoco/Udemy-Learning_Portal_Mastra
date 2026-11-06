import { afterAll, describe, expect, it, vi } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { buildInstructions, formatFacts, normalize, SupportContextSchema } from './profiles.js';
import { lab16, type Lab16Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab16]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-16', { input: { ...lab16.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  const result = runner.events(r.runId).find((e) => e.type === 'result') as {
    output: Lab16Output;
    validation: { passed: boolean; checks: { id: string; passed: boolean }[] };
  };
  return { ...result, events: runner.events(r.runId) };
}

describe('lab-16 profiles (unit)', () => {
  it('formats facts per locale with Intl', () => {
    expect(normalize(formatFacts('de-DE').total)).toBe('45,90 €');
    expect(formatFacts('en-US')).toEqual({ deliveryDate: 'October 21, 2026', total: '€45.90' });
    expect(formatFacts('ja-JP').deliveryDate).toBe('2026年10月21日');
  });

  it('builds instructions only from validated enum values', () => {
    const text = buildInstructions({ persona: 'lucia', tone: 'formal', locale: 'es-ES', requestId: 'req-2' });
    expect(text).toContain('You are Lucía,');
    expect(text).toContain('Reply only in Spanish (Spain).');
    expect(text).toContain('Sign off with: — Lucía');
    expect(
      SupportContextSchema.safeParse({ persona: 'lucia', tone: 'formal', locale: 'xx-XX', requestId: 'req-1' }).success,
    ).toBe(false);
  });
});

describe('lab-16 parallel requests', () => {
  it('parallel requests preserve independent instructions (DoD)', async () => {
    // Control the scripted model's delays: real scheduling under a busy full suite can reorder
    // 40 ms timers without changing the instruction isolation being demonstrated.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let result: Awaited<ReturnType<typeof run>>;
    try {
      const pending = run();
      await vi.advanceTimersByTimeAsync(500);
      result = await pending;
    } finally {
      vi.useRealTimers();
    }
    const { output, validation, events } = result;
    expect(validation.passed).toBe(true);
    const [a, b, c] = output.requests;
    expect(a!.instructions).toContain('You are Ava,');
    expect(b!.instructions).toContain('You are Lucía,');
    expect(c!.instructions).toContain('You are Kenji,');
    // The model received exactly the instructions the function produced for that request.
    for (const r of output.requests) expect(output.modelSaw[r.requestId]).toBe(r.instructions);
    // Overlapping, and finishing in reverse order of starting.
    const finished = events
      .filter((e) => e.type === 'workflow-step' && e.status === 'success')
      .map((e) => (e as { stepId: string }).stepId);
    expect(finished).toEqual(['req-3', 'req-2', 'req-1']);
  });

  it('stays isolated when four runs (twelve requests) execute concurrently', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => run()));
    for (const r of results) expect(r.validation.passed).toBe(true);
  });

  it('shared module state leaks the last profile into every request', async () => {
    const { output, validation } = await run({ strategy: 'shared-module-state' });
    expect(validation.passed).toBe(false);
    const failed = validation.checks.filter((c) => !c.passed).map((c) => c.id);
    expect(failed).toEqual(['instructions-isolated', 'answers-signed', 'locale-facts']);
    expect(output.requests.map((r) => r.answer.endsWith('— Kenji'))).toEqual([true, true, true]);
  });

  it('rejects duplicate personas at the input boundary', () => {
    const profiles = [
      { persona: 'ava', tone: 'friendly', locale: 'en-US' },
      { persona: 'ava', tone: 'formal', locale: 'de-DE' },
    ];
    expect(() => runner.start('lab-16', { input: { ...lab16.definition.exampleInput, profiles } })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });
});
