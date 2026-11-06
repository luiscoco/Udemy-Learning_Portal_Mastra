import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

it('creates separate private stable session/journal keys without overwriting existing secrets', () => {
  const root = mkdtempSync(join(tmpdir(), 'mlp-secrets-'));
  if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error('Unexpected secret-test cleanup root');
  const repository = resolve(import.meta.dirname, '../../..');
  const script = join(repository, 'scripts/make-secrets.ts');
  const tsx = join(repository, 'node_modules/tsx/dist/loader.mjs');
  try {
    const run = () =>
      execFileSync(process.execPath, ['--import', pathToFileURL(tsx).href, script, 'learner'], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 20000,
      });
    const first = run();
    const names = ['auth_session_secret', 'audit_hmac_key', 'run_store_secret', 'auth_users'];
    const contents = names.map((name) => readFileSync(join(root, 'secrets', name), 'utf8'));
    expect(contents[0]).not.toBe(contents[2]);
    for (const value of contents) expect(first).not.toContain(value.trim());
    expect(first).toContain('shown once');
    const second = run();
    expect(second).not.toContain('password:');
    expect(names.map((name) => readFileSync(join(root, 'secrets', name), 'utf8'))).toEqual(contents);
    if (process.platform !== 'win32')
      for (const name of names) expect(statSync(join(root, 'secrets', name)).mode & 0o777).toBe(0o600);
    const compose = readFileSync(join(repository, 'compose.yaml'), 'utf8');
    expect(compose).toContain('AUTH_SESSION_STORE: sqlite');
    expect(compose).toContain('RUN_STORE: sqlite');
    expect(compose).toContain('RUN_STORE_SECRET_FILE: /run/secrets/run_store_secret');
    const staging = readFileSync(join(repository, 'scripts/deploy-azure.ts'), 'utf8');
    expect(staging).toContain('name: RUN_STORE_SECRET, secretRef: run-store-secret');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
