import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { SECRET_KEYS } from '../packages/deploy/src/schema';

test.use({ storageState: { cookies: [], origins: [] } });

async function freePort(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>((ready, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', ready);
  });
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('Cannot reserve a test port');
  await new Promise<void>((done) => reservation.close(() => done()));
  return address.port;
}

test('durable cookie and account notes survive bundled API restarts; logout stays revoked', async ({ page }) => {
  test.setTimeout(150000);
  const root = resolve('.data', `session-browser-${process.pid}-${randomUUID()}`);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child: ChildProcess | null = null;
  const stop = async () => {
    const current = child;
    child = null;
    if (!current?.pid || current.exitCode !== null || current.signalCode !== null) return;
    await new Promise<void>((done) => {
      const timer = setTimeout(() => current.kill('SIGKILL'), 10000);
      current.once('exit', () => {
        clearTimeout(timer);
        done();
      });
      current.kill();
    });
  };
  const start = async () => {
    child = spawn(process.execPath, [resolve('apps/api/dist/server.js')], {
      env: {
        // Prevent the root .env loader from importing a developer's provider or mounted-file secrets.
        ...Object.fromEntries(
          SECRET_KEYS.flatMap((key) => [
            [key, ''],
            [`${key}_FILE`, ''],
          ]),
        ),
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(port),
        MASTRA_MODE: 'offline',
        LOG_LEVEL: 'silent',
        LOG_REQUESTS: 'false',
        AUTH_PROVIDER: 'dev',
        AUTH_DEV_USERS: 'persistent-learner',
        AUTH_DEV_PASSWORD: '',
        AUTH_SESSION_STORE: 'sqlite',
        AUTH_SESSION_SECRET: 'test-browser-session-secret-with-at-least-32-characters',
        AUTH_SESSION_TTL_MS: '28800000',
        TRUST_PROXY: 'false',
        MLP_DATA_DIR: root,
        WEB_DIST_DIR: resolve('apps/web/dist'),
      },
      stdio: 'ignore',
      windowsHide: true,
    });
    let spawnError = false;
    child.once('error', () => {
      spawnError = true;
    });
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null) throw new Error('Bundled test API failed to start');
      try {
        const ready = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
        if (ready.ok) {
          await ready.arrayBuffer();
          return;
        }
        await ready.arrayBuffer();
      } catch {
        /* wait for startup */
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error('Bundled test API did not become ready');
  };
  try {
    await start();
    await page.goto(`${base}/labs/lab-00?tab=run`);
    await page.getByRole('link', { name: 'Sign in to continue' }).click();
    await page.getByLabel('User name').fill('persistent-learner');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await page.getByLabel('Notes for lab-00', { exact: true }).fill('Account note survives an actual API restart.');
    await expect(page.getByTestId('progress-sync')).toContainText('Progress saved to your account.');
    const cookie = (await page.context().cookies(`${base}/api/auth/session`)).find((c) => c.name === 'mlp_session')!;
    expect(cookie.httpOnly).toBe(true);
    const deviceStorage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(deviceStorage).not.toContain(cookie.value);
    expect(await page.evaluate(() => document.cookie)).not.toContain('mlp_session=');
    await stop();
    await start();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await expect(page.getByTestId('progress-sync')).toContainText('Progress saved to your account.');
    await expect(page.getByLabel('Notes for lab-00', { exact: true })).toHaveValue(
      'Account note survives an actual API restart.',
    );
    const restored = await page.request.get(`${base}/api/auth/session`);
    expect((await restored.json()).principal.sub).toBe('dev:persistent-learner');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to run labs' })).toBeVisible();
    await stop();
    await start();
    const replay = await page.request.get(`${base}/api/auth/session`, { headers: { Cookie: `mlp_session=${cookie.value}` } });
    expect((await replay.json()).authenticated).toBe(false);
    await page.reload();
    await expect(page.getByLabel('Notes for lab-00', { exact: true })).toHaveValue('');
  } finally {
    await stop();
  }
});
