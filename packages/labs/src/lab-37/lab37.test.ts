import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { analyseChunks, coverage, isDegenerate, locate } from './chunks.js';
import { CORPUS } from './corpus.js';
import { SENTENCE_FRAGMENT_TEXT } from './fixtures.js';
import { lab37, type Lab37Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab37]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab37') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab37Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown>) {
  const r = runner.start('lab-37', { input: { ...lab37.definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'complete' || e.type === 'log').slice(-3)));
  return result;
}

describe('lab-37 chunk analysis (unit)', () => {
  const src = 'Alpha beta. Gamma delta. Alpha beta.';
  it('uses a start index only when it verifies, otherwise relocates from the previous chunk', () => {
    expect(locate(src, 'Gamma delta.', 12, 0)).toEqual({ start: 12, offsetSource: 'mastra' });
    expect(locate(src, 'Gamma delta.', -1, 0)).toEqual({ start: 12, offsetSource: 'relocated' });
    expect(locate(src, 'Alpha beta.', -1, 12)).toEqual({ start: 25, offsetSource: 'relocated' }); // the second occurrence
    expect(locate(src, 'not there', -1, 0)).toEqual({ start: null, offsetSource: 'unlocated' });
  });
  it('drops degenerate chunks and measures coverage of letters and digits', () => {
    expect(isDegenerate('.')).toBe(true);
    expect(isDegenerate('  \n ')).toBe(true);
    expect(isDegenerate('§ 4')).toBe(false);
    const doc = { docId: 'd', name: 'd.txt', text: src };
    const a = analyseChunks(doc, [{ text: 'Alpha beta.', metadata: { startIndex: 0 } }, { text: '.', metadata: {} }], 'x');
    expect(a.chunks).toHaveLength(1);
    expect(a.dropped).toEqual([{ docId: 'd', rawLength: 1, reason: 'no letters or digits', text: '.' }]);
    expect(coverage(src, a.chunks)).toBeCloseTo(9 / 28); // 9 of the 28 letters
  });
  it('rejects bad configurations', () => {
    const bad = (c: Record<string, unknown>) => lab37.inputSchema.safeParse({ source: 'sample', configs: [{ label: 'x', strategy: 'recursive', maxSize: 100, overlap: 0, ...c }] }).success;
    expect(bad({ overlap: 100 })).toBe(false);
    expect(bad({ strategy: 'token', maxSize: 2000 })).toBe(false);
    expect(lab37.inputSchema.safeParse({ source: 'paste', text: 'short', configs: [{ label: 'x', strategy: 'recursive', maxSize: 100, overlap: 0 }] }).success).toBe(false);
  });
});

describe('lab-37 chunking strategies (DoD)', () => {
  it('previews show source and verified offsets; no empty chunks; sizes and coverage hold', async () => {
    const { output, validation } = await run({});
    expect(validation.passed).toBe(true);
    for (const r of output.results)
      for (const c of r.chunks) {
        const doc = CORPUS.find((d) => d.docId === c.docId)!;
        expect(doc.text.slice(c.start!, c.end!).replace(/\s+/g, ' ').trim().slice(0, 120)).toBe(c.preview);
        expect(c.source).toBe(doc.name);
      }
    const token = output.results.find((r) => r.config.strategy === 'token')!;
    expect(token.stats.offsets.relocated).toBeGreaterThan(0); // Mastra reported startIndex -1 for overlapping token chunks
    const recursive = output.results.find((r) => r.config.label === 'recursive-200')!;
    expect(recursive.stats.totalOverlapChars).toBeGreaterThan(0);
    expect(output.results.find((r) => r.config.label === 'char-300')!.stats.totalOverlapChars).toBe(0);
  });

  it('a degenerate sentence fragment is dropped and reported', async () => {
    const { output, validation } = await run({ source: 'paste', text: SENTENCE_FRAGMENT_TEXT, configs: [{ label: 's', strategy: 'sentence', maxSize: 120, overlap: 0 }] });
    expect(output.results[0]!.dropped).toEqual([expect.objectContaining({ text: '.', reason: 'no letters or digits', strategy: 'sentence' })]);
    expect(validation.passed).toBe(true);
  });

  it('an empty course library is reported honestly', async () => {
    const { output, validation } = await run({ source: 'library' });
    expect(output.note).toMatch(/library is empty/);
    expect(validation.passed).toBe(false);
  });
});
