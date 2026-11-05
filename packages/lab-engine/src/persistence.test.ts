import { afterEach, expect, it, vi } from 'vitest';
import type { ExecutionEvent } from '@mlp/contracts';
import { LabRegistry } from './registry.js';
import { LabRunner } from './runner.js';
import { makeTestLab } from './testing.js';
import type { PersistedRun, RunPersistence } from './persistence.js';

const runners: LabRunner[] = [];
afterEach(async () => {
  await Promise.all(runners.splice(0).map((r) => r.dispose()));
});
function store() {
  const rows = new Map<string, PersistedRun>();
  const persistence: RunPersistence = {
    create: vi.fn((row) => {
      rows.set(row.snapshot.runId, { ...structuredClone(row), events: [] });
    }),
    append: vi.fn((id, event, snapshot) => {
      const row = rows.get(id)!;
      rows.set(id, { ...row, snapshot, events: [...row.events, event] });
    }),
    capabilities: vi.fn((id, hashes) => {
      rows.get(id)!.tokenHashes = [...hashes];
    }),
    load: vi.fn((id) => rows.get(id)),
    list: vi.fn((owner, lab) =>
      [...rows.values()].filter((r) => r.ownerId === owner && r.snapshot.labId === lab).map((r) => r.snapshot),
    ),
    prune: vi.fn(() => []),
    assertHealthy: vi.fn(),
    close: vi.fn(),
  };
  return { rows, persistence };
}
function setup(persistence: RunPersistence) {
  const lab = makeTestLab();
  const run = vi.fn(lab.run);
  const runner = new LabRunner({ registry: new LabRegistry([{ ...lab, run }]), services: {}, liveEnabled: false, persistence });
  runners.push(runner);
  return { runner, run };
}

it('commits initial metadata before lab execution and events before subscribers see them', async () => {
  const { rows, persistence } = store();
  const { runner, run } = setup(persistence);
  const created = runner.start('lab-99', { input: { text: 'hello', delayMs: 5 } }, { ownerId: 'dev:alice' });
  expect(persistence.create).toHaveBeenCalledBefore(run);
  const seen: ExecutionEvent[] = [];
  runner.subscribe(created.runId, (event) => {
    expect(rows.get(created.runId)?.events[event.seq]).toEqual(event);
    seen.push(event);
  });
  await runner.waitFor(created.runId);
  expect(seen.at(-1)?.type).toBe('complete');
  expect(JSON.stringify(rows.get(created.runId))).not.toContain(created.runToken);
  expect(rows.get(created.runId)?.snapshot.status).toBe('succeeded');
});

it('does not execute lab code when initial persistence fails', () => {
  const { persistence } = store();
  vi.mocked(persistence.create).mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  const { runner, run } = setup(persistence);
  expect(() => runner.start('lab-99', { input: { text: 'hello' } })).toThrow('storage unavailable');
  expect(run).not.toHaveBeenCalled();
  expect(runner.activeCount).toBe(0);
});

it('aborts and finishes safely when even failure events cannot be stored', async () => {
  const { persistence } = store();
  vi.mocked(persistence.append).mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  const { runner } = setup(persistence);
  const created = runner.start('lab-99', { input: { text: 'hello' } });
  expect((await runner.waitFor(created.runId)).status).toBe('failed');
  expect(runner.events(created.runId).some((e) => e.type === 'error' && e.code === 'NOT_CONFIGURED')).toBe(true);
  expect(runner.activeCount).toBe(0);
});

it('keeps the starter capability plus a bounded recovery set and hydrates terminal records without execution', async () => {
  const { persistence, rows } = store();
  const a = setup(persistence);
  const created = a.runner.start('lab-99', { input: { text: 'hello' } }, { ownerId: 'dev:alice' });
  await a.runner.waitFor(created.runId);
  const oldest = a.runner.recoverToken(created.runId);
  let newest = oldest;
  for (let i = 0; i < 5; i++) newest = a.runner.recoverToken(created.runId);
  expect(() => a.runner.authorize(created.runId, created.runToken)).not.toThrow();
  expect(() => a.runner.authorize(created.runId, newest)).not.toThrow();
  expect(() => a.runner.authorize(created.runId, oldest)).toThrow();
  expect(rows.get(created.runId)?.tokenHashes).toHaveLength(5);
  const b = setup(persistence);
  expect(b.runner.get(created.runId)?.status).toBe('succeeded');
  expect(b.run).not.toHaveBeenCalled();
  expect(b.runner.ownerOf(created.runId)).toBe('dev:alice');
  expect(b.runner.recent('dev:bob', 'lab-99')).toEqual([]);
});
