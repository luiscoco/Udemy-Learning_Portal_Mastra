import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { emptyProgress } from '@mlp/contracts';
import { testMemoryDir } from '@mlp/labs/test-memory';
import { ProgressRepository } from './progress-store.js';

const directory = testMemoryDir('progress-store');
let sequence = 0;
const fresh = () => {
  const dir = join(directory, String(++sequence));
  return { file: join(dir, 'alice.db'), repository: new ProgressRepository((subject) => join(dir, `${subject}.db`)) };
};
describe('durable progress repository', () => {
  it('retains the full record across reopen and isolates subjects', async () => {
    const { repository, file } = fresh();
    const record = {
      ...emptyProgress('lab-00'),
      notes: 'Private notes',
      prediction: 'My prediction',
      selfCheck: { one: true },
      quiz: { score: 3, total: 4, passed: true, attempts: 2, answers: { q1: 1 } },
    };
    await repository.write('alice', 'lab-00', 0, record);
    const { status: _status, updatedAt: _updatedAt, ...content } = record;
    expect((await new ProgressRepository(() => file).get('alice')).entries[0]?.record).toMatchObject({
      ...content,
      status: 'in-progress',
    });
    expect((await repository.get('bob')).entries).toEqual([]);
  });
  it('rejects competing edits and stale resets without losing the winner', async () => {
    const { repository } = fresh();
    const writes = await Promise.allSettled(
      ['first', 'second'].map((notes) => repository.write('alice', 'lab-00', 0, { ...emptyProgress('lab-00'), notes })),
    );
    expect(writes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(writes.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'CONFLICT' } });
    await expect(repository.write('alice', 'lab-00', 0, null)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await repository.get('alice')).entries[0]?.record?.notes).toBe('first');
  });
  it('imports idempotently and preserves account records and reset tombstones', async () => {
    const { repository } = fresh();
    await repository.import('alice', [{ ...emptyProgress('lab-00'), notes: 'Original' }]);
    await repository.import('alice', [{ ...emptyProgress('lab-00'), notes: 'Older browser' }]);
    expect((await repository.get('alice')).entries[0]?.record?.notes).toBe('Original');
    await repository.write('alice', 'lab-00', 1, null);
    await repository.import('alice', [emptyProgress('lab-00')]);
    expect((await repository.get('alice')).entries[0]).toMatchObject({ record: null, revision: 2 });
    await expect(repository.write('alice', 'lab-00', 1, emptyProgress('lab-00'))).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('refuses schema drift and a database newer than the app', async () => {
    const { repository, file } = fresh();
    await repository.get('alice');
    const client = createClient({ url: pathToFileURL(file).href });
    try {
      await client.execute("UPDATE app_progress_migrations SET checksum = 'edited'");
      await expect(repository.get('alice')).rejects.toMatchObject({ code: 'CONFLICT' });
      await client.execute('PRAGMA user_version = 2');
      await expect(repository.get('alice')).rejects.toMatchObject({ code: 'CONFLICT' });
    } finally {
      client.close();
    }
  });
  it('recovers committed progress in a distinct Node process', async () => {
    const { file } = fresh();
    const child = fileURLToPath(new URL('./progress-process.fixture.ts', import.meta.url));
    await promisify(execFile)(process.execPath, ['--import', 'tsx', child, file, 'write'], { timeout: 20000 });
    const { stdout } = await promisify(execFile)(process.execPath, ['--import', 'tsx', child, file, 'read'], { timeout: 20000 });
    expect(JSON.parse(stdout).entries[0].record).toMatchObject({ notes: 'Saved in a different process', lessonRead: true });
  });
});
