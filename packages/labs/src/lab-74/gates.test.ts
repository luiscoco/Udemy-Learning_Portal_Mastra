import { describe, expect, it } from 'vitest';
import {
  evaluateA11y,
  evaluateAll,
  evaluateEval,
  evaluateLoad,
  evaluateRecovery,
  evaluateSecurity,
  evaluateTracing,
  GATE_NAMES,
  inject,
  percentile,
  spanSignature,
  type GateConfig,
  type Measurements,
  type SpanLike,
} from './gates.js';

const spans: SpanLike[] = [
  { id: 'a', parentId: null, traceId: 't', name: "workflow run: 'p'", type: 'workflow_run' },
  { id: 'b', parentId: 'a', traceId: 't', name: "workflow step: 's'", type: 'workflow_step' },
  { id: 'c', parentId: 'b', traceId: 't', name: "agent run: 'w'", type: 'agent_run' },
];
const cfg: GateConfig = {
  security: {
    failOn: ['high', 'critical'],
    allowlist: [{ id: 'GHSA-ok', package: 'p', reason: 'reviewed', expires: '2026-12-31' }],
  },
  load: { healthP95Ms: 100, runP95Ms: 5000 },
  eval: { passRateTolerance: 0 },
  recovery: { requiredFiles: ['a.restart.test.ts'] },
  a11y: { maxSerious: 0, maxCritical: 0, minPages: 2 },
};
const healthy: Measurements = {
  security: {
    advisories: [{ id: 'GHSA-ok', package: 'p', severity: 'high', title: 't' }],
    http: [{ name: 'x', ok: true, detail: '' }],
  },
  load: {
    healthMs: Array.from({ length: 100 }, (_, i) => i % 20),
    healthErrors: 0,
    runs: [{ status: 202, terminal: 'succeeded', completeMs: 300 }],
    overloadRejections: 5,
  },
  eval: { golden: [{ name: 'g', ok: true, detail: '' }], experiment: { passRate: 0.75, items: { a: true, b: false } } },
  tracing: spans,
  recovery: [{ file: 'x/a.restart.test.ts', name: 'restart', status: 'passed', durationMs: 5 }],
  a11y: [
    { url: '/a', violations: [] },
    { url: '/b', violations: [{ id: 'region', impact: 'moderate', nodes: 1 }] },
  ],
};
const baseline = {
  eval: { goldenCount: 1, experiment: { passRate: 0.75, items: { a: true, b: false } } },
  tracing: spanSignature(spans),
};
const TODAY = '2026-11-03';

describe('gates', () => {
  it('percentile uses the nearest rank', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([], 95)).toBe(0);
  });

  it('every gate passes on healthy measurements', () => {
    expect(evaluateAll(healthy, cfg, baseline, TODAY).map((g) => g.status)).toEqual(GATE_NAMES.map(() => 'pass'));
  });

  it.each(GATE_NAMES)('an injected %s regression fails exactly that gate', (gate) => {
    const r = evaluateAll(inject(healthy, gate), cfg, baseline, TODAY);
    expect(r.filter((g) => g.status === 'fail').map((g) => g.gate)).toEqual([gate]);
    expect(r.find((g) => g.gate === gate)!.findings.length).toBeGreaterThan(0);
  });

  it('security: unlisted and expired advisories fail; moderate ones do not', () => {
    const m = {
      ...healthy.security,
      advisories: [...healthy.security.advisories, { id: 'GHSA-mod', package: 'q', severity: 'moderate' as const, title: 'm' }],
    };
    expect(evaluateSecurity(m, cfg.security, TODAY).status).toBe('pass');
    const expired = evaluateSecurity(healthy.security, cfg.security, '2027-01-01');
    expect(expired.findings[0]).toContain('expired on 2026-12-31');
    const http = evaluateSecurity(
      { ...healthy.security, http: [{ name: 'cookie flags', ok: false, detail: 'HttpOnly' }] },
      cfg.security,
      TODAY,
    );
    expect(http.findings).toEqual(['HTTP check "cookie flags" failed: HttpOnly']);
  });

  it('load: 429 retries are fine; 5xx, lost runs and slow p95 fail', () => {
    expect(evaluateLoad(healthy.load, cfg.load).metrics).toMatchObject({ overloadRejections429: 5, runsCompleted: 1 });
    const bad = evaluateLoad(
      {
        ...healthy.load,
        healthErrors: 2,
        runs: [
          { status: 500, terminal: null, completeMs: null },
          { status: 202, terminal: 'failed', completeMs: 9000 },
        ],
      },
      cfg.load,
    );
    expect(bad.findings.join(' | ')).toMatch(
      /2 health request\(s\) failed.*1 run\(s\) never started.*1 accepted run\(s\) did not succeed.*p95 9000 ms/,
    );
  });

  it('eval: a baseline-passing item that fails now is a regression even at the same pass rate', () => {
    const swapped = { ...healthy.eval, experiment: { passRate: 0.75, items: { a: false, b: true } } };
    expect(evaluateEval(swapped, baseline.eval, cfg.eval).findings).toEqual([
      'dataset item a passed in the baseline and fails now',
    ]);
  });

  it('tracing: signatures ignore ids and order; stacks and paths fail', () => {
    const reordered = [...spans].reverse().map((s) => ({ ...s, id: `${s.id}2`, parentId: s.parentId ? `${s.parentId}2` : null }));
    expect(evaluateTracing(reordered, baseline.tracing).status).toBe('pass');
    const leaky = spans.map((s, i) => (i === 2 ? { ...s, error: 'boom\n    at f (C:\\app\\x.js:1:2)' } : s));
    expect(evaluateTracing(leaky, baseline.tracing).findings[0]).toContain('stack trace or an absolute path');
    const twoRoots = [...spans, { id: 'z', parentId: null, traceId: 't2', name: 'other', type: 'agent_run' }];
    expect(evaluateTracing(twoRoots, baseline.tracing).findings.slice(0, 2)).toEqual([
      '2 root spans (expected exactly 1)',
      '2 trace ids (expected 1)',
    ]);
  });

  it('recovery: a missing required test file fails', () => {
    expect(evaluateRecovery([], cfg.recovery).findings).toEqual(['no test ran from a.restart.test.ts']);
  });

  it('accessibility: too few pages or a serious violation fails', () => {
    expect(evaluateA11y([{ url: '/a', violations: [] }], cfg.a11y).findings).toEqual([
      'only 1 page(s) checked (expected at least 2)',
    ]);
    expect(evaluateA11y(healthy.a11y, { ...cfg.a11y }).metrics).toMatchObject({ moderate: 1, serious: 0 });
  });
});
