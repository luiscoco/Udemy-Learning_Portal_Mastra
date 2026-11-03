// Starts the BUILT API (apps/api/dist/server.js) in production mode on a free loopback port for the L74 gates,
// with throwaway secrets and one password user. Nothing is written outside a temporary directory.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashUserEntry } from '../packages/auth/src/index.ts';

export interface RegressionServer {
  url: string;
  username: string;
  password: string;
  secrets: string[];
  logs: () => string;
  stop: () => Promise<void>;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });

export async function startRegressionServer(repo: string, env: Record<string, string> = {}): Promise<RegressionServer> {
  const server = join(repo, 'apps', 'api', 'dist', 'server.js');
  if (!existsSync(server)) throw new Error('apps/api/dist/server.js is missing: run npm run build first');
  const dir = mkdtempSync(join(tmpdir(), 'mlp-regression-'));
  const port = await freePort();
  const password = randomBytes(12).toString('base64url');
  const sessionSecret = randomBytes(32).toString('base64url');
  const auditKey = randomBytes(32).toString('base64url');
  const child: ChildProcess = spawn(process.execPath, [server], {
    cwd: dir, // no .env here: only the variables below
    env: {
      PATH: process.env.PATH ?? '',
      SystemRoot: process.env.SystemRoot ?? '',
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      LOG_LEVEL: 'warn',
      LOG_REQUESTS: 'false',
      MASTRA_MODE: 'offline',
      MLP_DATA_DIR: join(dir, 'data'),
      WEB_DIST_DIR: join(repo, 'apps', 'web', 'dist'),
      AUTH_PROVIDER: 'password',
      AUTH_USERS: await hashUserEntry('regression', password),
      AUTH_SESSION_SECRET: sessionSecret,
      AUDIT_HMAC_KEY: auditKey,
      MAX_CONCURRENT_RUNS: '4',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout?.on('data', (d) => (logs += d));
  child.stderr?.on('data', (d) => (logs += d));
  const url = `http://127.0.0.1:${port}`;
  const until = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`the API exited with ${child.exitCode}: ${logs.slice(-500)}`);
    try {
      if ((await fetch(`${url}/api/ready`)).status === 200) break;
    } catch {
      // starting
    }
    if (Date.now() > until) throw new Error(`the API did not become ready: ${logs.slice(-500)}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  return {
    url,
    username: 'regression',
    password,
    secrets: [password, sessionSecret, auditKey],
    logs: () => logs,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await new Promise((r) => setTimeout(r, 1_000));
        if (child.exitCode === null) child.kill('SIGKILL');
      }
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows may keep libSQL files locked until the process is gone
      }
    },
  };
}
