/**
 * Release gates (L74): pure evaluators over measured metrics. The regression script measures for real and calls
 * these; the lab calls them on recorded evidence. A gate never measures anything itself, so it is easy to test with
 * both healthy and regressed inputs.
 */
export type GateName = 'security' | 'load-smoke' | 'eval-regression' | 'tracing' | 'workflow-recovery' | 'accessibility';
export const GATE_NAMES: GateName[] = [
  'security',
  'load-smoke',
  'eval-regression',
  'tracing',
  'workflow-recovery',
  'accessibility',
];

export interface GateResult {
  gate: GateName;
  status: 'pass' | 'fail';
  metrics: Record<string, unknown>;
  thresholds: Record<string, unknown>;
  findings: string[];
  injected?: boolean;
}

const result = (
  gate: GateName,
  findings: string[],
  metrics: Record<string, unknown>,
  thresholds: Record<string, unknown>,
): GateResult => ({
  gate,
  status: findings.length === 0 ? 'pass' : 'fail',
  metrics,
  thresholds,
  findings,
});

/** Nearest-rank percentile (p in 0..100) of a list of numbers; 0 for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1]!;
}

// ---------- security

export interface Advisory {
  id: string; // GHSA id
  package: string;
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  title: string;
}
export interface AllowlistEntry {
  id: string;
  package: string;
  reason: string;
  expires: string; // YYYY-MM-DD
}
export interface HttpCheck {
  name: string;
  ok: boolean;
  detail: string;
}
export interface SecurityThresholds {
  failOn: ('high' | 'critical' | 'moderate')[];
  allowlist: AllowlistEntry[];
}

export function evaluateSecurity(
  m: { advisories: Advisory[]; http: HttpCheck[] },
  t: SecurityThresholds,
  today = new Date().toISOString().slice(0, 10),
): GateResult {
  const findings: string[] = [];
  const allowed = new Map(t.allowlist.map((a) => [a.id, a]));
  for (const a of m.advisories) {
    if (!t.failOn.includes(a.severity as never)) continue;
    const entry = allowed.get(a.id);
    if (!entry) findings.push(`${a.severity} advisory ${a.id} in ${a.package} is not allowlisted: ${a.title}`);
    else if (entry.expires < today)
      findings.push(`allowlist entry ${a.id} (${a.package}) expired on ${entry.expires}: upgrade or re-review`);
  }
  for (const c of m.http) if (!c.ok) findings.push(`HTTP check "${c.name}" failed: ${c.detail}`);
  const bySeverity = m.advisories.reduce<Record<string, number>>(
    (acc, a) => ({ ...acc, [a.severity]: (acc[a.severity] ?? 0) + 1 }),
    {},
  );
  return result(
    'security',
    findings,
    {
      advisories: bySeverity,
      allowlisted: m.advisories.filter((a) => allowed.has(a.id)).length,
      httpChecks: `${m.http.filter((c) => c.ok).length}/${m.http.length}`,
    },
    { failOn: t.failOn, allowlist: t.allowlist.map((a) => `${a.id} until ${a.expires}`) },
  );
}

// ---------- load smoke

export interface LoadMetrics {
  healthMs: number[];
  healthErrors: number; // 5xx or network errors
  /** Final outcome per run, after the client retried 429 answers with backoff. */
  runs: { status: number; terminal: string | null; completeMs: number | null }[];
  /** 429 answers seen (the server's concurrency limit working as designed, never a failure by itself). */
  overloadRejections?: number;
}
export interface LoadThresholds {
  healthP95Ms: number;
  runP95Ms: number;
}

export function evaluateLoad(m: LoadMetrics, t: LoadThresholds): GateResult {
  const findings: string[] = [];
  const hp95 = percentile(m.healthMs, 95);
  const accepted = m.runs.filter((r) => r.status === 202);
  const rejected = m.runs.filter((r) => r.status !== 202);
  const completes = accepted.map((r) => r.completeMs).filter((x): x is number => x !== null);
  const rp95 = percentile(completes, 95);
  if (hp95 > t.healthP95Ms) findings.push(`health p95 ${hp95} ms > ${t.healthP95Ms} ms`);
  if (m.healthErrors > 0) findings.push(`${m.healthErrors} health request(s) failed`);
  if (rejected.length)
    findings.push(
      `${rejected.length} run(s) never started (final status ${[...new Set(rejected.map((r) => r.status))].join(', ')}; only 202, or 429 then a retry, is acceptable)`,
    );
  const failed = accepted.filter((r) => r.terminal !== 'succeeded');
  if (failed.length)
    findings.push(`${failed.length} accepted run(s) did not succeed (${[...new Set(failed.map((r) => r.terminal))].join(', ')})`);
  if (accepted.length === 0) findings.push('no run was accepted');
  if (rp95 > t.runP95Ms) findings.push(`run completion p95 ${rp95} ms > ${t.runP95Ms} ms`);
  return result(
    'load-smoke',
    findings,
    {
      healthRequests: m.healthMs.length,
      healthP50Ms: percentile(m.healthMs, 50),
      healthP95Ms: hp95,
      runsStarted: m.runs.length,
      runsCompleted: accepted.filter((r) => r.terminal === 'succeeded').length,
      overloadRejections429: m.overloadRejections ?? 0,
      runP95Ms: rp95,
    },
    { ...t },
  );
}

