import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testMemoryDir } from '@mlp/labs/test-memory';
import { createApp, type ApiApp } from './app.js';
import { parseConfig } from './config.js';
import { createLogger } from './logger.js';
import { signIn } from './test-auth.js';

// Two learners use the same labs with the same inputs; each must only ever see their own stored data.
let api: ApiApp;
let server: Server;
let base: string;
let alice: string;
let bob: string;

beforeAll(async () => {
  api = createApp({
    config: parseConfig({ NODE_ENV: 'test', AUTH_DEV_USERS: 'alice,bob', AUTH_LOGIN_RATE_MAX: '100', MAX_CONCURRENT_RUNS: '4' }),
    logger: createLogger('silent'),
    memoryDir: testMemoryDir('api-tenancy'),
  });
  server = api.app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  alice = await signIn(base, 'alice');
  bob = await signIn(base, 'bob');
});
afterAll(async () => {
  await api.runner.dispose();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

async function example(labId: string): Promise<Record<string, unknown>> {
  return ((await (await fetch(`${base}/api/labs/${labId}`)).json()) as { exampleInput: Record<string, unknown> }).exampleInput;
}

/** Starts a run as a learner, waits for it to finish and returns its result output. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(cookie: string, labId: string, overrides: Record<string, unknown> = {}): Promise<any> {
  const input = { ...(await example(labId)), ...overrides };
  const res = await fetch(`${base}/api/labs/${labId}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ input }),
  });
  expect(res.status).toBe(202);
  const { runId } = (await res.json()) as { runId: string };
  for (let i = 0; i < 600; i++) {
    const snap = (await (await fetch(`${base}/api/runs/${runId}`, { headers: { cookie } })).json()) as { status: string };
    if (snap.status !== 'running') break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const text = await (await fetch(`${base}/api/runs/${runId}/events`, { headers: { cookie } })).text();
  const result = text
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)) as { type: string; output?: unknown })
    .find((e) => e.type === 'result');
  expect(result, `${labId} finished with a result`).toBeDefined();
  return result!.output;
}

describe('tenant isolation across learners (L62)', () => {
  it('threads: Bob continuing the same thread id never recalls Alice’s messages', async () => {
    const secret = 'My name is Alice Q and my favourite train is the Glacier Express.';
    const a = await run(alice, 'lab-21', { messages: [secret], resetThread: true });
    expect(JSON.stringify(a.history)).toContain('Glacier Express');
    const b = await run(bob, 'lab-21', { messages: ['Hello, I am Bob.'], resetThread: false });
    expect(JSON.stringify(b.recalledAfterRestart)).not.toContain('Glacier Express');
    expect(JSON.stringify(b.history)).not.toContain('Alice Q');
    expect(b.dbFile).not.toBe(a.dbFile);
  }, 120_000);

  it('documents: Bob’s library does not contain Alice’s stored documents', async () => {
    const a = await run(alice, 'lab-36', { store: true });
    expect(a.library.documentsInLibrary).toBeGreaterThan(0);
    const b = await run(bob, 'lab-36', { store: true });
    // The same samples are new for Bob: nothing of Alice's is "already stored" in his library.
    expect(b.library.alreadyStored).toBe(0);
    expect(b.library.newDocuments).toBe(a.library.newDocuments + a.library.alreadyStored);
  }, 120_000);

  it('saved files: Bob’s recent comparisons never list Alice’s', async () => {
    const a = await run(alice, 'lab-07');
    const b = await run(bob, 'lab-07');
    const ids = (b.recentComparisons as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(b.saved.id);
    expect(ids).not.toContain(a.saved.id);
  }, 120_000);

  it('storage records: Bob gets his own evaluation dataset and experiments', async () => {
    const a = await run(alice, 'lab-58');
    expect(a.recorded.found).toBe(true);
    const b = await run(bob, 'lab-58');
    expect(b.seed.created).toBe(true); // a new dataset in Bob's partition, not Alice's
    expect(b.evalReport.experiment.id).not.toBe(a.evalReport.experiment.id);
    const again = await run(alice, 'lab-58');
    expect(again.seed.created).toBe(false); // Alice's own dataset is still there for her
  }, 180_000);
});
