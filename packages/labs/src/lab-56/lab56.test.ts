import { afterAll, describe, expect, it } from 'vitest';
import type { TraceSpan } from '@mlp/contracts';
import { TraceTreeSchema } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { analyseCoherence } from './coherence.js';
import { analyseLifecycle } from './collector.js';
import { lab56Definition } from './definition.js';
import { lab56, type Lab56Output } from './run.js';
import { viewOf } from './tree.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab56]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab56Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-56', { input: { ...lab56Definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return { ...result, events };
}
const span = (
  id: string,
  parentId: string | null,
  type: string,
  entity: string | null,
  startMs = 0,
  durationMs = 10,
): TraceSpan => ({
  id,
  parentId,
  traceId: 't',
  name: id,
  type,
  entity,
  startMs,
  durationMs,
  status: 'ok',
  error: null,
  attributes: {},
  correlationId: null,
});

describe('lab-56 trace analysis (unit)', () => {
  it('re-parents hidden spans to the nearest shown ancestor', () => {
    const spans = [span('r', null, 'workflow_run', 'wf'), span('g', 'r', 'model_step', null), span('t', 'g', 'tool_call', 'x')];
    expect(viewOf(spans, 'summary')).toEqual({ spans: [spans[0], { ...spans[2], parentId: 'r' }], hidden: 1 });
    expect(viewOf(spans, 'full').hidden).toBe(0);
  });
  it('finds orphans, windows outside the parent, misplaced steps, stray tools and untraced agents', () => {
    const spans = [
      span('r', null, 'workflow_run', 'wf', 0, 100),
      span('s', 'r', 'workflow_step', 'research', 10, 50),
      span('a', 's', 'agent_run', 'researcher', 12, 80), // ends after its parent
      span('bad', 'a', 'workflow_step', 'review', 15, 5),
      span('o', 'gone', 'tool_call', 'search', 20, 1),
    ];
    const c = analyseCoherence(spans, [
      { stepId: 'research', agentId: 'researcher', registered: true },
      { stepId: 'review', agentId: 'reviewer', registered: false },
    ]);
    expect(c.orphans.map((s) => s.id)).toEqual(['o']);
    expect(c.outsideParent.map((s) => s.id)).toEqual(['a']);
    expect(c.misplacedSteps.map((s) => s.id)).toEqual(['bad']);
    expect(c.strayTools.map((s) => s.id)).toEqual(['o']);
    expect(c.agentCalls.map((x) => x.spanId)).toEqual(['a', null]);
  });
  it('reports spans that never ended or ended twice', () => {
    const s = (id: string, isEvent = false) => ({ id, isEvent }) as never;
    const l = analyseLifecycle([
      { type: 'span_started', exportedSpan: s('a') },
      { type: 'span_started', exportedSpan: s('b') },
      { type: 'span_ended', exportedSpan: s('b') },
      { type: 'span_ended', exportedSpan: s('b') },
      { type: 'span_ended', exportedSpan: s('e', true) },
    ] as never);
    expect([l.missingEnd, l.endedTwice, l.endedWithoutStart]).toEqual([['a'], ['b'], []]);
  });
});

describe('lab-56 Trace events (DoD)', () => {
  it('parent-child spans and correlations remain coherent', async () => {
    const { output, validation, events } = await run();
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output).toMatchObject(lab56Definition.expectedOutput.example);
    expect(TraceTreeSchema.safeParse(output.traceTree).success).toBe(true);
    const byId = new Map(output.traceTree.spans.map((s) => [s.id, s]));
    const parentType = (type: string, entity: string) => {
      const s = output.traceTree.spans.find((x) => x.type === type && x.entity === entity)!;
      return byId.get(s.parentId!)?.type;
    };
    expect(parentType('workflow_step', 'research')).toBe('workflow_parallel');
    expect(parentType('agent_run', 'writer')).toBe('workflow_step');
    expect(parentType('tool_call', 'search_sources')).toBe('model_generation'); // summary view: model_step folded
    expect(output.spans.every((s) => s.correlationId === output.traceTree.correlation.correlationId)).toBe(true);
    expect(events.some((e) => e.type === 'log' && String(e.message).startsWith('span ended: agent_run'))).toBe(true);
  });

  it('a tool error stays on its tool span, without a stack', async () => {
    const { output, validation } = await run({ fault: 'tool-error' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    const errors = output.spans.filter((s) => s.status === 'error');
    expect(errors.map((s) => [s.type, s.error])).toEqual([['tool_call', 'search backend unavailable (simulated 503)']]);
  });

  it('an unregistered agent is reported as untraced work', async () => {
    const { output, validation } = await run({ fault: 'detached-agent' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.spans.some((s) => s.type === 'agent_run' && s.entity === 'reviewer')).toBe(false);
    expect(output.traceTree.findings[0]).toMatch(/^Untraced work: step review called agent reviewer/);
  });

  it('flags a span tree with an orphan', async () => {
    const { output } = await run();
    const tampered = { ...output, coherence: { ...output.coherence, orphans: ['x'] } };
    const v = lab56.validate!(tampered, lab56Definition.exampleInput as never, {
      events: [],
      mode: 'offline',
    }) as Result['validation'];
    expect(v.checks.find((c) => c.id === 'parent-child-coherent')?.passed).toBe(false);
  });
});