// ---------- eval regression

export interface EvalMetrics {
  golden: { name: string; ok: boolean; detail: string }[];
  experiment: { passRate: number; items: Record<string, boolean> };
}
export interface EvalBaseline {
  goldenCount: number;
  experiment: { passRate: number; items: Record<string, boolean> };
}

export function evaluateEval(m: EvalMetrics, b: EvalBaseline, t: { passRateTolerance: number }): GateResult {
  const findings: string[] = [];
  for (const g of m.golden) if (!g.ok) findings.push(`golden fixture "${g.name}" regressed: ${g.detail}`);
  if (m.golden.length < b.goldenCount) findings.push(`only ${m.golden.length} of ${b.goldenCount} golden fixtures ran`);
  if (m.experiment.passRate < b.experiment.passRate - t.passRateTolerance)
    findings.push(`experiment pass rate ${m.experiment.passRate} < baseline ${b.experiment.passRate} − ${t.passRateTolerance}`);
  for (const [item, passed] of Object.entries(b.experiment.items))
    if (passed && m.experiment.items[item] === false) findings.push(`dataset item ${item} passed in the baseline and fails now`);
  return result(
    'eval-regression',
    findings,
    { golden: `${m.golden.filter((g) => g.ok).length}/${m.golden.length}`, passRate: m.experiment.passRate },
    { goldenCount: b.goldenCount, baselinePassRate: b.experiment.passRate, ...t },
  );
}

// ---------- tracing

export interface SpanLike {
  id: string;
  parentId: string | null;
  traceId: string;
  name: string;
  type: string;
  attributes?: Record<string, unknown>;
  error?: string | null;
}

/**
 * A run-independent shape of a trace: each span as "depth:type:name", in a stable order (ids, times and
 * durations differ between runs; names that embed ids would make the baseline useless, so ids are normalized).
 */
export function spanSignature(spans: readonly SpanLike[]): string[] {
  const byId = new Map(spans.map((s) => [s.id, s]));
  const depth = (s: SpanLike): number => (s.parentId && byId.has(s.parentId) ? 1 + depth(byId.get(s.parentId)!) : 0);
  const norm = (n: string) => n.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>');
  return spans.map((s) => `${depth(s)}:${s.type}:${norm(s.name)}`).sort();
}

