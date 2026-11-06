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

test('local entry enables offline and configured live Tutor in every lesson without signing in', async ({ page }) => {
  test.setTimeout(420000);
  const root = resolve('.data', `local-entry-browser-${process.pid}-${randomUUID()}`);
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
        AUTH_LOCAL_AUTO_LOGIN: 'true',
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
    // Cold course-runtime imports can take longer while the full suite is compiling.
    const deadline = Date.now() + 120000;
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
    await page.route('**/api/tutor/settings', (route) =>
      route.fulfill({
        json: {
          liveEnabled: true,
          models: [{ id: 'openai/gpt-4o-mini', provider: 'openai', configured: true }],
          questionLimit: 2000,
          answerLimit: 16000,
          timeoutMs: 60000,
        },
      }),
    );
    for (let index = 0; index <= 75; index++) {
      const labId = `lab-${String(index).padStart(2, '0')}`;
      await page.goto(`${base}/labs/${labId}?tab=run`);
      await expect(page.getByText('Local learner: persistent-learner', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'AI Tutor', exact: true }).click();
      const panel = page.getByRole('dialog', { name: 'AI Tutor', exact: true });
      const ask = panel.getByRole('button', { name: 'Ask tutor', exact: true });
      await expect(ask).toBeEnabled();
      if (index === 0 || index === 75) {
        await panel.getByRole('button', { name: 'Give me a hint', exact: true }).click();
        await ask.click();
        await expect(page.getByTestId('tutor-status')).toContainText('Complete');
      }
      await panel.getByLabel('Tutor mode').selectOption('live');
      await expect(panel.getByRole('button', { name: 'Ask live tutor', exact: true })).toBeEnabled();
      await panel.getByRole('button', { name: 'Close AI Tutor' }).click();
    }
    const session = await (await page.request.get(`${base}/api/auth/session`)).json();
    expect(session.principal.sub).toBe('dev:persistent-learner');
    expect(session.login.autoLocal).toBe(true);
    await page.reload();
    await expect(page.getByText('Local learner: persistent-learner', { exact: true })).toBeVisible();
  } finally {
    await stop();
  }
});
