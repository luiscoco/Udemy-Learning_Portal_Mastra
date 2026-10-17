import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices, createMemoryService } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { offlineObservations, probeObservationalMemory, statedFacts } from './probe.js';
import { FALLBACK_LABEL, lab25, NATIVE_LABEL, type Lab25Output } from './run.js';

const dir = testMemoryDir('lab25');
const runner = new LabRunner({
  registry: new LabRegistry([lab25]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: dir }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-25', { input: { ...lab25.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  return {
    events,
    result: events.find((e) => e.type === 'result') as { output: Lab25Output; validation: { passed: boolean } } | undefined,
  };
}

describe('lab-25 capability probe (DoD: test records capabilities)', () => {
  it('records native OM support with evidence for the installed packages', async () => {
    const opened = await createMemoryService(() => dir).open('probe-unit');
    const caps = probeObservationalMemory(opened.storage);
    await opened.close();
    expect(caps.memoryVersion).toBe('1.38.0');
    expect(caps.rows.map((r) => [r.name, r.available])).toEqual([
      ['version', true],
      ['export', true],
      ['docs', true],
      ['storage-read-api', true],
      ['storage-adapter', true],
    ]);
    expect(caps.nativeAvailable).toBe(true);
    expect(probeObservationalMemory(opened.storage, '@acme/unknown-store').nativeAvailable).toBe(false);
  });

  it('formats offline observations from first-person statements only', () => {
    expect(statedFacts("Hi! I'm allergic to peanuts. Can you help? My dog is Rex.")).toEqual([
      "I'm allergic to peanuts.",
      'My dog is Rex.',
    ]);
    expect(offlineObservations('What time is it?')).toBe('* 🟡 No new facts stated.');
  });
});

describe('lab-25 observational memory', () => {
  it('native: observations are stored and injected into the next turn', async () => {
    const { result } = await run();
    expect(result!.validation.passed).toBe(true);
    expect(result!.output).toMatchObject({ implementation: 'native', label: NATIVE_LABEL, injectedIntoPrompt: true });
    expect(result!.output.observations).toContain('allergic to peanuts');
    expect(result!.output.observerCalls).toBeGreaterThan(0);
    expect(result!.output.observedMessages).toBeGreaterThan(0);
  });

  it('fallback: explicitly labelled and never reported as native', async () => {
    const { result, events } = await run({ implementation: 'fallback' });
    expect(result!.output).toMatchObject({
      implementation: 'fallback',
      label: FALLBACK_LABEL,
      observedMessages: 0,
      tokens: { observed: null },
    });
    expect(events.some((e) => e.type === 'log' && e.message.includes(FALLBACK_LABEL))).toBe(true);
    expect(JSON.stringify(result!.output)).not.toContain(NATIVE_LABEL);
  });
});