const ABS_PATH = /([A-Za-z]:\\|\/(home|Users|app|tmp)\/)[^\s"']+/;
const STACK = /\n\s+at\s.+\(.+:\d+:\d+\)/;

export function evaluateTracing(spans: readonly SpanLike[], baseline: string[]): GateResult {
  const findings: string[] = [];
  const sig = spanSignature(spans);
  const roots = spans.filter((s) => !s.parentId || !spans.some((p) => p.id === s.parentId));
  const traces = new Set(spans.map((s) => s.traceId));
  if (roots.length !== 1) findings.push(`${roots.length} root spans (expected exactly 1)`);
  if (traces.size !== 1) findings.push(`${traces.size} trace ids (expected 1)`);
  const missing = baseline.filter((x) => !sig.includes(x));
  const extra = sig.filter((x) => !baseline.includes(x));
  if (missing.length || extra.length || sig.length !== baseline.length)
    findings.push(
      `span signature changed: ${missing.length} missing (${missing.slice(0, 3).join('; ')}), ${extra.length} new (${extra.slice(0, 3).join('; ')})`,
    );
  for (const s of spans) {
    const text = JSON.stringify({ a: s.attributes ?? {}, e: s.error ?? '' });
    if (STACK.test(text) || ABS_PATH.test(text)) findings.push(`span "${s.name}" exports a stack trace or an absolute path`);
  }
  return result(
    'tracing',
    findings,
    { spans: spans.length, roots: roots.length, traceIds: traces.size },
    { baselineSpans: baseline.length },
  );
}

// ---------- workflow recovery

export interface TestOutcome {
  file: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo';
  durationMs: number;
}

export function evaluateRecovery(tests: readonly TestOutcome[], t: { requiredFiles: string[] }): GateResult {
  const findings: string[] = [];
  for (const f of t.requiredFiles)
    if (!tests.some((x) => x.file.replace(/\\/g, '/').endsWith(f))) findings.push(`no test ran from ${f}`);
  for (const x of tests) if (x.status !== 'passed') findings.push(`${x.name}: ${x.status}`);
  return result(
    'workflow-recovery',
    findings,
    {
      tests: tests.length,
      passed: tests.filter((x) => x.status === 'passed').length,
      durationsMs: tests.map((x) => Math.round(x.durationMs)),
    },
    { ...t },
  );
}

// ---------- accessibility

export interface A11yPage {
  url: string;
  violations: { id: string; impact: string | null; nodes: number }[];
}

export function evaluateA11y(
  pages: readonly A11yPage[],
  t: { maxSerious: number; maxCritical: number; minPages: number },
): GateResult {
  const count = (impact: string) => pages.reduce((n, p) => n + p.violations.filter((v) => v.impact === impact).length, 0);
  const serious = count('serious');
  const critical = count('critical');
  const findings: string[] = [];
  if (pages.length < t.minPages) findings.push(`only ${pages.length} page(s) checked (expected at least ${t.minPages})`);
  if (serious > t.maxSerious || critical > t.maxCritical)
    for (const p of pages)
      for (const v of p.violations)
        if (v.impact === 'serious' || v.impact === 'critical')
          findings.push(`${v.impact} ${v.id} on ${p.url} (${v.nodes} node(s))`);
  if (serious > t.maxSerious) findings.push(`${serious} serious violation(s) > ${t.maxSerious}`);
  if (critical > t.maxCritical) findings.push(`${critical} critical violation(s) > ${t.maxCritical}`);
  return result(
    'accessibility',
    findings.slice(0, 50),
    { pages: pages.length, serious, critical, moderate: count('moderate'), minor: count('minor') },
    { ...t },
  );
}

// ---------- injection (proves each gate fails on a regression)

export interface Measurements {
  security: { advisories: Advisory[]; http: HttpCheck[] };
  load: LoadMetrics;
  eval: EvalMetrics;
  tracing: SpanLike[];
  recovery: TestOutcome[];
  a11y: A11yPage[];
}

/** Returns a copy of the measurements with a realistic regression applied to one gate. */
export function inject(m: Measurements, gate: GateName): Measurements {
  const c = structuredClone(m);
  switch (gate) {
    case 'security':
      c.security.advisories.push({
        id: 'GHSA-inje-cted-0000',
        package: 'injected-package',
        severity: 'high',
        title: 'Injected regression: unreviewed high advisory',
      });
      break;
    case 'load-smoke':
      c.load.healthMs = c.load.healthMs.map((x) => x + 400);
      break;
    case 'eval-regression':
      if (c.eval.golden[0]) c.eval.golden[0] = { ...c.eval.golden[0], ok: false, detail: 'injected: score changed' };
      break;
    case 'tracing':
      if (c.tracing[1]) c.tracing[1] = { ...c.tracing[1], name: `${c.tracing[1].name} (renamed)` };
      break;
    case 'workflow-recovery':
      c.recovery.push({
        file: 'injected.restart.test.ts',
        name: 'injected: resume re-ran a side effect',
        status: 'failed',
        durationMs: 0,
      });
      break;
    case 'accessibility':
      c.a11y.push({ url: '/labs/injected', violations: [{ id: 'color-contrast', impact: 'serious', nodes: 1 }] });
      break;
  }
  return c;
}

export interface GateConfig {
  security: SecurityThresholds;
  load: LoadThresholds;
  eval: { passRateTolerance: number };
  recovery: { requiredFiles: string[] };
  a11y: { maxSerious: number; maxCritical: number; minPages: number };
}
export interface Baseline {
  eval: EvalBaseline;
  tracing: string[];
}

export function evaluateAll(m: Measurements, cfg: GateConfig, base: Baseline, today?: string): GateResult[] {
  return [
    evaluateSecurity(m.security, cfg.security, today),
    evaluateLoad(m.load, cfg.load),
    evaluateEval(m.eval, base.eval, cfg.eval),
    evaluateTracing(m.tracing, base.tracing),
    evaluateRecovery(m.recovery, cfg.recovery),
    evaluateA11y(m.a11y, cfg.a11y),
  ];
}
