import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab27, parseOffline, type Lab27Output } from './run.js';
import { enrich, render, zonedToUtc } from './steps.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab27]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-27', { input: { ...lab27.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  return { events, result: events.find((e) => e.type === 'result') as { output: Lab27Output; validation: { passed: boolean } } };
}

describe('lab-27 step logic (unit)', () => {
  it('converts wall-clock time to UTC across zones and DST', () => {
    expect(zonedToUtc('2026-11-12', '09:30', 'Europe/Lisbon')).toBe('2026-11-12T09:30:00.000Z');
    expect(zonedToUtc('2026-07-12', '09:30', 'Europe/Lisbon')).toBe('2026-07-12T08:30:00.000Z');
    expect(zonedToUtc('2026-12-03', '09:30', 'Asia/Tokyo')).toBe('2026-12-03T00:30:00.000Z');
  });

  it('enriches and renders deterministically', () => {
    const e = enrich(parseOffline('Team offsite on 2026-11-12 at 09:30 in Lisbon, room Atlas, organiser Ana.'), '2026-10-17');
    expect(e).toMatchObject({ weekday: 'Thursday', daysUntil: 26, address: 'Rua Augusta 100, 1100-053 Lisboa' });
    const r = render({ title: 'A; B', when: 'x', startUtc: e.startUtc, where: 'Atlas', organiser: null, daysUntil: 1 });
    expect(r.ics).toContain('DTSTART:20261112T093000Z');
    expect(r.ics).toContain('SUMMARY:A\\; B'); // escaped per RFC 5545
    expect(r.markdown).toContain('in 1 day)');
  });
});

describe('lab-27 sequential steps (DoD)', () => {
  it('ordered events and typed transitions pass', async () => {
    const { result } = await run();
    expect(result.validation.passed).toBe(true);
    expect(result.output.stepExecutionPath.filter((s) => !s.startsWith('mapping_'))).toEqual(['parse', 'enrich', 'render']);
    expect(result.output.transitions.map((t) => t.valid)).toEqual([true, true, true]);
  });

  it('a mistyped field fails at the next schema’d step', async () => {
    const { result } = await run({ brokenEnrich: true });
    expect(result.output.status).toBe('failed');
    expect(result.output.error).toContain('daysUntil');
    expect(result.output.steps.find((s) => s.stepId === 'enrich')?.status).toBe('success');
    expect(result.output.transitions.find((t) => t.from === 'enrich')?.valid).toBe(false);
  });
});
