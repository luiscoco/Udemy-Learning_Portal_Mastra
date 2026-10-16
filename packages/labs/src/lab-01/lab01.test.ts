import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { checkModelId } from '@mlp/mastra-runtime';
import { dataDir, labSourceDir, labsPackageDir } from '../paths.js';
import { agentIdentifiers, renderScaffold } from './scaffold.js';
import { typecheckProject } from './typecheck.js';
import { lab01, Lab01InputSchema, nodeSatisfies } from './run.js';

const runner = new LabRunner({ registry: new LabRegistry([lab01]), services: {}, liveEnabled: false });
afterAll(() => runner.dispose());

describe('lab-01 scaffold renderer', () => {
  it('derives agent identifiers', () => {
    expect(agentIdentifiers('Support Desk')).toEqual({ camel: 'supportDeskAgent', kebab: 'support-desk-agent' });
  });

  it('substitutes name, module type, agent, model and key variable', async () => {
    const files = await renderScaffold(join(labSourceDir('lab-01'), 'template'), {
      projectName: 'demo-app',
      agentName: 'Trip Planner',
      modelId: 'google/gemini-2.5-flash',
      apiKeyEnvVar: 'GOOGLE_API_KEY',
      moduleType: 'module',
    });
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
    expect(Object.keys(byPath).sort()).toEqual([
      '.env.example',
      '.gitignore',
      'package.json',
      'src/mastra/agents/trip-planner-agent.ts',
      'src/mastra/index.ts',
      'tsconfig.json',
    ]);
    expect(JSON.parse(byPath['package.json']!)).toMatchObject({ name: 'demo-app', type: 'module' });
    expect(byPath['src/mastra/index.ts']).toContain("from './agents/trip-planner-agent'");
    expect(byPath['src/mastra/agents/trip-planner-agent.ts']).toContain("id: 'trip-planner-agent'");
    expect(byPath['src/mastra/agents/trip-planner-agent.ts']).toContain("model: 'google/gemini-2.5-flash'");
    expect(byPath['.env.example']).toContain('GOOGLE_API_KEY=');
  });

  it('uses the real API key variable names from the Mastra registry', () => {
    expect(checkModelId('google/gemini-2.5-flash')).toMatchObject({ ok: true, apiKeyEnvVar: 'GOOGLE_API_KEY' });
    expect(checkModelId('anthropic/claude-haiku-4-5')).toMatchObject({ ok: true, apiKeyEnvVar: 'ANTHROPIC_API_KEY' });
  });
});

describe('lab-01 build step', () => {
  it('reports compiler diagnostics for a broken project instead of crashing', async () => {
    const dir = join(dataDir(), 'scaffolds', 'test-broken');
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ['src'] }));
    await writeFile(join(dir, 'src', 'index.ts'), 'const x: number = "not a number";\n');
    try {
      const r = await typecheckProject(dir, join(labsPackageDir(), 'package.json'), new AbortController().signal);
      expect(r.ok).toBe(false);
      expect(r.diagnostics[0]).toMatchObject({ file: 'src/index.ts', line: 1 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('lab-01 safety', () => {
  it('rejects path traversal in the project name', () => {
    expect(Lab01InputSchema.safeParse({ projectName: '../evil', provider: 'openai', agentName: 'X y' }).success).toBe(false);
    expect(() => runner.start('lab-01', { input: { projectName: '../evil', provider: 'openai', agentName: 'Helper' } })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });

  it('cancelling during the build terminates the compiler and removes the folder', async () => {
    const run = runner.start('lab-01', {
      input: { projectName: 'cancel-me', provider: 'openai', agentName: 'Helper', moduleType: 'module' },
    });
    // Wait until the build step starts, then cancel.
    await new Promise<void>((resolve) => {
      const off = runner.subscribe(run.runId, (e) => {
        if (e.type === 'workflow-step' && e.stepId === 'build' && e.status === 'running') {
          off();
          resolve();
        }
      });
    });
    runner.cancel(run.runId);
    const snap = await runner.waitFor(run.runId);
    expect(snap.status).toBe('cancelled');
    await new Promise((r) => setTimeout(r, 200)); // finally-block cleanup
    expect(existsSync(join(dataDir(), 'scaffolds', run.runId))).toBe(false);
  }, 60_000);

  it('checks the Node version requirement', () => {
    expect(nodeSatisfies('22.13.0')).toBe(true);
    expect(nodeSatisfies('24.1.0')).toBe(true);
    expect(nodeSatisfies('22.12.9')).toBe(false);
    expect(nodeSatisfies('20.18.0')).toBe(false);
  });
});
