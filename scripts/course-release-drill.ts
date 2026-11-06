import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { SECRET_KEYS } from '../packages/deploy/src/schema.js';
import { ARCHIVE_ROOT, releaseCourse } from './course-release.js';

async function main() {
  const repository = resolve(import.meta.dirname, '..');
  const artifact = releaseCourse(repository);
  const drillParent = join(repository, '.data', 'course-release-drills');
  mkdirSync(drillParent, { recursive: true });
  const target = mkdtempSync(join(drillParent, 'install-'));
  const bytes = unzipSync(new Uint8Array(readFileSync(artifact.destination)));
  for (const [path, content] of Object.entries(bytes)) {
    if (!path.startsWith(ARCHIVE_ROOT) || path.includes('\\') || path.split('/').some((p) => p === '..'))
      throw new Error('Unsafe drill archive');
    const file = join(target, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  const cwd = join(target, ARCHIVE_ROOT);
  const env = {
    ...process.env,
    ...Object.fromEntries(
      SECRET_KEYS.flatMap((key) => [
        [key, ''],
        [`${key}_FILE`, ''],
      ]),
    ),
    MASTRA_MODE: 'offline',
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    AUTH_PROVIDER: 'dev',
    AUTH_DEV_USERS: 'learner',
    AUTH_SESSION_STORE: 'memory',
    RUN_STORE: 'memory',
    HTTP_REQUIRE_HTTPS: 'false',
    CORS_ORIGIN: '',
    TRUST_PROXY: 'false',
    LOG_LEVEL: 'silent',
    LOG_REQUESTS: 'false',
    WEB_DIST_DIR: join(cwd, 'apps/web/dist'),
    MLP_DATA_DIR: join(cwd, '.data'),
  };
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run this drill using npm run release:course:drill');
  const command = async (args: string[]) => {
    await new Promise<void>((done, fail) => {
      const child = spawn(process.execPath, [npm, ...args], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const log = join(target, `npm-${args.join('-')}.log`);
      child.stdout.on('data', (chunk) => writeFileSync(log, chunk, { flag: 'a' }));
      child.stderr.on('data', (chunk) => writeFileSync(log, chunk, { flag: 'a' }));
      const timer = setTimeout(() => child.kill('SIGKILL'), args[0] === 'ci' ? 600000 : 180000);
      child.once('error', (err) => {
        clearTimeout(timer);
        fail(err);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) done();
        else fail(new Error(`Extracted npm ${args.join(' ')} failed; inspect drill log`));
      });
    });
  };
  // Audit is recorded separately; cached exact lockfile artifacts need no repeated registry revalidation.
  await command(['ci', '--prefer-offline', '--no-audit', '--no-fund']);
  await command(['run', 'build']);
  const reservation = createServer();
  await new Promise<void>((done) => reservation.listen(0, '127.0.0.1', done));
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('Missing drill port');
  await new Promise<void>((done) => reservation.close(() => done()));
  const base = `http://127.0.0.1:${address.port}`;
  let child: ChildProcess | undefined;
  try {
    child = spawn(process.execPath, ['apps/api/dist/server.js'], {
      cwd,
      env: { ...env, PORT: String(address.port) },
      windowsHide: true,
      stdio: 'ignore',
    });
    let failed = false;
    child.once('error', () => {
      failed = true;
    });
    const deadline = Date.now() + 40000;
    let healthy = false;
    while (Date.now() < deadline) {
      if (failed || child.exitCode !== null || child.signalCode !== null) throw new Error('Extracted API stopped');
      try {
        const r = await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) });
        healthy = r.ok;
        await r.arrayBuffer();
        if (healthy) break;
      } catch {
        /* startup */
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    if (!healthy) throw new Error('Extracted API startup timed out');
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'learner' }),
    });
    if (!login.ok) throw new Error('Extracted login failed');
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    await login.arrayBuffer();
    if (!cookie) throw new Error('No drill session');
    const started = await fetch(base + '/api/labs/lab-00/runs', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { message: 'Fresh student download', delayMs: 0 }, mode: 'offline' }),
    });
    if (started.status !== 202) throw new Error('Extracted run start failed');
    const run = (await started.json()) as { runId: string };
    const events = await fetch(base + `/api/runs/${run.runId}/events`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(20000),
    });
    const text = await events.text();
    if (!events.ok || !text.includes('"status":"succeeded"') || !text.includes('"passed":true'))
      throw new Error('Extracted orientation checks failed');
    const page = await fetch(base + '/labs/lab-00');
    await page.arrayBuffer();
    if (!page.ok) throw new Error('Extracted web page failed');
    const evidence = {
      archiveSha256: artifact.sha256,
      sourceFiles: artifact.files,
      install: true,
      build: true,
      web: true,
      offlineLab00: true,
      providerCalls: 0,
      platform: process.platform,
    };
    writeFileSync(join(target, 'RESULT.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ target, ...evidence }, null, 2));
  } finally {
    if (child?.pid && child.exitCode === null && child.signalCode === null)
      await new Promise<void>((done) => {
        const current = child!;
        const timer = setTimeout(() => current.kill('SIGKILL'), 10000);
        current.once('exit', () => {
          clearTimeout(timer);
          done();
        });
        current.kill('SIGTERM');
      });
  }
}
void main().catch((err: unknown) => {
  console.error(
    `[course-drill] ${err instanceof Error ? err.message : 'Failed'}; inspect the owned .data/course-release-drills directory.`,
  );
  process.exitCode = 1;
});
