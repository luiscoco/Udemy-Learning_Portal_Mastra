// Staging smoke test (L73 definition of done): health, TLS, streaming and persistence on the deployed app.
//   npm run smoke:staging                     URL from secrets/staging/url, password from secrets/staging/learner-password
//   npm run smoke:staging -- --restart        also restarts the revision between the two persistence runs (az)
//   options: --url https://… --rg mlp-staging-rg --app mlp-staging
// Writes a summary to secrets/staging/last-smoke.json. Never prints the password or the session cookie.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const dir = join(process.cwd(), 'secrets', 'staging');
const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8').trim() : undefined);
const base = (opt('url') ?? read('url') ?? '').replace(/\/$/, '');
const password = process.env.STAGING_PASSWORD ?? read('learner-password');
const RG = opt('rg', 'mlp-staging-rg')!;
const APP = opt('app', 'mlp-staging')!;
if (!/^https:\/\//.test(base) || !password) {
  process.stderr.write(
    'usage: npm run smoke:staging -- [--url https://…] [--restart]   (needs secrets/staging/learner-password)\n',
  );
  process.exit(2);
}

const results: { step: string; ok: boolean; detail: string }[] = [];
const record = (step: string, ok: boolean, detail: string) => {
  results.push({ step, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${step}: ${detail}\n`);
  return ok;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitReady(timeoutMs = 300_000): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if ((await fetch(`${base}/api/ready`, { signal: AbortSignal.timeout(20_000) })).status === 200) return Date.now() - started;
    } catch {
      // cold start (scale from zero) or restart in progress
    }
    await sleep(3_000);
  }
  throw new Error('not ready in time');
}

let cookie = '';
async function api(path: string, init: RequestInit = {}) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers as Record<string, string>) },
    signal: AbortSignal.timeout(60_000),
  });
}

async function login() {
  const res = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'learner', password }) });
  const set = res.headers.get('set-cookie') ?? '';
  cookie = set.split(';')[0] ?? '';
  return { status: res.status, set };
}

/** Starts a run and reads its SSE stream, recording when each chunk arrived. */
async function runLab(labId: string, input: unknown) {
  const started = await api(`/api/labs/${labId}/runs`, { method: 'POST', body: JSON.stringify({ input, mode: 'offline' }) });
  if (started.status !== 202) throw new Error(`${labId}: start answered ${started.status}`);
  const { runId } = (await started.json()) as { runId: string };
  const t0 = Date.now();
  const res = await fetch(`${base}/api/runs/${runId}/events`, {
    headers: { cookie, accept: 'text/event-stream' },
    signal: AbortSignal.timeout(120_000),
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: { type: string; at: number; data: Record<string, unknown> }[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i;
    while ((i = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      const data = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!data) continue;
      const parsed = JSON.parse(data.slice(6)) as Record<string, unknown>;
      events.push({ type: String(parsed.type), at: Date.now() - t0, data: parsed });
    }
    if (events.some((e) => e.type === 'complete')) break;
  }
  await reader.cancel().catch(() => undefined);
  return { runId, events, contentType: res.headers.get('content-type') ?? '' };
}

const az = (cmd: string[]) => spawnSync('az', [...cmd, '--only-show-errors', '-o', 'tsv'], { shell: true, encoding: 'utf8' });

async function main() {
  // TLS and redirect
  const host = new URL(base).host;
  const plain = await fetch(`http://${host}/api/health`, { redirect: 'manual', signal: AbortSignal.timeout(60_000) }).catch(
    (e: Error) => e,
  );
  const location = plain instanceof Response ? (plain.headers.get('location') ?? '') : '';
  record(
    'HTTP redirects to HTTPS',
    plain instanceof Response && [301, 302, 307, 308].includes(plain.status) && location.startsWith('https://'),
    plain instanceof Response ? `${plain.status} → ${location}` : plain.message,
  );
  const cold = await waitReady();
  record(
    'TLS certificate valid (https fetch verified by Node)',
    true,
    `ready after ${Math.round(cold / 1000)} s (includes a cold start from zero)`,
  );

  const health = await api('/api/health');
  record('liveness', health.status === 200, `GET /api/health ${health.status}`);
  const ready = (await (await api('/api/ready')).json()) as { status: string; checks: { name: string; status: string }[] };
  record(
    'readiness',
    ready.status === 'ready' && ready.checks.some((c) => c.name === 'storage' && c.status === 'ok'),
    ready.checks.map((c) => `${c.name}=${c.status}`).join(', '),
  );
  const spa = await api('/labs/lab-73');
  record(
    'web app served on the same origin',
    spa.status === 200 && (spa.headers.get('content-type') ?? '').includes('text/html'),
    `GET /labs/lab-73 ${spa.status}`,
  );

  const l = await login();
  const flags = ['Secure', 'HttpOnly', 'SameSite=Strict'].filter((f) => new RegExp(`;\\s*${f}`, 'i').test(l.set));
  record(
    'password login with a Secure, HttpOnly, SameSite=Strict cookie',
    l.status === 200 && flags.length === 3,
    `status ${l.status}; flags ${flags.join(', ')}`,
  );

  // Streaming
  const def = (await (await api('/api/labs/lab-00')).json()) as { exampleInput: Record<string, unknown> };
  const stream = await runLab('lab-00', { ...def.exampleInput, delayMs: 200 });
  const tokens = stream.events.filter((e) => e.type === 'token');
  const complete = stream.events.find((e) => e.type === 'complete');
  const spread = tokens.length > 1 ? tokens.at(-1)!.at - tokens[0]!.at : 0;
  record(
    'SSE streams incrementally through the ingress',
    stream.contentType.includes('text/event-stream') &&
      tokens.length >= 2 &&
      spread >= 200 &&
      complete?.data.status === 'succeeded' &&
      tokens[0]!.at < complete.at,
    `${tokens.length} tokens; first at ${tokens[0]?.at} ms, last at ${tokens.at(-1)?.at} ms, complete at ${complete?.at} ms`,
  );

  // Persistence across a restart
  const l71 = (await (await api('/api/labs/lab-71')).json()) as { exampleInput: Record<string, unknown> };
  const noteA = `staging note ${new Date().toISOString()}`;
  const first = await runLab('lab-71', { ...l71.exampleInput, store: 'durable', note: noteA });
  const firstOk = first.events.find((e) => e.type === 'complete')?.data.status === 'succeeded';
  record(
    'durable write (lab-71)',
    firstOk,
    firstOk ? 'succeeded' : JSON.stringify(first.events.filter((e) => e.type === 'error').map((e) => e.data.message)),
  );

  if (args.includes('--restart')) {
    const revision = az(['containerapp', 'show', '-g', RG, '-n', APP, '--query', 'properties.latestRevisionName']).stdout.trim();
    const r = az(['containerapp', 'revision', 'restart', '-g', RG, '-n', APP, '--revision', revision]);
    record('revision restarted', r.status === 0, revision);
    await sleep(15_000);
    const back = await waitReady();
    record('ready again after the restart', true, `${Math.round(back / 1000)} s`);
    await login(); // in-memory sessions end with the process
  }
  const second = await runLab('lab-71', { ...l71.exampleInput, store: 'durable', note: 'second staging note' });
  const out = second.events.find((e) => e.type === 'result')?.data.output as
    { migration: { applied: unknown[] }; restart: { recalled: string[] } } | undefined;
  record(
    `persistence ${args.includes('--restart') ? 'across the restart' : '(same process)'}`,
    !!out && out.migration.applied.length === 0 && out.restart.recalled.includes(noteA),
    out
      ? `migrations applied: ${out.migration.applied.length}; recalled ${out.restart.recalled.length} note(s), first note ${out.restart.recalled.includes(noteA) ? 'found' : 'MISSING'}`
      : 'no result',
  );
}

main()
  .catch((e) => record('smoke run', false, e instanceof Error ? e.message : String(e)))
  .finally(() => {
    const passed = results.filter((r) => r.ok).length;
    writeFileSync(
      join(dir, 'last-smoke.json'),
      JSON.stringify({ url: base, at: new Date().toISOString(), passed, total: results.length, results }, null, 2),
    );
    process.stdout.write(`\n${passed}/${results.length} staging checks passed\n`);
    process.exitCode = passed === results.length ? 0 : 1;
  });
