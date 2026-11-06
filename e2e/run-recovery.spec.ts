import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { SECRET_KEYS } from '../packages/deploy/src/schema';

test.use({ storageState: { cookies: [], origins: [] } });
async function portForTest(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>((done, fail) => {
    reservation.once('error', fail);
    reservation.listen(0, '127.0.0.1', done);
  });
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  await new Promise<void>((done) => reservation.close(() => done()));
  return address.port;
}

test('reattaches live controls, preserves progress reset and safely recovers an interrupted approval after API crash', async ({
  page,
}) => {
  test.setTimeout(180000);
  const root = resolve('.data', `run-browser-${process.pid}-${randomUUID()}`),
    port = await portForTest();
  const base = `http://127.0.0.1:${port}`,
    subject = 'dev:recovery-learner';
  let child: ChildProcess | null = null;
  const stop = async (crash = false) => {
    const current = child;
    child = null;
    if (!current?.pid || current.exitCode !== null || current.signalCode !== null) return;
    await new Promise<void>((done) => {
      const timer = setTimeout(() => current.kill('SIGKILL'), 10000);
      current.once('exit', () => {
        clearTimeout(timer);
        done();
      });
      current.kill(crash ? 'SIGKILL' : 'SIGTERM');
    });
  };
  const start = async () => {
    child = spawn(process.execPath, [resolve('apps/api/dist/server.js')], {
      env: {
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
        AUTH_LOCAL_AUTO_LOGIN: 'false',
        AUTH_DEV_USERS: 'recovery-learner',
        AUTH_DEV_PASSWORD: '',
        AUTH_SESSION_STORE: 'sqlite',
        AUTH_SESSION_SECRET: 'test-run-browser-session-secret-at-least-32-characters',
        AUTH_SESSION_TTL_MS: '28800000',
        RUN_STORE: 'sqlite',
        RUN_STORE_SECRET: 'test-run-browser-journal-key-at-least-32-characters',
        TRUST_PROXY: 'false',
        MLP_DATA_DIR: root,
        WEB_DIST_DIR: resolve('apps/web/dist'),
      },
      stdio: 'ignore',
      windowsHide: true,
    });
    let failed = false;
    child.once('error', () => {
      failed = true;
    });
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline) {
      if (failed || child.exitCode !== null || child.signalCode !== null) throw new Error('Owned run API failed to start');
      try {
        const ready = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
        const ok = ready.ok;
        await ready.arrayBuffer();
        if (ok) return;
      } catch {
        /* wait for startup */
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error('Owned run API startup deadline passed');
  };
  let starts = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && /\/api\/labs\/lab-\d{2}\/runs$/.test(req.url())) starts++;
  });
  const run = async (labId: string) => {
    const response = page.waitForResponse((r) => r.url() === `${base}/api/labs/${labId}/runs` && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    const started = await response;
    expect(started.status()).toBe(202);
    return (await started.json()) as { runId: string; runToken: string };
  };
  try {
    await start();
    await page.goto(`${base}/labs/lab-15?tab=run`);
    await page.getByRole('link', { name: 'Sign in to continue' }).click();
    await page.getByLabel('User name').fill('recovery-learner');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await test.step('Reload the same pending run and cancel with a recovered capability', async () => {
      await page.getByLabel(/Approver.*decision/).selectOption('ask');
      const pending = await run('lab-15');
      await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByTestId('run-status')).toHaveText('Waiting for your approval…');
      expect((await (await page.request.get(`${base}/api/runs/${pending.runId}`)).json()).pendingApprovals).toBe(1);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByTestId('run-status')).toHaveText('Run cancelled');
    });

    await test.step('Reload another pending run and approve it once', async () => {
      await page.getByLabel(/Approver.*decision/).selectOption('ask');
      await run('lab-15');
      await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed', { timeout: 20000 });
    });

    let terminalId = '';
    await test.step('Historical replay and latest-run recovery do not undo a progress reset', async () => {
      await page.goto(`${base}/labs/lab-00?tab=run`);
      const saved = page.waitForResponse((r) => r.url() === `${base}/api/progress/lab-00` && r.request().method() === 'POST');
      terminalId = (await run('lab-00')).runId;
      await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed');
      expect((await saved).status()).toBe(200);
      await page.getByRole('button', { name: 'Reset this lab’s progress', exact: true }).click();
      const reset = page.waitForResponse((r) => r.url() === `${base}/api/progress/lab-00/reset`);
      await page.getByRole('button', { name: 'Confirm reset', exact: true }).click();
      expect((await reset).status()).toBe(200);
      await page.reload();
      await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed');
      await expect(page.getByTestId('lab-status')).toHaveText('Not started');
      await page.getByRole('button', { name: 'Reset to example', exact: true }).click();
      await page.reload();
      await expect(page.getByTestId('run-status')).toHaveText('Ready');
      await page.getByRole('button', { name: 'Recover latest run', exact: true }).click();
      await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed');
      await expect(page.getByTestId('lab-status')).toHaveText('Not started');
    });

    await test.step('Crash during approval, recover failed history and refuse a stale decision', async () => {
      await page.goto(`${base}/labs/lab-15?tab=run`);
      await page.getByLabel(/Approver.*decision/).selectOption('ask');
      const interrupted = await run('lab-15');
      await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
      await stop(true);
      await start();
      await page.reload();
      await expect(page.getByTestId('run-status')).toHaveText('Run failed');
      await expect(page.getByRole('alert')).toContainText('not restarted');
      await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
      const response = await page.request.get(`${base}/api/runs/${interrupted.runId}/events`);
      const events = (await response.text())
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.slice(6)));
      const approval = events.find((e) => e.type === 'approval-request');
      expect(approval).toBeTruthy();
      expect(events.some((e) => e.type === 'approval-resolved' || e.type === 'result')).toBe(false);
      const late = await page.request.post(`${base}/api/runs/${interrupted.runId}/approvals/${approval.approvalId}`, {
        headers: { 'x-run-token': interrupted.runToken },
        data: { decision: 'approve' },
      });
      expect(late.status()).toBe(409);
      expect((await (await page.request.get(`${base}/api/runs/${interrupted.runId}`)).json()).pendingApprovals).toBe(0);
      expect((await (await page.request.get(`${base}/api/runs/${terminalId}`)).json()).status).toBe('succeeded');
      await page.goto(`${base}/labs/lab-00?tab=run`);
      await expect(page.getByTestId('run-status')).toHaveText('Run succeeded — all checks passed');
      await expect(page.getByTestId('lab-status')).toHaveText('Not started');
      const progress = await page.request.get(`${base}/api/progress`, {
        headers: { 'x-progress-subject': encodeURIComponent(subject) },
      });
      expect((await progress.json()).entries.find((e: { labId: string }) => e.labId === 'lab-00').record).toBeNull();
      expect(starts).toBe(4);
      const storage = await page.evaluate(() => JSON.stringify({ session: { ...sessionStorage }, local: { ...localStorage } }));
      expect(storage).not.toContain(interrupted.runToken);
    });
  } finally {
    await stop();
  }
});
