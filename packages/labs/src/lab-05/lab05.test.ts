import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { labSourceDir, labsPackageDir } from '../paths.js';
import { lab05, Lab05InputSchema } from './run.js';

const runner = new LabRunner({ registry: new LabRegistry([lab05]), services: {}, liveEnabled: false });
let fake: Server;
let port = 0;

// A stand-in for `mastra dev` that serves the recorded /api/agents body plus a Studio-like page.
beforeAll(async () => {
  const recorded = JSON.parse(await readFile(join(labSourceDir('lab-05'), 'recorded-agents.json'), 'utf8')) as {
    response: unknown;
  };
  fake = createServer((req, res) => {
    if (req.url === '/api/agents') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(recorded.response));
    } else {
      res.setHeader('content-type', 'text/html');
      res.end('<!doctype html><html><head><title>Mastra Studio</title></head></html>');
    }
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', () => r()));
  port = (fake.address() as AddressInfo).port;
});
afterAll(async () => {
  await runner.dispose();
  await new Promise<void>((r) => fake.close(() => r()));
});

describe('lab-05 Studio probe', () => {
  it('probes a local Studio-compatible server and finds the agent', async () => {
    const r = runner.start('lab-05', {
      input: { target: 'local', studioUrl: `http://127.0.0.1:${port}`, agentId: 'assistant-agent' },
    });
    await runner.waitFor(r.runId);
    const result = runner.events(r.runId).find((e) => e.type === 'result');
    expect(result).toMatchObject({
      validation: { passed: true },
      output: { reachable: true, studioUiDetected: true, agent: { id: 'assistant-agent', provider: 'openai' } },
    });
    expect(runner.events(r.runId).filter((e) => e.type === 'tool-finish')).toHaveLength(2);
  });

  it.each([
    'http://example.com:4111',
    'http://10.0.0.5:4111',
    'https://localhost:4111',
    'http://localhost:22',
    'http://localhost:4111/api/agents',
    'file:///etc/passwd',
  ])('refuses non-loopback or unsafe URL %s', (studioUrl) => {
    expect(Lab05InputSchema.safeParse({ target: 'local', studioUrl, agentId: 'assistant-agent' }).success).toBe(false);
  });

  it('the recorded response matches the reference course project', async () => {
    const recorded = JSON.parse(await readFile(join(labSourceDir('lab-05'), 'recorded-agents.json'), 'utf8')) as {
      response: Record<string, { instructions: string; modelId: string }>;
    };
    const agentFile = await readFile(
      join(labsPackageDir(), '..', '..', 'examples/course-project/src/mastra/agents/assistant-agent.ts'),
      'utf8',
    );
    const rec = recorded.response['assistant-agent']!;
    expect(agentFile).toContain(rec.instructions);
    expect(agentFile).toContain(`openai/${rec.modelId}`);
  });

  it('course project stays identical to the Lab 01 template defaults', async () => {
    for (const f of ['src/mastra/index.ts', 'src/mastra/agents/assistant-agent.ts', 'tsconfig.json']) {
      const a = await readFile(join(labSourceDir('lab-01'), 'template', f), 'utf8');
      const b = await readFile(join(labsPackageDir(), '..', '..', 'examples/course-project', f), 'utf8');
      expect(b, f).toBe(a);
    }
  });
});
