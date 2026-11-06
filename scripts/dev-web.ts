// Used by the root dev command. The direct web workspace command remains available without this gate.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { SECRET_KEYS } from '../packages/deploy/src/schema.js';

export function webDevEnvironment(env: NodeJS.ProcessEnv, target: string): NodeJS.ProcessEnv {
  const web: NodeJS.ProcessEnv = { ...env, API_PROXY_TARGET: target };
  for (const key of SECRET_KEYS) {
    delete web[key];
    delete web[`${key}_FILE`];
  }
  return web;
}

export function devApiTarget(root: string, env: NodeJS.ProcessEnv = process.env): string {
  // Match the API workspace's dotenv-file precedence. Never load its provider values into process.env
  // or pass a parsed dotenv object to Vite. Only these non-secret connection settings are selected.
  const file = [resolve(root, 'apps/api/.env'), resolve(root, '.env')].find(existsSync);
  const local = file
    ? parseEnv(
        readFileSync(file, 'utf8')
          .split(/\r?\n/)
          .filter((line) => /^\s*(?:export\s+)?(?:HOST|PORT|API_PROXY_TARGET)\s*=/.test(line))
          .join('\n'),
      )
    : {};
  const explicit = env.API_PROXY_TARGET ?? local.API_PROXY_TARGET;
  let target: URL;
  try {
    if (explicit !== undefined) target = new URL(explicit);
    else {
      const port = Number(env.PORT ?? local.PORT ?? '8787');
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error();
      let host = env.HOST ?? local.HOST ?? '127.0.0.1';
      if (host === '0.0.0.0') host = '127.0.0.1';
      if (host === '::') host = '::1';
      if (host.includes(':') && !host.startsWith('[')) host = `[${host}]`;
      target = new URL(`http://${host}:${port}`);
    }
    if (
      !['http:', 'https:'].includes(target.protocol) ||
      target.username ||
      target.password ||
      target.pathname !== '/' ||
      target.search ||
      target.hash
    )
      throw new Error();
  } catch {
    // Do not include the supplied value: a malformed URL might contain credentials.
    throw new Error('Invalid API connection settings. Check HOST, PORT and API_PROXY_TARGET (an HTTP(S) origin).');
  }
  return target.origin;
}

export async function waitForDevApi(
  target: string,
  {
    timeoutMs = 120_000,
    requestTimeoutMs = 2_000,
    intervalMs = 300,
    signal,
  }: {
    timeoutMs?: number;
    requestTimeoutMs?: number;
    intervalMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  const overall = AbortSignal.timeout(timeoutMs);
  const stopped = AbortSignal.any(signal ? [signal, overall] : [overall]);
  while (!stopped.aborted) {
    try {
      const response = await fetch(`${target}/api/ready`, {
        signal: AbortSignal.any([stopped, AbortSignal.timeout(requestTimeoutMs)]),
        redirect: 'error',
      });
      const body: unknown = await response.json();
      if (response.ok && typeof body === 'object' && body !== null && 'status' in body && body.status === 'ready') return;
    } catch {
      // Connection refused is expected during cold runtime imports. Each request and the whole wait are bounded.
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0 || stopped.aborted) break;
    try {
      await delay(Math.min(intervalMs, remaining), undefined, { signal: stopped });
    } catch {
      break;
    }
  }
  signal?.throwIfAborted();
  throw new Error(
    `API startup timed out after ${timeoutMs / 1000} seconds. Check the [api] logs, .env settings and port availability; then restart npm run dev.`,
  );
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..');
  const stop = new AbortController();
  const interrupt = () => stop.abort();
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    const target = devApiTarget(root);
    console.log(`[dev] Waiting for API readiness at ${target} (up to 120 seconds). Cold startup loads the lab runtime.`);
    await waitForDevApi(target, { signal: stop.signal });
    stop.signal.throwIfAborted();
    const npm = process.env.npm_execpath;
    if (!npm) throw new Error('Start the platform with npm run dev from the repository root.');
    console.log('[dev] API ready. Starting the web server.');
    const child = spawn(process.execPath, [npm, 'run', 'dev', '--workspace', '@mlp/web'], {
      cwd: root,
      env: webDevEnvironment(process.env, target),
      stdio: 'inherit',
      windowsHide: true,
    });
    const terminate = () => child.kill('SIGTERM');
    stop.signal.addEventListener('abort', terminate, { once: true });
    try {
      process.exitCode = await new Promise<number>((resolve, reject) => {
        child.once('error', () => reject(new Error('Unable to launch Vite. Run npm ci and retry npm run dev.')));
        child.once('exit', (code) => resolve(code ?? 1));
      });
    } finally {
      stop.signal.removeEventListener('abort', terminate);
    }
  } catch (error) {
    if (!stop.signal.aborted) console.error(`[dev] ${error instanceof Error ? error.message : 'Development startup failed.'}`);
    process.exitCode = stop.signal.aborted ? 130 : 1;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch(() => {
    console.error('[dev] Unable to read development connection settings. Check .env file permissions.');
    process.exitCode = 1;
  });
}
