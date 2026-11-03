import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import type { EvalReport, TraceTree } from '@mlp/contracts';
import type { LabServices } from '../services.js';
import { runGolden } from '../lab-57/golden.js';
import { createRubricScorer } from '../lab-57/scorer.js';
import { lab56 } from '../lab-56/run.js';
import { lab56Definition } from '../lab-56/definition.js';
import { lab58 } from '../lab-58/run.js';
import { lab58Definition } from '../lab-58/definition.js';
import type { EvalMetrics, SpanLike } from './gates.js';

/**
 * Fresh, in-process measurements for the eval-regression and tracing gates (offline, deterministic, free).
 * They run the real L57 scorer, the real L58 Mastra experiment and the real L56 traced pipeline.
 */
export async function measureEvalAndTracing(services: LabServices): Promise<{ eval: EvalMetrics; tracing: SpanLike[] }> {
  const golden = (await runGolden(createRubricScorer())).map((g) => ({ name: g.name, ok: g.ok, detail: g.detail }));
  const runner = new LabRunner<LabServices>({
    registry: new LabRegistry([lab56, lab58] as never),
    services,
    liveEnabled: false,
  });
  try {
    const out = async (labId: string, input: unknown) => {
      const r = runner.start(labId, { input, mode: 'offline' });
      const snap = await runner.waitFor(r.runId);
      if (snap.status !== 'succeeded') throw new Error(`${labId} ended ${snap.status}`);
      const res = runner.events(r.runId).find((e) => e.type === 'result');
      return (res?.type === 'result' ? res.output : undefined) as Record<string, unknown>;
    };
    const report = (await out('lab-58', lab58Definition.exampleInput)).evalReport as EvalReport;
    const tree = (await out('lab-56', { ...lab56Definition.exampleInput, view: 'full' })).traceTree as TraceTree;
    return {
      eval: {
        golden,
        // Keyed by externalId (stable across fresh stores); itemId is a UUID generated per store.
        experiment: {
          passRate: report.summary.passRate,
          items: Object.fromEntries(report.items.map((i) => [i.externalId ?? i.title ?? i.input.slice(0, 60), i.passed])),
        },
      },
      tracing: tree.spans.map((s) => ({
        id: s.id,
        parentId: s.parentId,
        traceId: s.traceId,
        name: s.name,
        type: s.type,
        attributes: s.attributes,
        error: s.error,
      })),
    };
  } finally {
    await runner.dispose();
  }
}
