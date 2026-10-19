import { afterAll, describe, expect, it } from 'vitest';
import { QualityDashboardSchema } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { assembleDashboard, failedFromReason, storedSpansToTrace, type StoredRun } from './dashboard.js';
import { lab60Definition } from './definition.js';
import { lab60, type Lab60Output } from './run.js';

// One store for the file: the runs accumulate in order, like a real history.
const runner = new LabRunner({
  registry: new LabRegistry([lab60]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab60') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab60Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-60', { input: { ...lab60Definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return result;
}

const stored = (id: string, outcomes: Record<string, boolean>, durations: number[]): StoredRun => ({
  experimentId: id,
  name: id,
  configId: id,
  datasetVersion: 5,
  startedAt: '2026-10-19T10:00:00.000Z',
  items: Object.entries(outcomes).map(([externalId, passed], i) => ({
    itemId: externalId,
    externalId,
    title: externalId,
    passed,
    failedAssertions: passed ? [] : ['Mentions “x” (not found)'],
    durationMs: durations[i] ?? null,
    traceId: null,
    error: null,
  })),
});

describe('lab-60 dashboard (unit)', () => {
  it('derives KPIs, regressions and percentiles; one run needs a second for regressions', () => {
    const a = stored('a', { s1: true, s2: true, s3: false, s4: true }, [10, 40, 20, 30]);
    const b = stored('b', { s1: false, s2: true, s3: true, s4: false }, [5, 5, 5, 100]);
    const two = assembleDashboard([a, b], 10, true, {});
    expect(two.kpis).toEqual({
      runs: 2,
      latestPassRate: 0.5,
      previousPassRate: 0.75,
      passRateDelta: -0.25,
      latestP50: 5,
      latestP95: 100,
      regressions: 2,
    });
    expect(two.regressions.items.map((r) => r.externalId)).toEqual(['s1', 's4']);
    expect(two.runs[0]!.latency).toEqual({ p50: 20, p95: 40, p99: 40 });
    const one = assembleDashboard([a], 10, true, {});
    expect(one.regressions).toEqual({ needsTwoRuns: true, items: [] });
    expect(one.kpis.passRateDelta).toBeNull();
  });
  it('produces empty states without numbers', () => {
    const none = assembleDashboard([], 10, true, {});
    expect(none.empty).toMatchObject({ isEmpty: true, reason: 'no-runs' });
    expect(Object.values(none.kpis).filter((v) => v !== null)).toEqual([0]);
    expect(assembleDashboard([], 10, false, {}).empty.reason).toBe('no-dataset');
    expect(QualityDashboardSchema.safeParse(none).success).toBe(true);
  });
  it('reads failed assertions from a reason and maps stored spans without stacks', () => {
    expect(failedFromReason('✓ Mentions “a” (found); ✗ Mentions “b” (not found)')).toEqual(['Mentions “b” (not found)']);
    const spans = storedSpansToTrace([
      {
        spanId: 'r',
        parentSpanId: null,
        traceId: 't',
        name: 'agent run',
        spanType: 'agent_run',
        startedAt: '2026-10-19T10:00:00.000Z',
        endedAt: '2026-10-19T10:00:00.050Z',
      },
      {
        spanId: 'c',
        parentSpanId: 'r',
        traceId: 't',
        name: 'tool',
        spanType: 'tool_call',
        startedAt: '2026-10-19T10:00:00.010Z',
        endedAt: '2026-10-19T10:00:00.020Z',
        error: { message: 'boom\n    at x (/abs/path.ts:1:1)' },
      },
    ]);
    expect(spans.map((s) => [s.id, s.parentId, s.type, s.startMs, s.durationMs, s.status, s.error])).toEqual([
      ['r', null, 'agent_run', 0, 50, 'ok', null],
      ['c', 'r', 'tool_call', 10, 10, 'error', 'boom'],
    ]);
  });
});

describe('lab-60 Quality dashboard (DoD)', () => {
  it('shows a usable empty state before any data', async () => {
    const { output, validation } = await run({ store: 'empty-demo', action: 'show-only' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.dashboard.empty).toMatchObject({ isEmpty: true, reason: 'no-dataset' });
    expect(output.recorded).toBeNull();
  });

  it('derives the metrics from stored runs, with regressions and stored trace links', async () => {
    const first = await run();
    expect(first.validation.passed, JSON.stringify(first.validation.checks)).toBe(true);
    expect(first.output.dashboard.regressions.needsTwoRuns).toBe(true);
    expect(first.output.dashboard.kpis.latestPassRate).toBe(0.75);

    const second = await run({ configId: 'no-tools' });
    expect(second.validation.passed, JSON.stringify(second.validation.checks)).toBe(true);
    const d = second.output.dashboard;
    expect(d.kpis).toMatchObject({ runs: 2, latestPassRate: 0.25, previousPassRate: 0.75, passRateDelta: -0.5, regressions: 2 });
    expect(d.regressions.items.map((r) => r.externalId)).toEqual(['tool-validation', 'workflow-steps']);
    for (const r of d.regressions.items)
      expect(d.traces[r.traceId!]!.some((s) => s.parentId === null && s.type === 'agent_run')).toBe(true);

    // show-only reads the same history without recording anything.
    const shown = await run({ action: 'show-only' });
    expect(shown.output.recorded).toBeNull();
    expect(shown.output.dashboard.kpis.runs).toBe(2);
  });

  it('flags a dashboard that shows a number with no data behind it', () => {
    const empty = assembleDashboard([], 10, false, {});
    const tampered = {
      action: 'show-only',
      store: 'empty-demo',
      recorded: null,
      previousOutcomes: null,
      rebuildIdentical: true,
      dashboard: { ...empty, kpis: { ...empty.kpis, latestPassRate: 0 } },
    };
    const v = lab60.validate!(
      tampered as never,
      { ...lab60Definition.exampleInput, store: 'empty-demo', action: 'show-only' } as never,
      {
        events: [],
        mode: 'offline',
      },
    ) as Result['validation'];
    expect(v.checks.find((c) => c.id === 'empty-state-usable')?.passed).toBe(false);
  });
});
