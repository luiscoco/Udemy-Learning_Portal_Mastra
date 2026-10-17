// Live end-to-end through the HTTP API: POST a live run, stream SSE, real provider call.
// Skipped unless RUN_LIVE_TESTS=1. Run: npm run test:live
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExecutionEventSchema, PreflightResultSchema, StartRunResponseSchema, type ExecutionEvent } from '@mlp/contracts';
import { createApp, type ApiApp } from './app.js';
import { parseConfig, secretValues } from './config.js';
import { createLogger } from './logger.js';

const LIVE = process.env.RUN_LIVE_TESTS === '1';
const envFile = resolve(import.meta.dirname, '../../../.env');
if (LIVE && existsSync(envFile)) process.loadEnvFile(envFile);

let api: ApiApp;
let server: Server;
let base = '';
let secrets: string[] = [];

async function readSse(url: string): Promise<ExecutionEvent[]> {
  const res = await fetch(url, { headers: { accept: 'text/event-stream' } });
  const text = await res.text(); // the server closes the stream after `complete`
  return text
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => ExecutionEventSchema.parse(JSON.parse(l.slice(6))));
}

describe.skipIf(!LIVE)('live runs through the API', () => {
  beforeAll(async () => {
    const config = parseConfig({ ...process.env, NODE_ENV: 'test', MASTRA_MODE: 'live', LOG_LEVEL: 'silent' });
    secrets = secretValues(config);
    api = createApp({ config, logger: createLogger('silent') });
    server = api.app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await api?.runner.dispose();
    server?.closeAllConnections();
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  });

  it('preflight reports live mode ready without exposing keys', async () => {
    const res = await fetch(`${base}/api/labs/lab-03/preflight`);
    const text = await res.text();
    const body = PreflightResultSchema.parse(JSON.parse(text));
    expect(body.checks.find((c) => c.id === 'live-ready')?.passed).toBe(true);
    for (const s of secrets) expect(text).not.toContain(s);
  });

  it.each([
    ['openai/gpt-5-mini', 'OPENAI_API_KEY'],
    ['anthropic/claude-haiku-4-5', 'ANTHROPIC_API_KEY'],
  ])(
    'lab-03 runs live on %s and streams a real answer',
    async (modelId, keyVar) => {
      if (!process.env[keyVar]) return;
      const def = (await (await fetch(`${base}/api/labs/lab-03`)).json()) as { exampleInput: Record<string, unknown> };
      const start = await fetch(`${base}/api/labs/lab-03/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: { ...def.exampleInput, modelId }, mode: 'live' }),
      });
      expect(start.status).toBe(202);
      const { runId } = StartRunResponseSchema.parse(await start.json());
      const events = await readSse(`${base}/api/runs/${runId}/events`);
      const result = events.find((e) => e.type === 'result');
      expect(events.at(-1), JSON.stringify(events.find((e) => e.type === 'error'))).toMatchObject({
        type: 'complete',
        status: 'succeeded',
      });
      expect(result).toMatchObject({ validation: { passed: true }, output: { model: { id: modelId, simulated: false } } });
      const text = (result as { output: { text: string } }).output.text;
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain('[simulated');
      for (const s of secrets) expect(JSON.stringify(events)).not.toContain(s);
    },
    90_000,
  );
});
