import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyProgress } from '@mlp/contracts';
import { testMemoryDir } from '@mlp/labs/test-memory';
import { createApp } from './app.js';
import { parseConfig } from './config.js';
import { createLogger } from './logger.js';

const api = createApp({
  config: parseConfig({ NODE_ENV: 'test', AUTH_DEV_USERS: 'alice,bob' }),
  logger: createLogger('silent'),
  memoryDir: testMemoryDir('progress-api'),
});
const alice = request.agent(api.app);
const bob = request.agent(api.app);
const subject = { 'x-progress-subject': encodeURIComponent('dev:alice') };
beforeAll(async () => {
  await alice.post('/api/auth/login').send({ username: 'alice' }).expect(200);
  await bob.post('/api/auth/login').send({ username: 'bob' }).expect(200);
});
afterAll(() => api.runner.dispose());
describe('progress API', () => {
  it('requires authentication and binds requests to the session account', async () => {
    await request(api.app).get('/api/progress').set(subject).expect(401);
    await bob.get('/api/progress').set(subject).expect(404);
    await alice.get('/api/progress').expect(404);
    await bob
      .post('/api/progress/lab-00')
      .set(subject)
      .send({ baseRevision: 0, record: emptyProgress('lab-00') })
      .expect(404);
    const own = await bob.get('/api/progress').set('x-progress-subject', encodeURIComponent('dev:bob')).expect(200);
    expect(own.body.entries).toEqual([]);
  });
  it('round trips full records, normalizes claims and protects revision/reset/import', async () => {
    const first = await alice
      .post('/api/progress/lab-00')
      .set(subject)
      .send({ baseRevision: 0, record: { ...emptyProgress('lab-00'), notes: 'Account note', status: 'completed' } })
      .expect(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body).toMatchObject({ revision: 1, record: { status: 'in-progress', notes: 'Account note' } });
    await alice
      .post('/api/progress/lab-00')
      .set(subject)
      .send({ baseRevision: 0, record: emptyProgress('lab-00') })
      .expect(409);
    await alice
      .post('/api/progress/import')
      .set(subject)
      .send({ records: [{ ...emptyProgress('lab-00'), notes: 'Old note' }] })
      .expect(200);
    expect((await alice.get('/api/progress').set(subject)).body.entries[0].record.notes).toBe('Account note');
    await alice.post('/api/progress/lab-00/reset').set(subject).send({ baseRevision: 1 }).expect(200);
    const imported = await alice
      .post('/api/progress/import')
      .set(subject)
      .send({ records: [emptyProgress('lab-00')] })
      .expect(200);
    expect(imported.body.entries[0]).toMatchObject({ revision: 2, record: null });
  });
  it('refuses malformed, mismatched, unknown and oversized requests', async () => {
    await alice
      .post('/api/progress/lab-00')
      .set(subject)
      .send({ baseRevision: 0, record: emptyProgress('lab-01') })
      .expect(422);
    await alice
      .post('/api/progress/lab-99')
      .set(subject)
      .send({ baseRevision: 0, record: emptyProgress('lab-99') })
      .expect(404);
    await alice
      .post('/api/progress/import')
      .set(subject)
      .send({ records: Array(11).fill(emptyProgress('lab-00')) })
      .expect(422);
    await alice
      .post('/api/progress/lab-01')
      .set(subject)
      .send({ baseRevision: 0, record: emptyProgress('lab-01'), owner: 'dev:bob' })
      .expect(422);
    await alice
      .post('/api/progress/lab-01')
      .set(subject)
      .send({ baseRevision: 0, record: { ...emptyProgress('lab-01'), notes: 'x'.repeat(300000) } })
      .expect(413);
  });
});
