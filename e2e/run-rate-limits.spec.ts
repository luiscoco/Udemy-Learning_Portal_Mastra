import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { SECRET_KEYS } from '../packages/deploy/src/schema';

test.use({ storageState: { cookies: [], origins: [] } });

test('shows real start/control limits and keeps cancellation available without retrying actions', async ({ page }) => {
  test.setTimeout(90000);
  const reservation = createServer();
  await new Promise<void>((done, fail) => {
    reservation.once('error', fail);
    reservation.listen(0, '127.0.0.1', done);
  });
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('Missing owned test port');
  const base = `http://127.0.0.1:${address.port}`;
  await new Promise<void>((done) => reservation.close(() => done()));
  const child = spawn(process.execPath, [resolve('apps/api/dist/server.js')], {
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
      PORT: String(address.port),
      LOG_LEVEL: 'silent',
      LOG_REQUESTS: 'false',
      MASTRA_MODE: 'offline',
      AUTH_PROVIDER: 'dev',
      AUTH_DEV_USERS: 'limited-learner',
      AUTH_DEV_PASSWORD: '',
      AUTH_SESSION_STORE: 'memory',
      TRUST_PROXY: 'false',
      RUN_STORE: 'memory',
      RUN_RATE_WINDOW_MS: '60000',
      RUN_START_RATE_USER_MAX: '1',
      RUN_START_RATE_IP_MAX: '10',
      RUN_CONTROL_RATE_USER_MAX: '1',
      RUN_CONTROL_RATE_IP_MAX: '10',
      MLP_DATA_DIR: resolve('.data', `rate-browser-${process.pid}-${randomUUID()}`),
      WEB_DIST_DIR: resolve('apps/web/dist'),
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  let spawnFailed = false;
  child.once('error', () => {
    spawnFailed = true;
  });
  let startRequests = 0,
    decisionRequests = 0;
  page.on('request', (r) => {
    if (r.method() !== 'POST') return;
    if (/\/api\/labs\/lab-15\/runs$/.test(r.url())) ++startRequests;
    if (/\/approvals\//.test(r.url())) ++decisionRequests;
  });
  try {
    await expect(async () => {
      if (spawnFailed || child.exitCode !== null || child.signalCode !== null) throw new Error('Owned rate API stopped');
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
      await response.arrayBuffer();
      expect(response.ok).toBe(true);
    }).toPass({ timeout: 40000, intervals: [100, 250, 500] });
    await page.goto(`${base}/labs/lab-15?tab=run`);
    await page.getByRole('link', { name: 'Sign in to continue' }).click();
    await page.getByLabel('User name').fill('limited-learner');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel(/Approver.*decision/).selectOption('ask');
    const startResponse = page.waitForResponse(
      (r) => r.url() === `${base}/api/labs/lab-15/runs` && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    const started = await startResponse;
    expect(started.status()).toBe(202);
    const { runId } = (await started.json()) as { runId: string };
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    // A second authenticated tab could recover a capability; it shares the same control allowance.
    const recovered = await page.request.post(`${base}/api/runs/${runId}/recover`, {
      headers: { 'x-run-subject': 'dev%3Alimited-learner' },
    });
    expect(recovered.status()).toBe(200);
    const decisionResponse = page.waitForResponse((r) => /\/approvals\//.test(r.url()) && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    const deniedDecision = await decisionResponse;
    expect(deniedDecision.status()).toBe(429);
    expect(Number(deniedDecision.headers()['retry-after'])).toBeGreaterThan(0);
    await expect(page.getByRole('alert')).toContainText('Too many approval or recovery requests');
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
    expect((await (await page.request.get(`${base}/api/runs/${runId}`)).json()).pendingApprovals).toBe(1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByTestId('run-status')).toHaveText('Run cancelled');
    const blockedStart = page.waitForResponse(
      (r) => r.url() === `${base}/api/labs/lab-15/runs` && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    expect((await blockedStart).status()).toBe(429);
    await expect(page.getByRole('alert')).toContainText('Too many run starts');
    await expect(page.getByRole('alert')).toContainText('Try again in');
    expect(startRequests).toBe(2); // one admitted, one explicit blocked attempt; no automatic retry
    expect(decisionRequests).toBe(1);
    const events = await (await page.request.get(`${base}/api/runs/${runId}/events`)).text();
    expect(events).toContain('"status":"cancelled"');
    expect(events).not.toContain('"type":"result"');
    const active = await page.request.get(`${base}/api/runs?labId=lab-15`, {
      headers: { 'x-run-subject': 'dev%3Alimited-learner' },
    });
    expect((await active.json()).runs).toHaveLength(1);
  } finally {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((done) => {
        const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
        child.once('exit', () => {
          clearTimeout(timer);
          done();
        });
        child.kill('SIGTERM');
      });
    }
  }
});
