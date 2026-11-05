import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { testMemoryDir } from '@mlp/labs/test-memory';

const root = testMemoryDir('durable-auth-process');
const children: ChildProcess[] = [];
const SECRET = 'test-process-session-secret-with-at-least-32-characters';
async function start(dir: string) {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', fileURLToPath(new URL('./session-process.fixture.ts', import.meta.url))],
    {
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        SESSION_TEST_ROOT: dir,
        SESSION_TEST_SECRET: SECRET,
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      windowsHide: true,
    },
  );
  children.push(child);
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Test API did not start within 40 seconds'));
    }, 40000);
    const failed = () => {
      clearTimeout(timer);
      reject(new Error('Test API exited before becoming ready'));
    };
    child.once('error', failed);
    child.once('exit', failed);
    child.once('message', (message: { url: string }) => {
      clearTimeout(timer);
      child.off('exit', failed);
      child.off('error', failed);
      resolve(message.url);
    });
  });
  return { child, url };
}
async function stop(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => child.kill(), 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    if (child.connected) child.send('stop');
    else child.kill();
  });
}
afterEach(async () => {
  await Promise.all(children.splice(0).map(stop));
});
const session = async (url: string, cookie: string) => {
  const response = await fetch(`${url}/api/auth/session`, { headers: { Cookie: cookie } });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ authenticated: boolean; principal: { sub: string } | null }>;
};

it('restores cookies across distinct HTTP auth processes and shares durable logout', async () => {
  const dir = join(root, 'restart');
  const a = await start(dir);
  const login = await fetch(`${a.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice' }),
  });
  expect(login.status).toBe(200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  await login.arrayBuffer();
  await stop(a.child);
  const b = await start(dir);
  expect((await session(b.url, cookie)).principal?.sub).toBe('dev:alice');
  const c = await start(dir);
  expect((await session(c.url, cookie)).authenticated).toBe(true);
  const concurrent = await Promise.all(
    [b, c].map((api, index) =>
      fetch(`${api.url}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: index ? 'bob' : 'alice' }),
      }),
    ),
  );
  for (const response of concurrent) {
    expect(response.status).toBe(200);
    await response.arrayBuffer();
  }
  const logout = await fetch(`${b.url}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
  expect(logout.status).toBe(200);
  await logout.arrayBuffer();
  expect((await session(c.url, cookie)).authenticated).toBe(false);
  await stop(b.child);
  await stop(c.child);
  const d = await start(dir);
  expect((await session(d.url, cookie)).authenticated).toBe(false);
}, 120000);
