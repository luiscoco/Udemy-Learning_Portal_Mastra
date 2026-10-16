import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ApiErrorSchema, HealthResponseSchema } from '@mlp/contracts';
import { createApp } from './app.js';
import { parseConfig } from './config.js';
import { createLogger } from './logger.js';

const SECRET = 'sk-test-DO-NOT-LEAK-0123456789';
const { app } = createApp({
  config: parseConfig({ OPENAI_API_KEY: SECRET, NODE_ENV: 'test' }),
  logger: createLogger('silent'),
});

describe('GET /api/health', () => {
  it('returns a schema-valid ok body', async () => {
    const res = await request(app).get('/api/health').expect(200);
    const body = HealthResponseSchema.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.mode).toBe('offline');
    expect(body.mastraVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('does not leak configured secrets', async () => {
    const res = await request(app).get('/api/health');
    expect(res.text).not.toContain(SECRET);
  });
});

describe('unknown routes and bad input', () => {
  it('returns JSON 404 for unknown /api routes', async () => {
    const res = await request(app).get('/api/does-not-exist').expect(404);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/anything')
      .set('content-type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});

describe('GET /api/catalog', () => {
  it('lists Dummy Lab 00', async () => {
    const res = await request(app).get('/api/catalog').expect(200);
    expect(res.body.labs.map((l: { id: string }) => l.id)).toContain('lab-00');
  });
});

describe('catalog ⇔ registry consistency', () => {
  it('marks exactly the registered labs as available', async () => {
    const { registry } = createApp({ config: parseConfig({ NODE_ENV: 'test' }), logger: createLogger('silent') });
    const res = await request(app).get('/api/catalog').expect(200);
    const available = (res.body.labs as { id: string; status: string }[]).filter((l) => l.status === 'available').map((l) => l.id);
    expect(available.sort()).toEqual(registry.ids().sort());
  });
});
