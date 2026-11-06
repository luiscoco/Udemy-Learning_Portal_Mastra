// L74 production regression suite: measures every release gate for real, evaluates it against
// regression/gates.json and regression/baseline.json, records evidence, and exits 1 when any gate fails.
//   npm run regression                         all gates (builds first if apps/api/dist is missing)
//   npm run regression -- --only security,load-smoke
//   npm run regression -- --inject eval-regression   prove that a gate fails on a regression (evidence not saved as latest)
// Writes regression/evidence/latest.json and regression/REPORT.md (or regression/evidence/injected-<gate>.json).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalog } from '../packages/lab-catalog/src/index.ts';
import { createLabServices } from '../packages/labs/src/services.ts';
import { testMemoryDir } from '../packages/labs/src/test-memory.ts';
import {
  evaluateA11y,
  evaluateEval,
  evaluateLoad,
  evaluateRecovery,
  evaluateSecurity,
  evaluateTracing,
  GATE_NAMES,
  inject,
  type A11yPage,
  type Advisory,
  type Baseline,
  type GateConfig,
  type GateName,
  type GateResult,
  type HttpCheck,
  type LoadMetrics,
  type Measurements,
  type TestOutcome,
} from '../packages/labs/src/lab-74/gates.ts';
import { measureEvalAndTracing } from '../packages/labs/src/lab-74/measure.ts';
import { startRegressionServer, type RegressionServer } from './regression-server.ts';

const repo = process.cwd();
const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = (opt('only')?.split(',') ?? GATE_NAMES) as GateName[];
const injected = opt('inject') as GateName | undefined;
if (injected && !GATE_NAMES.includes(injected)) throw new Error(`--inject must be one of ${GATE_NAMES.join(', ')}`);
const cfgFile = JSON.parse(readFileSync(join(repo, 'regression', 'gates.json'), 'utf8'));
const cfg: GateConfig & {
  load: GateConfig['load'] & { healthRequests: number; healthConcurrency: number; runs: number; runConcurrency: number };
} = cfgFile;
const baseline: Baseline = JSON.parse(readFileSync(join(repo, 'regression', 'baseline.json'), 'utf8'));
const log = (m: string) => process.stdout.write(`[regression] ${m}\n`);
const sh = (cmd: string, env: Record<string, string> = {}) =>
  spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, ...env } });

async function pool<T>(n: number, concurrency: number, work: (i: number) => Promise<T>): Promise<T[]> {
  const out: T[] = new Array(n);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let i = next++; i < n; i = next++) out[i] = await work(i);
    }),
  );
  return out;
}

async function login(s: RegressionServer): Promise<{ status: number; cookie: string; setCookie: string; cacheControl: string }> {
  const res = await fetch(`${s.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: s.username, password: s.password }),
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  await res.arrayBuffer();
  return {
    status: res.status,
    cookie: setCookie.split(';')[0] ?? '',
    setCookie,
    cacheControl: res.headers.get('cache-control') ?? '',
  };
}

// ---------- security
function auditAdvisories(): Advisory[] {
  const r = sh('npm audit --omit=dev --json');
  const j = JSON.parse(r.stdout || '{}') as { vulnerabilities?: Record<string, { via: unknown[] }> };
  const out = new Map<string, Advisory>();
  for (const [pkg, v] of Object.entries(j.vulnerabilities ?? {}))
    for (const via of v.via)
      if (typeof via === 'object' && via && 'url' in via) {
        const x = via as { url: string; severity: Advisory['severity']; title: string; name?: string };
        const id = /GHSA-[\w-]+/.exec(x.url)?.[0] ?? x.url;
        out.set(id, { id, package: x.name ?? pkg, severity: x.severity, title: x.title.slice(0, 160) });
      }
  if (!j.vulnerabilities) throw new Error(`npm audit gave no report: ${(r.stderr || '').slice(0, 300)}`);
  return [...out.values()];
}

async function httpChecks(s: RegressionServer, cookie: { setCookie: string; cacheControl: string }): Promise<HttpCheck[]> {
  const checks: HttpCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const health = await fetch(`${s.url}/api/health`);
  await health.arrayBuffer();
  add('no X-Powered-By header', !health.headers.has('x-powered-by'), health.headers.get('x-powered-by') ?? 'absent');
  const session = await fetch(`${s.url}/api/auth/session`);
  await session.arrayBuffer();
  add(
    'auth responses are not cached',
    /no-store/.test(session.headers.get('cache-control') ?? '') && /no-store/.test(cookie.cacheControl),
    `${session.headers.get('cache-control')} / ${cookie.cacheControl}`,
  );
  const flags = ['HttpOnly', 'SameSite=Strict', 'Secure'].filter((f) => new RegExp(`;\\s*${f}`, 'i').test(cookie.setCookie));
  add('session cookie is HttpOnly, SameSite=Strict and Secure in production', flags.length === 3, flags.join(', ') || 'none');
  const anonStart = await fetch(`${s.url}/api/labs/lab-00/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"input":{}}',
  });
  const anonGet = await fetch(`${s.url}/api/runs/00000000-0000-0000-0000-000000000000/events`);
  await Promise.all([anonStart.arrayBuffer(), anonGet.arrayBuffer()]);
  add(
    'anonymous run routes answer 401',
    anonStart.status === 401 && anonGet.status === 401,
    `start ${anonStart.status}, events ${anonGet.status}`,
  );
  const cross = await fetch(`${s.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
    body: JSON.stringify({ username: s.username, password: s.password }),
  });
  add('cross-origin POST is refused', cross.status === 403, `status ${cross.status}`);
  await cross.arrayBuffer();
  const notFound = await fetch(`${s.url}/api/labs/lab-99x`);
  const badJson = await fetch(`${s.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  });
  const bodies = `${await notFound.text()} ${await badJson.text()}`;
  add(
    'error bodies carry no stack traces or paths',
    !/\n\s+at\s|node_modules|[A-Za-z]:\\|\/app\/|\/tmp\//.test(bodies) && notFound.status === 404 && badJson.status === 400,
    `${notFound.status}/${badJson.status}`,
  );
  return checks;
}

