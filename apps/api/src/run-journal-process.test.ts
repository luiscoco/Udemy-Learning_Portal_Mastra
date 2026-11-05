import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { testMemoryDir } from '@mlp/labs/test-memory';

it('excludes a competing process and interrupts a killed approval without executing its side effect', async () => {
  const root = testMemoryDir('run-journal-process');
  const fixture = fileURLToPath(new URL('./run-journal-process.fixture.ts', import.meta.url));
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    RUN_TEST_SECRET: 'test-process-run-journal-secret-at-least-32-characters',
  };
  const child = spawn(process.execPath, ['--import', 'tsx', fixture, 'pending', root], {
    env,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: true,
  });
  try {
    const descriptor = await new Promise<{ runId: string; approvalId: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Test journal process did not start')), 20000);
      child.once('error', reject);
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Test journal process exited early'));
      });
      child.once('message', (message) => {
        clearTimeout(timer);
        resolve(message as { runId: string; approvalId: string });
      });
    });
    expect(descriptor.approvalId).toBeTruthy();
    const compete = await promisify(execFile)(process.execPath, ['--import', 'tsx', fixture, 'compete', root], {
      env,
      timeout: 20000,
      windowsHide: true,
    });
    expect(JSON.parse(compete.stdout).locked).toBe(true);
    expect(child.exitCode).toBeNull();
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
    const recovered = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', fixture, 'recover', root, descriptor.runId, descriptor.approvalId],
      { env, timeout: 20000, windowsHide: true },
    );
    const data = JSON.parse(recovered.stdout);
    expect(data.snapshot).toMatchObject({ runId: descriptor.runId, status: 'failed', pendingApprovals: 0 });
    expect(data.sideEffect).toBe(false);
    expect(data.lateCode).toBe('CONFLICT');
    expect(data.events.at(-1)).toMatchObject({ type: 'complete', status: 'failed' });
    expect(data.events.some((e: { type: string }) => e.type === 'approval-resolved')).toBe(false);
  } finally {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
  }
}, 70000);
