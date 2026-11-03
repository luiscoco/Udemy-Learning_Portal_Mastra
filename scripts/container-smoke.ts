// Container smoke test (L72 definition of done), run in CI after `docker build -t <image> .`:
//   node --import tsx scripts/container-smoke.ts <image>
// 1. A production container without AUTH_SESSION_SECRET exits (78) and names the key, echoing no secret.
// 2. With file secrets it starts, /api/health and /api/ready answer 200, Docker reports it healthy, a password
//    login works and a lab-00 run streams over SSE to "complete".
// 3. With a read-only data volume, /api/ready answers 503 (data-dir) while /api/health stays 200.
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashUserEntry } from '../packages/auth/src/index.ts';

const image = process.argv[2] ?? 'mastra-learning-platform:smoke';
const tag = randomBytes(4).toString('hex');
const volume = `mlp-smoke-data-${tag}`;
const names: string[] = [];
const results: { step: string; ok: boolean; detail: string }[] = [];

const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const record = (step: string, ok: boolean, detail: string) => {
  results.push({ step, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${step}: ${detail}\n`);
  if (!ok) throw new Error(`${step} failed: ${detail}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const secretsDir = mkdtempSync(join(tmpdir(), 'mlp-smoke-secrets-'));
chmodSync(secretsDir, 0o755);
const password = randomBytes(12).toString('base64url');
const sessionSecret = randomBytes(32).toString('base64url');
const auditKey = randomBytes(32).toString('base64url');
const put = (name: string, value: string) => writeFileSync(join(secretsDir, name), `${value}\n`, { mode: 0o644 });
put('auth_session_secret', sessionSecret);
put('audit_hmac_key', auditKey);
put('auth_users', await hashUserEntry('learner', password));
const secretValues = [password, sessionSecret, auditKey];

const fileEnv = (withSession: boolean) => [
  '-e',
  'AUTH_USERS_FILE=/run/secrets/auth_users',
  '-e',
  'AUDIT_HMAC_KEY_FILE=/run/secrets/audit_hmac_key',
  ...(withSession ? ['-e', 'AUTH_SESSION_SECRET_FILE=/run/secrets/auth_session_secret'] : []),
  '-v',
  `${secretsDir}:/run/secrets:ro`,
];

async function waitFor(url: string, want: (s: number) => boolean, ms = 60_000): Promise<Response> {
  const until = Date.now() + ms;
  let last = 'no answer';
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (want(res.status)) return res;
      last = `status ${res.status}`;
    } catch (e) {
      last = (e as Error).message;
    }
    await sleep(500);
  }
  throw new Error(`${url}: ${last}`);
}

function start(name: string, port: number, extra: string[]) {
  names.push(name);
  docker('run', '-d', '--name', name, '-p', `127.0.0.1:${port}:8787`, ...extra, image);
}

try {
  // 1. Missing secret
  const missing = spawnSync('docker', ['run', '--rm', ...fileEnv(false), '-v', `${volume}:/data`, image], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  const stderr = missing.stderr ?? '';
  record(
    'missing secret refuses start-up',
    missing.status === 78 &&
      stderr.includes('AUTH_SESSION_SECRET is required in production (set AUTH_SESSION_SECRET or AUTH_SESSION_SECRET_FILE)'),
    `exit ${missing.status}; ${stderr.trim().split('\n').at(-1)?.slice(0, 200)}`,
  );
  record(
    'no secret value in the refusal',
    !secretValues.some((s) => stderr.includes(s) || (missing.stdout ?? '').includes(s)),
    'checked stdout and stderr',
  );

  // 2. Healthy container
  const base = 'http://127.0.0.1:18787';
  start(`mlp-smoke-${tag}`, 18787, [...fileEnv(true), '-v', `${volume}:/data`]);
  await waitFor(`${base}/api/health`, (s) => s === 200);
  record('liveness', true, 'GET /api/health 200');
  const ready = (await (await waitFor(`${base}/api/ready`, (s) => s === 200)).json()) as {
    status: string;
    checks: { name: string; status: string }[];
  };
  record('readiness', ready.status === 'ready', ready.checks.map((c) => `${c.name}=${c.status}`).join(', '));
  let health = '';
  for (let i = 0; i < 60 && health !== 'healthy'; i++) {
    health = docker('inspect', '-f', '{{.State.Health.Status}}', names[0]!);
    if (health !== 'healthy') await sleep(1_000);
  }
  record('Docker HEALTHCHECK', health === 'healthy', health);

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'learner', password }),
  });
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  record('password login', login.status === 200 && cookie.startsWith('mlp_session='), `status ${login.status}`);
  const def = (await (await fetch(`${base}/api/labs/lab-00`)).json()) as { exampleInput: unknown };
  const started = await fetch(`${base}/api/labs/lab-00/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ input: def.exampleInput, mode: 'offline' }),
  });
  const { runId } = (await started.json()) as { runId: string };
  record('run started', started.status === 202 || started.status === 201 || started.status === 200, `status ${started.status}`);
  const events = await fetch(`${base}/api/runs/${runId}/events`, { headers: { cookie, accept: 'text/event-stream' } });
  const reader = events.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + 60_000;
  while (!/event: complete|"type":"complete"/.test(text) && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  const tokens = (text.match(/"type":"token"/g) ?? []).length;
  record(
    'SSE run streamed to completion',
    /"type":"complete"/.test(text) && /"status":"succeeded"/.test(text),
    `${tokens} token events`,
  );
  const logs = spawnSync('docker', ['logs', names[0]!], { encoding: 'utf8' });
  const allLogs = `${logs.stdout}${logs.stderr}`;
  record(
    'logs are JSON lines without secrets',
    allLogs.includes('"msg":"api listening"') && !secretValues.some((s) => allLogs.includes(s)),
    'docker logs checked',
  );
  docker('stop', names[0]!);

  // 3. Read-only data volume
  const roBase = 'http://127.0.0.1:18788';
  start(`mlp-smoke-ro-${tag}`, 18788, [...fileEnv(true), '-v', `${volume}:/data:ro`]);
  await waitFor(`${roBase}/api/health`, (s) => s === 200);
  const ro = await waitFor(`${roBase}/api/ready`, (s) => s === 503);
  const roBody = (await ro.json()) as { checks: { name: string; status: string; message: string }[] };
  const dataDir = roBody.checks.find((c) => c.name === 'data-dir');
  record('read-only data volume → not ready', dataDir?.status === 'fail', `503; data-dir: ${dataDir?.message}`);
  record('liveness stays up', (await fetch(`${roBase}/api/health`)).status === 200, 'GET /api/health 200');
} finally {
  for (const n of names) spawnSync('docker', ['rm', '-f', n]);
  spawnSync('docker', ['volume', 'rm', '-f', volume]);
  rmSync(secretsDir, { recursive: true, force: true });
  process.stdout.write(`\n${results.filter((r) => r.ok).length}/${results.length} container checks passed\n`);
}
