import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { ALLOWED_HOSTS, forecastUrl, RateLimiter } from './http.js';
import { mockClient } from './mock.js';
import { lab14 } from './run.js';
import { createWeatherTool, type CallRecord } from './tool.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab14]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

describe('weather tool pieces', () => {
  it('builds only allowlisted URLs', () => {
    expect(ALLOWED_HOSTS.has(forecastUrl('Lisbon').host)).toBe(true);
  });

  it('rate limiter allows max N per window', () => {
    let t = 0;
    const l = new RateLimiter(2, 1000, () => t);
    expect([l.tryAcquire().ok, l.tryAcquire().ok, l.tryAcquire().ok]).toEqual([true, true, false]);
    t = 1001;
    expect(l.tryAcquire().ok).toBe(true);
  });

  it('mock mode succeeds without network and validates the response', async () => {
    const calls: CallRecord[] = [];
    const tool = createWeatherTool({
      client: mockClient('none'),
      timeoutMs: 1000,
      limiter: new RateLimiter(5, 60_000),
      calls,
      signal: new AbortController().signal,
    });
    const out = await tool.execute!({ city: 'London' }, {} as never);
    expect(out).toMatchObject({ ok: true, city: 'London', temperatureC: 12.7, source: 'Open-Meteo (local mock)' });
    expect(calls).toHaveLength(1);
  });
});

describe('lab-14 end to end', () => {
  it('example answers from mock data with two allowlisted requests', async () => {
    const r = runner.start('lab-14', { input: lab14.definition.exampleInput });
    await runner.waitFor(r.runId);
    const result = runner.events(r.runId).find((e) => e.type === 'result') as {
      output: { httpCalls: CallRecord[] };
      validation: { passed: boolean };
    };
    expect(result.validation.passed).toBe(true);
    expect(result.output.httpCalls.map((c) => [c.host, c.status, c.outcome])).toEqual([
      ['api.open-meteo.com', 200, 'ok'],
      ['api.open-meteo.com', 200, 'ok'],
    ]);
  });
});
