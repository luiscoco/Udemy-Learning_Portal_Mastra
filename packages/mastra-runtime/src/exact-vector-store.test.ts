import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { fileUrl } from './memory-store.js';
import { openExactVectorStore } from './vector-tools.js';

// Files stay in the OS temp dir: on Windows libSQL keeps them locked until GC (see test-memory notes).
const file = join(mkdtempSync(join(tmpdir(), 'mlp-exact-')), 'v.db');
const annIndexes = async () => {
  const c = createClient({ url: fileUrl(file) });
  try {
    return (await c.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE '%_vector_idx'")).rows.length;
  } finally {
    c.close();
  }
};

describe('openExactVectorStore', () => {
  it('creates the index tables without libSQL’s approximate index', async () => {
    const store = await openExactVectorStore(file, [{ indexName: 'docs', dimension: 3 }]);
    try {
      expect(await store.listIndexes()).toEqual(['docs']);
      expect(await annIndexes()).toBe(0);
    } finally {
      await store.close();
    }
  });

  it('searches exactly: filters apply before ranking, and upserts by id still replace', async () => {
    const store = await openExactVectorStore(file, [{ indexName: 'docs', dimension: 3 }]);
    try {
      await store.upsert({
        indexName: 'docs',
        vectors: [[1, 0, 0], [0.9, 0.1, 0], [0, 1, 0]],
        ids: ['a1', 'a2', 'g1'],
        metadata: [{ tenantId: 'acme' }, { tenantId: 'acme' }, { tenantId: 'globex' }],
      });
      await store.upsert({ indexName: 'docs', vectors: [[1, 0, 0]], ids: ['a1'], metadata: [{ tenantId: 'acme', v: 2 }] });
      expect((await store.describeIndex({ indexName: 'docs' })).count).toBe(3);
      // The only globex record is the least similar one; an exact pre-filtered search still returns it.
      const hits = await store.query({ indexName: 'docs', queryVector: [1, 0, 0], topK: 1, filter: { tenantId: 'globex' } });
      expect(hits.map((h) => h.id)).toEqual(['g1']);
      expect((await store.query({ indexName: 'docs', queryVector: [1, 0, 0], topK: 1 }))[0]).toMatchObject({ id: 'a1', metadata: { v: 2 } });
    } finally {
      await store.close();
    }
  });
});
