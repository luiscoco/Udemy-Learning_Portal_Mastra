import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { comparisonsDir, configHash, lab07 } from './run.js';
import { KEEP_COMPARISONS, listComparisons, saveComparison } from './store.js';

const example = lab07.definition.exampleInput;
const services = createLabServices({ serverMode: 'offline', env: {} });
const runner = new LabRunner({
  registry: new LabRegistry([lab07]),
  services,
  liveEnabled: false,
});
afterAll(() => runner.dispose());

describe('lab-07 instruction variants', () => {
  it('shows both variants with outputs linked to their configs and saves the comparison', async () => {
    const r = runner.start('lab-07', { input: example });
    await runner.waitFor(r.runId);
    const result = runner.events(r.runId).find((e) => e.type === 'result') as {
      validation: { passed: boolean };
      output: { variants: { label: string; configHash: string; output: string }[]; saved: { id: string } };
    };
    expect(result.validation.passed).toBe(true);
    const [a, b] = result.output.variants;
    expect(a!.output).not.toBe(b!.output);
    expect(a!.configHash).not.toBe(b!.configHash);
    expect(existsSync(join(comparisonsDir(services), `${result.output.saved.id}.json`))).toBe(true);
  });

  it('configHash is stable and changes with any config field', () => {
    const s = { modelId: 'openai/gpt-5-mini', maxSteps: 1 };
    const h = configHash('A', s.modelId, 'Be nice.', s);
    expect(configHash('A', s.modelId, 'Be nice.', s)).toBe(h);
    expect(configHash('B', s.modelId, 'Be nice.', s)).not.toBe(h);
    expect(configHash('A', s.modelId, 'Be kind.', s)).not.toBe(h);
    expect(configHash('A', 'anthropic/claude-haiku-4-5', 'Be nice.', s)).not.toBe(h);
  });
});

describe('comparison store', () => {
  it(`keeps only the newest ${KEEP_COMPARISONS} records and lists newest first`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mlp-cmp-'));
    try {
      for (let i = 0; i < KEEP_COMPARISONS + 3; i++) {
        const id = `run-${String(i).padStart(4, '0')}`;
        await saveComparison(dir, id, {
          id,
          savedAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
          settings: { modelId: 'm' },
          variants: [{ label: 'a' }, { label: 'b' }],
        });
      }
      await writeFile(join(dir, 'corrupt.json'), '{not json');
      const recent = await listComparisons(dir, 100);
      expect(recent.length).toBeLessThanOrEqual(KEEP_COMPARISONS);
      expect(recent[0]?.id).toBe(`run-${String(KEEP_COMPARISONS + 2).padStart(4, '0')}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects unsafe ids', async () => {
    await expect(saveComparison(tmpdir(), '../escape', {})).rejects.toThrow(/Invalid/);
  });
});
