import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { devApiTarget, waitForDevApi, webDevEnvironment } from '../../../scripts/dev-web.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'mlp-dev-startup-'));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

describe('combined development startup', () => {
  it('removes server credentials and secret-file paths from the web child environment', () => {
    const env = {
      PATH: 'keep-tool-path',
      OPENAI_API_KEY: 'private-fixture',
      ANTHROPIC_API_KEY_FILE: '/private/key',
      AUTH_SESSION_SECRET: 'private-fixture',
      AUTH_USERS: 'private-fixture',
      AUDIT_HMAC_KEY: 'private-fixture',
      RUN_STORE_SECRET_FILE: '/private/journal',
      VITE_PUBLIC_LABEL: 'course',
    };
    expect(webDevEnvironment(env, 'http://127.0.0.1:8787')).toEqual({
      PATH: 'keep-tool-path',
      VITE_PUBLIC_LABEL: 'course',
      API_PROXY_TARGET: 'http://127.0.0.1:8787',
    });
    expect(env.OPENAI_API_KEY).toBe('private-fixture');
  });
  it('uses the API dotenv precedence and only selects connection settings', () => {
    const root = tempRoot();
    expect(devApiTarget(root, {})).toBe('http://127.0.0.1:8787');
    writeFileSync(join(root, '.env'), 'HOST=0.0.0.0\nPORT=9123\nOPENAI_API_KEY=private-fixture\n');
    expect(devApiTarget(root, {})).toBe('http://127.0.0.1:9123');
    expect(devApiTarget(root, { PORT: '9124' })).toBe('http://127.0.0.1:9124');
    mkdirSync(join(root, 'apps/api'), { recursive: true });
    writeFileSync(join(root, 'apps/api/.env'), 'HOST=::\nPORT=9125\n');
    expect(devApiTarget(root, {})).toBe('http://[::1]:9125');
    expect(devApiTarget(root, { API_PROXY_TARGET: 'http://localhost:9191/' })).toBe('http://localhost:9191');
    writeFileSync(join(root, 'apps/api/.env'), 'API_PROXY_TARGET="http://localhost:9192"\n');
    expect(devApiTarget(root, {})).toBe('http://localhost:9192');
  });

  it('rejects invalid connection configuration without disclosing supplied values', () => {
    const root = tempRoot();
    for (const env of [
      { PORT: 'bad-secret' },
      { PORT: '0' },
      { PORT: '65536' },
      { API_PROXY_TARGET: 'http://user:private-fixture@localhost:8787' },
      { API_PROXY_TARGET: 'http://localhost:8787/private-fixture' },
      { API_PROXY_TARGET: 'file:///private-fixture' },
    ]) {
      expect(() => devApiTarget(root, env)).toThrow('Invalid API connection settings');
      try {
        devApiTarget(root, env);
      } catch (error) {
        expect(String(error)).not.toMatch(/private-fixture|bad-secret/);
      }
    }
  });

  it('keeps waiting through refused connections, malformed JSON and non-ready responses', async () => {
    const server = createServer();
    const target = await listen(server);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    let calls = 0;
    server.on('request', (req, res) => {
      expect(req.url).toBe('/api/ready');
      calls++;
      if (calls === 1) res.end('not json');
      else if (calls === 2) {
        res.statusCode = 503;
        res.end('{"status":"not-ready"}');
      } else res.end('{"status":"ready"}');
    });
    const restart = setTimeout(() => server.listen(Number(new URL(target).port), '127.0.0.1'), 60);
    cleanup.push(() => clearTimeout(restart));
    await waitForDevApi(target, { timeoutMs: 3_000, requestTimeoutMs: 300, intervalMs: 20 });
    expect(calls).toBe(3);
  });

  it('bounds hanging requests and never treats a live but unready API as ready', async () => {
    for (const hang of [true, false]) {
      const server = createServer((_req, res) => {
        if (!hang) res.end('{"status":"not-ready"}');
      });
      const target = await listen(server);
      const started = performance.now();
      await expect(waitForDevApi(target, { timeoutMs: 150, requestTimeoutMs: 40, intervalMs: 10 })).rejects.toThrow(
        'Check the [api] logs',
      );
      expect(performance.now() - started).toBeLessThan(2_000);
    }
  });

  it('cancels a pending request promptly instead of launching the web server', async () => {
    const target = await listen(createServer(() => {}));
    const stop = new AbortController();
    const pending = waitForDevApi(target, { signal: stop.signal });
    stop.abort(new Error('cancelled by learner'));
    await expect(pending).rejects.toThrow('cancelled by learner');
  });
});