/** Last: it exhausts the login budget for this client for a minute. */
async function rateLimitCheck(s: RegressionServer): Promise<HttpCheck> {
  const statuses: number[] = [];
  for (let i = 0; i < 15; i++) {
    const r = await fetch(`${s.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'nobody', password: 'wrong-password-xx' }),
    });
    statuses.push(r.status);
    await r.arrayBuffer();
    if (r.status === 429) break;
  }
  return {
    name: 'repeated failed logins are rate limited (429)',
    ok: statuses.includes(429),
    detail: `statuses ${[...new Set(statuses)].join(',')} after ${statuses.length} attempts`,
  };
}

// ---------- load smoke
async function loadSmoke(s: RegressionServer, cookie: string): Promise<LoadMetrics> {
  let healthErrors = 0;
  const healthMs = await pool(cfg.load.healthRequests, cfg.load.healthConcurrency, async () => {
    const t = performance.now();
    try {
      const r = await fetch(`${s.url}/api/health`);
      await r.arrayBuffer();
      if (r.status >= 500) healthErrors++;
    } catch {
      healthErrors++;
    }
    return Math.round(performance.now() - t);
  });
  const def = (await (await fetch(`${s.url}/api/labs/lab-00`)).json()) as { exampleInput: Record<string, unknown> };
  let overloadRejections = 0;
  const runs = await pool(cfg.load.runs, cfg.load.runConcurrency, async () => {
    const t = performance.now();
    // Like a well-behaved client: a 429 (the server's concurrency limit) is retried with backoff; anything else is final.
    let started: Response;
    for (let attempt = 0; ; attempt++) {
      started = await fetch(`${s.url}/api/labs/lab-00/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ input: { ...def.exampleInput, delayMs: 50 }, mode: 'offline' }),
      });
      if (started.status !== 429 || attempt >= 40) break;
      overloadRejections++;
      await started.arrayBuffer();
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 150));
    }
    if (started.status !== 202) {
      await started.arrayBuffer();
      return { status: started.status, terminal: null, completeMs: null };
    }
    const { runId } = (await started.json()) as { runId: string };
    const ev = await fetch(`${s.url}/api/runs/${runId}/events`, { headers: { cookie, accept: 'text/event-stream' } });
    const reader = ev.body!.getReader();
    const dec = new TextDecoder();
    let text = '';
    let terminal: string | null = null;
    while (terminal === null) {
      const { value, done } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
      const m = /"type":"complete","status":"(\w+)"|"status":"(\w+)"[^}]*"type":"complete"/.exec(text);
      if (m) terminal = m[1] ?? m[2] ?? null;
    }
    await reader.cancel().catch(() => undefined);
    return { status: 202, terminal, completeMs: Math.round(performance.now() - t) };
  });
  return { healthMs, healthErrors, runs, overloadRejections };
}

