import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { courseLibrary } from './lab-36/library.js';
import { labsPackageDir } from './paths.js';
import { createLabServices, partitionOf, TENANTS_DIR } from './services.js';
import { testMemoryDir } from './test-memory.js';

const root = testMemoryDir('tenancy');
const base = createLabServices({ serverMode: 'offline', env: {}, memoryDir: root });

describe('storage partitions (L62)', () => {
  it('derives a fixed-length hash per owner; no raw id reaches a path', () => {
    const a = partitionOf('dev:alice');
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(partitionOf('dev:alice')).toBe(a);
    expect(partitionOf('dev:bob')).not.toBe(a);
    expect(partitionOf(null)).toBe('local');
    const hostile = base.forTenant('../../etc/passwd');
    const file = hostile.memory.file('lab-21');
    expect(relative(join(root, TENANTS_DIR), file).split(sep)).toEqual([hostile.tenant.partition, 'lab-21.db']);
    expect(file).not.toContain('etc');
  });

  it('puts every store of a learner in their own partition: memory, library and files', () => {
    const alice = base.forTenant('dev:alice');
    const bob = base.forTenant('dev:bob');
    for (const s of [alice, bob]) {
      const p = join(root, TENANTS_DIR, s.tenant.partition);
      expect(s.memory.file('lab-58-datasets').startsWith(p)).toBe(true);
      expect(s.files('comparisons').startsWith(p)).toBe(true);
      expect(courseLibrary(s).dir.startsWith(p)).toBe(true);
    }
    expect(alice.memory.file('lab-21')).not.toBe(bob.memory.file('lab-21'));
    expect(base.tenant.partition).toBe('local');
    expect(alice.forTenant('dev:bob').tenant.partition).toBe(bob.tenant.partition);
    expect(() => alice.files('../x')).toThrow('Invalid file store name');
  });

  it('labs reach durable data only through ctx.services (no direct dataDir() calls)', () => {
    const src = join(labsPackageDir(), 'src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name) && /dataDir\(/.test(readFileSync(path, 'utf8')))
          offenders.push(relative(src, path));
      }
    };
    walk(src);
    expect(offenders.sort()).toEqual(['paths.ts', 'services.ts', 'test-memory.ts']);
  });
});

describe('audit key (L64)', () => {
  it('uses AUDIT_HMAC_KEY, otherwise generates one server-side key once and reuses it for every tenant', () => {
    const secretsDir = join(testMemoryDir('audit-key'), 'secrets');
    const a = createLabServices({ serverMode: 'offline', env: {}, memoryDir: root, secretsDir });
    const key = a.auditKey();
    expect(key.length).toBe(32);
    expect(a.forTenant('dev:bob').auditKey().equals(key)).toBe(true);
    expect(createLabServices({ serverMode: 'offline', env: {}, memoryDir: root, secretsDir }).auditKey().equals(key)).toBe(true);
    const configured = createLabServices({
      serverMode: 'offline',
      env: { AUDIT_HMAC_KEY: 'c'.repeat(40) },
      memoryDir: root,
      secretsDir,
    });
    expect(configured.auditKey().toString()).toBe('c'.repeat(40));
    const short = createLabServices({ serverMode: 'offline', env: { AUDIT_HMAC_KEY: 'short' }, memoryDir: root, secretsDir });
    expect(() => short.auditKey()).toThrow(/at least 32/);
  });
});
