import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices, createMemoryService } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { lab21, type Lab21Output } from './run.js';

const dir = testMemoryDir('lab21');
const runner = new LabRunner({
  registry: new LabRegistry([lab21]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: dir }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-21', { input: { ...lab21.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  return {
    events,
    result: events.find((e) => e.type === 'result') as { output: Lab21Output; validation: { passed: boolean } },
  };
}

describe('memory service', () => {
  it('rejects unsafe names without touching the disk', () => {
    const svc = createMemoryService(() => dir);
    expect(() => svc.file('../escape')).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    expect(svc.file('lab-21')).toBe(join(dir, 'lab-21.db'));
  });

  it('a second instance reads what the first wrote', async () => {
    const svc = createMemoryService(() => dir);
    const a = await svc.open('reopen');
    await a.memory.saveThread({ thread: { id: 't', resourceId: 'r', title: 'x', createdAt: new Date(), updatedAt: new Date() } });
    await a.close();
    const b = await svc.open('reopen');
    expect((await b.memory.getThreadById({ threadId: 't' }))?.resourceId).toBe('r');
    await b.close();
  });
});

describe('lab-21 restart (in-process)', () => {
  it('new instances answer from the persisted history', async () => {
    const { result, events } = await run();
    expect(result.validation.passed).toBe(true);
    // Runs without an owner use the 'local' partition (L62).
    expect(existsSync(join(dir, 'tenants', 'local', 'lab-21.db'))).toBe(true);
    expect(result.output.recalledAfterRestart.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(result.output.history).toHaveLength(6);
    const restart = events.find((e) => e.type === 'workflow-step' && e.stepId === 'restart' && e.status === 'success');
    expect(restart).toMatchObject({ output: { reopened: true, messagesFound: 4 } });
  });

  it('with reset off, history accumulates across runs', async () => {
    await run({ threadId: 'accumulate' });
    const second = await run({ threadId: 'accumulate', resetThread: false });
    expect(second.result.output.recalledAfterRestart).toHaveLength(10); // 6 from run 1 + 4 from run 2's session 1
    expect(second.result.output.history).toHaveLength(12);
  });
});

describe('lab-21 concurrent runs on one thread', () => {
  it('are serialized, so a reset never interleaves with another run’s conversation', async () => {
    const [a, b] = await Promise.all([run({ threadId: 'shared-thread' }), run({ threadId: 'shared-thread' })]);
    expect(a.result.validation.passed).toBe(true);
    expect(b.result.validation.passed).toBe(true);
    expect(b.result.output.recalledAfterRestart).toHaveLength(4);
  });
});