// ---------- workflow recovery
function recoveryTests(): TestOutcome[] {
  const out = join(repo, 'test-results', 'regression-recovery.json');
  mkdirSync(join(repo, 'test-results'), { recursive: true });
  sh(`npx vitest run ${cfg.recovery.requiredFiles.join(' ')} --reporter=json --outputFile="${out}"`);
  const j = JSON.parse(readFileSync(out, 'utf8')) as {
    testResults: { name: string; assertionResults: { fullName: string; status: TestOutcome['status']; duration?: number }[] }[];
  };
  return j.testResults.flatMap((f) =>
    f.assertionResults.map((a) => ({
      file: f.name.replace(/\\/g, '/'),
      name: a.fullName,
      status: a.status,
      durationMs: a.duration ?? 0,
    })),
  );
}

// ---------- accessibility
function a11ySweep(): A11yPage[] {
  const dir = join(repo, 'test-results', 'a11y-sweep');
  rmSync(dir, { recursive: true, force: true });
  const r = sh('npx playwright test e2e/a11y-sweep.spec.ts --project=desktop --reporter=line', { A11Y_SWEEP: '1' });
  if (!existsSync(dir)) throw new Error(`the accessibility sweep wrote no results: ${(r.stdout + r.stderr).slice(-800)}`);
  return readdirSync(dir).flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as A11yPage[]);
}

