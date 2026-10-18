import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DEFAULT_REQUEST_BYTES, maxRequestBytes } from '@mlp/contracts';
import { createLabRegistry } from '@mlp/labs';
import { createApp } from './app.js';
import { parseConfig } from './config.js';
import { createLogger } from './logger.js';

const { app } = createApp({ config: parseConfig({ NODE_ENV: 'test' }), logger: createLogger('silent') });
const lab36Limit = maxRequestBytes(createLabRegistry().require('lab-36').definition);
const textFile = (bytes: number) => ({ name: 'notes.txt', type: 'text/plain', size: bytes, dataBase64: Buffer.alloc(bytes, 'a').toString('base64') });

describe('request body limits for file uploads', () => {
  it('labs without file fields keep the 64 KB limit', async () => {
    const big = { mode: 'offline', input: { padding: 'x'.repeat(DEFAULT_REQUEST_BYTES + 1) } };
    const res = await request(app).post('/api/labs/lab-29/runs').send(big).expect(413);
    expect(res.body.error.message).toBe('Request body too large (max 64 KB)');
  });

  it('a lab with a file field accepts a request carrying a file of about 1 MB', async () => {
    const body = { mode: 'offline', input: { samples: 'none', store: false, files: [textFile(1_000_000)] } };
    expect(JSON.stringify(body).length).toBeGreaterThan(DEFAULT_REQUEST_BYTES);
    await request(app).post('/api/labs/lab-36/runs').send(body).expect(202);
  });

  it('beyond the lab’s computed limit the API answers 413 and states the limit', async () => {
    const body = { mode: 'offline', input: { samples: 'none', store: false, padding: 'x'.repeat(lab36Limit + 1) } };
    const res = await request(app).post('/api/labs/lab-36/runs').send(body).expect(413);
    expect(res.body.error.message).toBe(`Request body too large (max ${Math.round(lab36Limit / 1024)} KB)`);
  });

  it('a file slightly over the per-file limit still reaches the lab, which rejects it by itself', async () => {
    const body = { mode: 'offline', input: { samples: 'none', store: false, files: [textFile(1_100_000)] } };
    await request(app).post('/api/labs/lab-36/runs').send(body).expect(202);
  });
});
