import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { openVectorStore } from '@mlp/mastra-runtime';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { indexNameFor, mockEmbedder, resolveEmbedder } from './embedders.js';
import { lab38, STORE_FILE, type Lab38Output } from './run.js';

const dir = testMemoryDir('lab38');
const services = createLabServices({ serverMode: 'offline', env: {}, memoryDir: dir });
const runner = new LabRunner({ registry: new LabRegistry([lab38]), services, liveEnabled: false });
afterAll(() => runner.dispose());

type Result = { output: Lab38Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-38', { input: { ...lab38.definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result)
    throw new Error(
      JSON.stringify(events.filter((e) => e.type === 'complete' || e.type === 'log' || e.type === 'error').slice(-3)),
    );
  return result;
}
const check = (v: Result['validation'], id: string) => v.checks.find((c) => c.id === id)?.passed;

describe('lab-38 embedders (unit)', () => {
  it('the mock is deterministic and normalised, and related words land closer', async () => {
    const e = mockEmbedder();
    const [a, b, c] = (await e.embed(['refund the money', 'refund the money', 'express shipping'])).embeddings;
    expect(a).toEqual(b);
    expect(Math.sqrt(a!.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 5);
    const [r] = (await e.embed(['money back'])).embeddings;
    const cos = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i]!, 0);
    expect(cos(a!, r!)).toBeGreaterThan(cos(c!, r!));
  });
  it('offline never resolves a provider; live needs the key', () => {
    expect(resolveEmbedder('default', { mode: 'offline', openaiConfigured: true, dimensions: 0 }).id).toBe(
      'mock/concept-hash-64',
    );
    expect(() =>
      resolveEmbedder('openai/text-embedding-3-small', { mode: 'offline', openaiConfigured: true, dimensions: 0 }),
    ).toThrow(/Offline mode never calls a provider/);
    expect(() => resolveEmbedder('default', { mode: 'live', openaiConfigured: false, dimensions: 0 })).toThrow(/OPENAI_API_KEY/);
    expect(resolveEmbedder('default', { mode: 'live', openaiConfigured: true, dimensions: 256 }).dimensions).toBe(256);
  });
  it('index names separate embedders and dimensions', () => {
    expect(indexNameFor({ id: 'openai/text-embedding-3-small', dimensions: 1536 })).toBe('l38_text_embedding_3_small_1536');
    expect(indexNameFor({ id: 'openai/text-embedding-3-small', dimensions: 256 })).toBe('l38_text_embedding_3_small_256');
  });
});

describe('lab-38 embeddings and store (DoD)', () => {
  it('deterministic vector records are stored and retrievable; a second run changes nothing', async () => {
    const first = await run();
    expect(first.validation.passed).toBe(true);
    expect(first.output.records).toHaveLength(13);
    const second = await run();
    expect(second.output.records.map((r) => r.id)).toEqual(first.output.records.map((r) => r.id));
    expect(second.output.index!.countAfterFirst).toBe(first.output.index!.countAfterSecond); // persisted, no duplicates
    expect(second.output.vectorPreview).toEqual(first.output.vectorPreview);
  });

  it('random ids duplicate records on re-upsert', async () => {
    const { output, validation } = await run({ store: 'in-memory', idStrategy: 'random' });
    expect(output.index).toMatchObject({ countAfterFirst: 13, countAfterSecond: 26 });
    expect(check(validation, 'idempotent-upsert')).toBe(false);
  });

  it('refuses to mix dimensions in an existing index', async () => {
    const indexName = indexNameFor(mockEmbedder());
    const store = openVectorStore(services.memory.file(`${STORE_FILE}-mismatch`));
    await store.createIndex({ indexName, dimension: 32 });
    await store.createIndex({ indexName, dimension: 64 }); // silently ignored by libSQL: the index stays 32-dimensional
    expect((await store.describeIndex({ indexName })).dimension).toBe(32);
  });

  it('batches respect the batch size', async () => {
    const { output } = await run({ store: 'in-memory', batchSize: 4 });
    expect(output.batches.map((b) => b.size)).toEqual([4, 4, 4, 1]);
  });
});
