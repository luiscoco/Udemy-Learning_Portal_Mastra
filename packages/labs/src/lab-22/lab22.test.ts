import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { lab22, type Lab22Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab22]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab22') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-22', { input: { ...lab22.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  return {
    events,
    result: events.find((e) => e.type === 'result') as {
      output: Lab22Output;
      validation: { passed: boolean; checks: { id: string; passed: boolean }[] };
    },
  };
}

describe('lab-22 user boundaries (DoD)', () => {
  it('separate users cannot retrieve each other’s threads', async () => {
    const { result } = await run();
    expect(result.validation.passed).toBe(true);
    const bobOnAlice = result.output.steps.filter((s) => s.as === 'bob' && s.thread === '$1');
    expect(bobOnAlice.map((s) => s.op)).toEqual(['history', 'send', 'reset', 'delete']);
    for (const s of bobOnAlice) expect(s.result).toEqual({ ok: false, code: 'NOT_FOUND', message: 'Thread not found' });
    // A foreign thread and a non-existent one look exactly the same.
    expect(result.output.steps[9]!.result).toEqual(bobOnAlice[0]!.result);
    // Alice's note survived every attack; her own reset emptied it but kept the thread.
    const aliceHistory = result.output.steps[10]!.result as { ok: true; data: { messages: { role: string; text: string }[] } };
    expect(aliceHistory.data.messages.filter((m) => m.role === 'user').map((m) => m.text)).toEqual([
      'Book the Alfa Pendular train on 3 May.',
    ]);
    expect(result.output.threads[0]).toMatchObject({ exists: true, userMessages: [] });
  });

  it('no event or result contains another run’s identities or raw thread ids', async () => {
    const { events } = await run();
    // Only what the lab emits (the engine's own runId/correlationId envelope fields are UUIDs by design).
    const payloads = events.map(({ runId: _r, correlationId: _c, ...rest }) => rest);
    expect(JSON.stringify(payloads)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('raw Mastra calls fail the boundary checks', async () => {
    const { result } = await run({ strategy: 'raw-mastra' });
    expect(result.validation.passed).toBe(false);
    const failed = result.validation.checks.filter((c) => !c.passed).map((c) => c.id);
    expect(failed).toEqual(expect.arrayContaining(['no-cross-user-read', 'no-cross-user-write', 'no-enumeration']));
    const rawSend = result.output.steps.find((s) => s.step === 7)!;
    expect(rawSend.result).toMatchObject({ ok: false, code: 'ERROR', message: expect.stringContaining('alice') });
  });

  it('two concurrent runs never see each other’s users or threads', async () => {
    const ops = [
      { as: 'alice', op: 'create', title: 'Mine' },
      { as: 'alice', op: 'list' },
    ];
    const [a, b] = await Promise.all([run({ operations: ops }), run({ operations: ops })]);
    for (const r of [a, b]) expect((r.result.output.steps[1]!.result as { data: unknown[] }).data).toHaveLength(1);
  });
});
