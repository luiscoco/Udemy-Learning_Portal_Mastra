import { writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { inspectFile } from './inspect.js';
import { lab02, repoRoot } from './run.js';

const runner = new LabRunner({ registry: new LabRegistry([lab02]), services: {}, liveEnabled: false });
afterAll(() => runner.dispose());

const correct = lab02.definition.exampleInput;

async function run(input: Record<string, unknown>) {
  const r = runner.start('lab-02', { input });
  await runner.waitFor(r.runId);
  return runner.events(r.runId);
}

describe('lab-02 architecture manifest', () => {
  it('confirms the example mapping with evidence and an inspection trace', async () => {
    const events = await run(correct);
    const result = events.find((e) => e.type === 'result');
    expect(result?.type === 'result' && result.validation?.passed).toBe(true);
    const out = (result as { output: { rootScripts: Record<string, string>; agentRegistration: string[] } }).output;
    expect(Object.keys(out.rootScripts)).toEqual(expect.arrayContaining(['dev', 'build', 'test']));
    expect(out.agentRegistration.join('\n')).toContain('new Mastra(');
    expect(events.filter((e) => e.type === 'tool-start').length).toBeGreaterThan(5);
  });

  it('fails only the UI check for a wrong UI mapping, naming the missing evidence', async () => {
    const events = await run({ ...correct, ui: 'apps/api' });
    const result = events.find((e) => e.type === 'result');
    const checks = result?.type === 'result' ? result.validation!.checks : [];
    expect(checks.filter((c) => !c.passed).map((c) => c.id)).toEqual(['layer-ui']);
    expect(checks.find((c) => c.id === 'layer-ui')?.message).toMatch(/react/);
  });

  it('never reads .env contents even when the file exists', async () => {
    const envPath = join(repoRoot(), '.env');
    const existed = existsSync(envPath);
    if (!existed) await writeFile(envPath, 'OPENAI_API_KEY=sk-should-never-appear-123456\n');
    try {
      const events = await run(correct);
      expect(JSON.stringify(events)).not.toContain('sk-should-never-appear');
      expect(JSON.stringify(events)).not.toMatch(/"path":"\.env"/);
    } finally {
      if (!existed) await rm(envPath);
    }
  });

  it('rejects free paths and refuses to read outside the repository', async () => {
    expect(() => runner.start('lab-02', { input: { ...correct, ui: '../../etc' } })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
    await expect(inspectFile(repoRoot(), '../outside.txt')).rejects.toThrow(/outside the repository/);
  });
});
