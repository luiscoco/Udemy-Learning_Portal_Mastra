import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { ConfigError } from './index.js';
import { deploymentProblems, loadDeployConfig, parseConfig, ReadinessProbe, resolveSecretFiles } from './index.js';

const tmp = mkdtempSync(join(tmpdir(), 'mlp-deploy-'));
afterAll(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    // Windows: the probe's libSQL file stays locked until the process exits
  }
});

const SECRET = 'session-secret-0123456789-abcdefghijkl';
const AUDIT = 'audit-key-0123456789-abcdefghijklmnopq';
const USERS = 'ana:scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const prod = (over: Record<string, string | undefined> = {}) => ({
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  AUTH_PROVIDER: 'password',
  AUTH_USERS: USERS,
  AUTH_SESSION_SECRET: SECRET,
  AUDIT_HMAC_KEY: AUDIT,
  MLP_DATA_DIR: '/data',
  TRUST_PROXY: '1',
  ...over,
});
const thrown = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e as ConfigError;
  }
  throw new Error('expected a ConfigError');
};

describe('secrets from files', () => {
  const file = (content: string) => {
    const p = join(tmp, `s${Math.random().toString(36).slice(2)}`);
    writeFileSync(p, content);
    return p;
  };

  it('reads <KEY>_FILE, trims it, and reports the source', () => {
    const r = resolveSecretFiles({ AUTH_SESSION_SECRET_FILE: file(`${SECRET}\n`), OPENAI_API_KEY: 'x' });
    expect(r.env.AUTH_SESSION_SECRET).toBe(SECRET);
    expect(r.env.AUTH_SESSION_SECRET_FILE).toBeUndefined();
    expect(r.sources).toMatchObject({ AUTH_SESSION_SECRET: 'file', OPENAI_API_KEY: 'env', AUDIT_HMAC_KEY: 'unset' });
  });

  it('refuses both forms, unreadable and empty files, naming keys only', () => {
    expect(thrown(() => resolveSecretFiles({ AUDIT_HMAC_KEY: AUDIT, AUDIT_HMAC_KEY_FILE: file(AUDIT) })).message).toContain(
      'set either AUDIT_HMAC_KEY or AUDIT_HMAC_KEY_FILE, not both',
    );
    const missing = thrown(() => resolveSecretFiles({ AUTH_USERS_FILE: join(tmp, 'nope') }));
    expect(missing.keys).toEqual(['AUTH_USERS_FILE']);
    expect(thrown(() => resolveSecretFiles({ AUTH_USERS_FILE: file('  \n') })).message).toContain('empty file');
    const leaked = thrown(() => resolveSecretFiles({ AUDIT_HMAC_KEY: AUDIT, AUDIT_HMAC_KEY_FILE: file(AUDIT) }));
    expect(leaked.message).not.toContain(AUDIT);
  });
});

describe('deployment profile', () => {
  it('accepts a complete production configuration', () => {
    const r = loadDeployConfig(prod());
    expect(r.config).toMatchObject({ NODE_ENV: 'production', TRUST_PROXY: 1, LOG_REQUESTS: true, AUTH_PROVIDER: 'password' });
    expect(r.warnings).toEqual([]);
  });

  it('a missing secret refuses start-up with a clear, value-free message', () => {
    const e = thrown(() => loadDeployConfig(prod({ AUTH_SESSION_SECRET: undefined })));
    expect(e.keys).toEqual(['AUTH_SESSION_SECRET']);
    expect(e.message).toBe(
      'Refusing to start (NODE_ENV=production): AUTH_SESSION_SECRET is required in production (set AUTH_SESSION_SECRET or AUTH_SESSION_SECRET_FILE)',
    );
    expect(e.message).not.toContain(AUDIT);
  });

  it('lists every production problem at once', () => {
    const e = thrown(() => loadDeployConfig({ NODE_ENV: 'production', MASTRA_MODE: 'live', MLP_DATA_DIR: 'relative/dir' }));
    expect(e.keys.sort()).toEqual(['AUDIT_HMAC_KEY', 'AUTH_PROVIDER', 'AUTH_SESSION_SECRET', 'MASTRA_MODE', 'MLP_DATA_DIR']);
  });

  it('development accepts shortcuts but warns', () => {
    const { problems, warnings } = deploymentProblems(parseConfig({}));
    expect(problems).toEqual([]);
    expect(warnings.map((w) => w.key)).toEqual(['AUTH_SESSION_SECRET', 'AUDIT_HMAC_KEY']);
    expect(deploymentProblems(parseConfig({ AUTH_PROVIDER: 'password' })).problems.map((p) => p.key)).toEqual(['AUTH_USERS']);
  });

  it('parses TRUST_PROXY and LOG_REQUESTS', () => {
    expect(parseConfig({ TRUST_PROXY: 'loopback', LOG_REQUESTS: 'false' })).toMatchObject({
      TRUST_PROXY: 'loopback',
      LOG_REQUESTS: false,
    });
    expect(() => parseConfig({ TRUST_PROXY: 'everyone' })).toThrow(/TRUST_PROXY/);
  });
});

describe('readiness probe', () => {
  it('is ready when the data directory and storage work, and closes cleanly', async () => {
    const probe = new ReadinessProbe({ config: parseConfig({}), dataDir: join(tmp, 'data'), cacheMs: 0 });
    const r = await probe.check();
    expect(r.status).toBe('ready');
    expect(Object.fromEntries(r.checks.map((c) => [c.name, c.status]))).toEqual({
      config: 'ok',
      'data-dir': 'ok',
      storage: 'ok',
      'web-bundle': 'skip',
      providers: 'skip',
      runner: 'ok',
    });
    await probe.close();
    expect((await probe.check()).checks.find((c) => c.name === 'storage')?.status).toBe('fail');
  });

  it('reports each failing dependency', async () => {
    const notADir = join(tmp, 'a-file');
    writeFileSync(notADir, 'x');
    let accepting = true;
    const probe = new ReadinessProbe({
      config: parseConfig({ MASTRA_MODE: 'live', WEB_DIST_DIR: join(tmp, 'no-dist') }),
      dataDir: notADir,
      acceptingRuns: () => accepting,
      cacheMs: 0,
    });
    accepting = false;
    const r = await probe.check();
    expect(r.status).toBe('not-ready');
    const by = Object.fromEntries(r.checks.map((c) => [c.name, c]));
    expect(by['data-dir']?.status).toBe('fail');
    expect(by['data-dir']?.message).not.toContain(tmp); // no paths in public answers
    expect(by['web-bundle']?.status).toBe('fail');
    expect(by.providers?.message).toBe('live mode without any provider key');
    expect(by.runner?.status).toBe('fail');
    await probe.close();
  });

  it('caches a result for a short time', async () => {
    const probe = new ReadinessProbe({ config: parseConfig({}), dataDir: join(tmp, 'data2'), cacheMs: 60_000 });
    const a = await probe.check();
    expect(await probe.check()).toBe(a);
    await probe.close();
  });
});