async function main() {
  const commit = sh('git rev-parse --short=12 HEAD').stdout.trim();
  const dirty = sh('git status --porcelain').stdout.trim().length > 0;
  log(
    `commit ${commit}${dirty ? ' (uncommitted changes present)' : ''}${injected ? `, injecting a regression into ${injected}` : ''}`,
  );
  if (
    !existsSync(join(repo, 'apps', 'api', 'dist', 'server.js')) ||
    !existsSync(join(repo, 'apps', 'web', 'dist', 'index.html'))
  ) {
    log('building (apps/api/dist or apps/web/dist missing)');
    if (sh('npm run build').status !== 0) throw new Error('npm run build failed');
  }
  const results: (GateResult & { durationMs: number })[] = [];
  const m: Partial<Measurements> = {};
  const timed = async <T>(fn: () => Promise<T> | T) => {
    const t = Date.now();
    const v = await fn();
    return { v, ms: Date.now() - t };
  };
  const durations: Partial<Record<GateName, number>> = {};

  if (only.includes('security') || only.includes('load-smoke')) {
    // npm audit is synchronous. Run it before opening HTTP keep-alive connections, so a long registry
    // request cannot leave an idle socket stale while this process's event loop is blocked.
    const audited = only.includes('security') ? await timed(() => auditAdvisories()) : { v: [], ms: 0 };
    const server = await startRegressionServer(repo);
    try {
      const session = await login(server);
      if (session.status !== 200) throw new Error(`regression login failed (${session.status})`);
      if (only.includes('security')) {
        log('security: npm audit and HTTP checks');
        const { v, ms } = await timed(async () => ({ advisories: audited.v, http: await httpChecks(server, session) }));
        m.security = v;
        durations.security = ms + audited.ms;
      }
      if (only.includes('load-smoke')) {
        log(`load-smoke: ${cfg.load.healthRequests} health requests, ${cfg.load.runs} lab-00 runs`);
        const { v, ms } = await timed(() => loadSmoke(server, session.cookie));
        m.load = v;
        durations['load-smoke'] = ms;
      }
      if (m.security) m.security.http.push(await rateLimitCheck(server));
      const leaked = server.secrets.some((x) => server.logs().includes(x));
      if (m.security)
        m.security.http.push({
          name: 'server logs contain no secret values',
          ok: !leaked,
          detail: leaked ? 'a secret appeared in the logs' : 'checked',
        });
    } finally {
      await server.stop();
    }
  }
  if (only.includes('eval-regression') || only.includes('tracing')) {
    log('eval-regression and tracing: L57 golden, L58 experiment, L56 traced run (offline)');
    const { v, ms } = await timed(() =>
      measureEvalAndTracing(
        createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir(`regression-${Date.now().toString(36)}`) }),
      ),
    );
    m.eval = v.eval;
    m.tracing = v.tracing;
    durations['eval-regression'] = ms;
    durations.tracing = ms;
  }
  if (only.includes('workflow-recovery')) {
    log('workflow-recovery: real two-process restart tests (L32, L71)');
    const { v, ms } = await timed(() => recoveryTests());
    m.recovery = v;
    durations['workflow-recovery'] = ms;
  }
  if (only.includes('accessibility')) {
    log('accessibility: axe sweep of every lab (Learn + Run, desktop)');
    const { v, ms } = await timed(() => a11ySweep());
    m.a11y = v;
    durations.accessibility = ms;
  }

  const full = m as Measurements;
  const measured = injected ? inject(full, injected) : full;
  const today = new Date().toISOString().slice(0, 10);
  const evals: Record<GateName, () => GateResult> = {
    security: () => evaluateSecurity(measured.security, cfg.security, today),
    'load-smoke': () => evaluateLoad(measured.load, cfg.load),
    'eval-regression': () => evaluateEval(measured.eval, baseline.eval, cfg.eval),
    tracing: () => evaluateTracing(measured.tracing, baseline.tracing),
    'workflow-recovery': () => evaluateRecovery(measured.recovery, cfg.recovery),
    // Every available lab contributes two pages (Learn, Run): the minimum grows with the catalog.
    accessibility: () =>
      evaluateA11y(measured.a11y, {
        ...cfg.a11y,
        minPages: Math.max(cfg.a11y.minPages, 2 * catalog.labs.filter((l) => l.status === 'available').length),
      }),
  };
  for (const g of GATE_NAMES.filter((x) => only.includes(x))) {
    const r = evals[g]();
    results.push({ ...r, ...(g === injected ? { injected: true } : {}), durationMs: durations[g] ?? 0 });
    log(
      `${r.status === 'pass' ? 'PASS' : 'FAIL'}  ${g}${g === injected ? ' (injected)' : ''}: ${r.findings.slice(0, 3).join(' | ') || JSON.stringify(r.metrics)}`,
    );
  }

  const passed = results.every((r) => r.status === 'pass');
  const evidence = {
    commit,
    dirty,
    at: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    injected: injected ?? null,
    passed,
    gates: results,
  };
  const dir = join(repo, 'regression', 'evidence');
  mkdirSync(dir, { recursive: true });
  const file = injected
    ? join(dir, `injected-${injected}.json`)
    : only.length === GATE_NAMES.length
      ? join(dir, 'latest.json')
      : join(dir, 'partial.json');
  writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n');
  if (!injected && only.length === GATE_NAMES.length) writeFileSync(join(repo, 'regression', 'REPORT.md'), report(evidence));
  // The raw measurements of a clean, complete run: Lab 74 evaluates them with the learner's thresholds.
  const save = opt('save-measurements');
  if (save && !injected && only.length === GATE_NAMES.length)
    writeFileSync(
      join(repo, save),
      JSON.stringify({ commit, at: evidence.at, measurements: full, config: cfg, baseline }) + '\n',
    );
  log(
    `${results.filter((r) => r.status === 'pass').length}/${results.length} gates passed; evidence in ${file.slice(repo.length + 1).replace(/\\/g, '/')}`,
  );
  process.exitCode = passed ? 0 : 1;
}

function report(e: {
  commit: string;
  dirty: boolean;
  at: string;
  node: string;
  platform: string;
  gates: (GateResult & { durationMs: number })[];
  passed: boolean;
}): string {
  const rows = e.gates.map(
    (g) =>
      `| ${g.gate} | ${g.status === 'pass' ? '✅ pass' : '❌ fail'} | ${Object.entries(g.metrics)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join('<br>')} | ${(g.durationMs / 1000).toFixed(1)} s |`,
  );
  return [
    '# Regression report',
    '',
    `Generated by \`npm run regression\` (L74). Commit \`${e.commit}\`${e.dirty ? ' (with uncommitted changes)' : ''}, ${e.at}, Node ${e.node} on ${e.platform}. Result: **${e.passed ? 'all gates passed' : 'FAILED'}**.`,
    '',
    'Thresholds: `regression/gates.json`. Baselines: `regression/baseline.json`. Full evidence: `regression/evidence/latest.json`.',
    '',
    '| Gate | Result | Metrics | Time |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    ...e.gates
      .filter((g) => g.findings.length)
      .flatMap((g) => [`## ${g.gate} findings`, '', ...g.findings.map((f) => `- ${f}`), '']),
  ].join('\n');
}

main().catch((e) => {
  process.stderr.write(`[regression] FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
