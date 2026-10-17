import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices, createMemoryService } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { extractPreferences, lab23, type Lab23Output } from './run.js';
import { PreferencesSchema, readProfile, updateProfile } from './profile.js';

const dir = testMemoryDir('lab23');
const runner = new LabRunner({
  registry: new LabRegistry([lab23]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: dir }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-23', { input: { ...lab23.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  return { events, result: events.find((e) => e.type === 'result') as { output: Lab23Output; validation: { passed: boolean } } };
}

describe('lab-23 profile service (unit)', () => {
  it('validates, merges and rejects with field reasons', async () => {
    const opened = await createMemoryService(() => dir).open('lab23-unit', {
      workingMemory: { enabled: true, scope: 'resource', schema: PreferencesSchema },
    });
    const ids = { threadId: 't', resourceId: 'u' };
    expect(await updateProfile(opened.memory, ids, { seat: 'window' }, { validate: true })).toMatchObject({ ok: true });
    expect(await updateProfile(opened.memory, ids, { currency: 'EUR' }, { validate: true })).toMatchObject({
      ok: true,
      profile: { seat: 'window', currency: 'EUR' },
    });
    expect(await updateProfile(opened.memory, ids, { seat: 'roof' }, { validate: true })).toMatchObject({
      ok: false,
      errors: [{ path: 'seat' }],
    });
    expect(await updateProfile(opened.memory, ids, { favouriteColour: 'blue' }, { validate: true })).toMatchObject({ ok: false });
    expect(await readProfile(opened.memory, ids)).toEqual({ seat: 'window', currency: 'EUR' });
    await opened.close();
  });

  it('extracts only what a message states', () => {
    expect(extractPreferences("Hi, I'm Ana. I always fly from LIS and I prefer window seats.")).toEqual({
      name: 'Ana',
      homeAirport: 'LIS',
      seat: 'window',
    });
    expect(extractPreferences("Also, I'm vegetarian.")).toEqual({ dietary: ['vegetarian'] });
  });
});

describe('lab-23 working memory (DoD)', () => {
  it('a preference survives into the next conversation and bad updates are rejected', async () => {
    const { result } = await run();
    expect(result.validation.passed).toBe(true);
    const [first, second, roof] = result.output.conversation;
    expect(first!.toolCalls).toEqual([expect.objectContaining({ status: 'success' })]);
    expect(second!.toolCalls).toEqual([
      expect.objectContaining({ status: 'success', args: { memory: { dietary: ['vegetarian'] } } }),
    ]);
    expect(roof!.toolCalls).toEqual([expect.objectContaining({ status: 'invalid', error: expect.stringContaining('seat') })]);
    expect(result.output.settingsUpdates.map((u) => u.result.ok)).toEqual([true, false, false, false]);
    expect(result.output.followUp.answer).toContain('window');
    expect(result.output.followUpSawProfile).toBe(true);
  });

  it('two runs keep separate profiles (run-scoped users)', async () => {
    const [a, b] = await Promise.all([
      run({ settingsUpdates: [{ currency: 'USD' }] }),
      run({ settingsUpdates: [{ currency: 'GBP' }] }),
    ]);
    expect((a.result.output.stored as { currency: string }).currency).toBe('USD');
    expect((b.result.output.stored as { currency: string }).currency).toBe('GBP');
  });
});
