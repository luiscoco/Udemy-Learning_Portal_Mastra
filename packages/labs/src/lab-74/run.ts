import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { labSourceDir } from '../paths.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamAgent } from '../shared/tool-stream.js';
import { researcherScript, searchTool } from '../lab-56/pipeline.js';
import { ANSWER_INSTRUCTIONS } from '../lab-57/run.js';
import { RUBRICS } from '../lab-57/rubrics.js';
import { createRubricScorer, scoreAnswer, toScoreCard } from '../lab-57/scorer.js';
import { evaluateAll, GATE_NAMES, inject, type Baseline, type GateConfig, type GateResult, type Measurements } from './gates.js';
import { measureEvalAndTracing } from './measure.js';
import { lab74Definition } from './definition.js';

export const Lab74InputSchema = z.object({
  healthP95Ms: z.coerce.number().int().min(10).max(1_000),
  runP95Ms: z.coerce.number().int().min(500).max(20_000),
  maxSerious: z.coerce.number().int().min(0).max(5),
  inject: z.enum(['none', ...GATE_NAMES] as [string, ...string[]]),
  measureFresh: z.boolean().default(true),
  liveThreshold: z.coerce.number().min(0).max(1).default(0.7),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab74Input = z.infer<typeof Lab74InputSchema>;

/** A real regression run's raw measurements, recorded by `npm run regression -- --save-measurements`. */
export interface RecordedEvidence {
  commit: string;
  at: string;
  measurements: Measurements;
  config: GateConfig;
  baseline: Baseline;
}

export interface Lab74Output {
  evidence: { commit: string; at: string };
  fresh: boolean;
  injected: string | null;
  gates: GateResult[];
  /** The same evaluation without the injection, to show that only the injected gate changed. */
  withoutInjection: { gate: string; status: string }[];
  liveAnswer:
    | { score: number | null; threshold: number; passed: boolean; missing: string[]; modelId: string; simulated: boolean }
    | { skipped: string };
}

export function loadRecorded(): RecordedEvidence {
  return JSON.parse(readFileSync(join(labSourceDir('lab-74'), 'evidence-sample.json'), 'utf8')) as RecordedEvidence;
}

export const lab74: LabImplementation<Lab74Input, Lab74Output, LabServices> = {
  definition: lab74Definition as LabDefinition,
  inputSchema: Lab74InputSchema,

  async run(ctx, input) {
    const step = (stepId: string, status: 'running' | 'success' | 'failed', output?: unknown) =>
      ctx.emit({ type: 'workflow-step', stepId, status, ...(output === undefined ? {} : { output }) });
    step('load-evidence', 'running');
    const rec = loadRecorded();
    step('load-evidence', 'success', { commit: rec.commit, at: rec.at });

    let measurements = rec.measurements;
    if (input.measureFresh) {
      step('measure-fresh', 'running');
      const fresh = await measureEvalAndTracing(ctx.services);
      measurements = { ...measurements, eval: fresh.eval, tracing: fresh.tracing };
      step('measure-fresh', 'success', { golden: fresh.eval.golden.length, spans: fresh.tracing.length });
    }
    ctx.throwIfAborted();

    const cfg: GateConfig = {
      ...rec.config,
      load: { ...rec.config.load, healthP95Ms: input.healthP95Ms, runP95Ms: input.runP95Ms },
      a11y: { ...rec.config.a11y, maxSerious: input.maxSerious },
    };
    // Evaluated on the recorded day, so an allowlist expiry date never makes the lab fail later by itself.
    const today = rec.at.slice(0, 10);
    const clean = evaluateAll(measurements, cfg, rec.baseline, today);
    const gates =
      input.inject === 'none' ? clean : evaluateAll(inject(measurements, input.inject as never), cfg, rec.baseline, today);
    for (const g of gates) {
      step(g.gate, 'running');
      step(g.gate, g.status === 'pass' ? 'success' : 'failed', { findings: g.findings.slice(0, 3) });
      if (g.status === 'fail') ctx.log('warn', `${g.gate}: ${g.findings[0] ?? 'failed'}`);
    }

    let liveAnswer: Lab74Output['liveAnswer'] = { skipped: 'offline mode: no model is called' };
    if (ctx.mode === 'live') {
      step('answer-quality', 'running');
      const rubric = RUBRICS['workflow-steps']!;
      const m = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: researcherScript() });
      const answerer = withLabLogger(
        ctx,
        new Agent({
          id: 'regression-answerer',
          name: 'Answerer',
          instructions: ANSWER_INSTRUCTIONS,
          model: m.model,
          tools: { search_sources: searchTool('none') },
        }),
      );
      const res = await streamAgent(ctx, answerer, rubric.question, { maxSteps: 3 });
      const card = toScoreCard(rubric, res.text.trim(), await scoreAnswer(createRubricScorer(), rubric, res.text.trim()));
      const passed = card.score !== null && card.score >= input.liveThreshold;
      liveAnswer = {
        score: card.score,
        threshold: input.liveThreshold,
        passed,
        missing: card.criteria.flatMap((c) => c.missing).slice(0, 10),
        modelId: input.modelId,
        simulated: m.simulated,
      };
      step('answer-quality', passed ? 'success' : 'failed', { score: card.score });
      ctx.setResultExtras({ effective: { mode: ctx.mode, modelId: input.modelId, simulated: m.simulated } });
    } else ctx.setResultExtras({ effective: { mode: ctx.mode, simulated: true } });

    return {
      evidence: { commit: rec.commit, at: rec.at },
      fresh: input.measureFresh,
      injected: input.inject === 'none' ? null : input.inject,
      gates,
      withoutInjection: clean.map((g) => ({ gate: g.gate, status: g.status })),
      liveAnswer,
    };
  },

  validate(out) {
    const target = out.injected;
    const injectedGate = out.gates.find((g) => g.gate === target);
    const others = out.gates.filter((g) => g.gate !== target);
    const before = new Map(out.withoutInjection.map((g) => [g.gate, g.status]));
    const freshGates = out.gates.filter((g) => g.gate === 'eval-regression' || g.gate === 'tracing');
    const live = out.liveAnswer;
    return summarizeChecks([
      {
        id: 'evidence-recorded',
        label: 'The gates are evaluated on recorded evidence from a real regression run',
        passed: /^[0-9a-f]{7,12}$/.test(out.evidence.commit) && out.gates.length === GATE_NAMES.length,
        message: `commit ${out.evidence.commit}, recorded ${out.evidence.at}`,
      },
      {
        id: 'injected-gate-fails',
        label: 'An injected regression fails its gate',
        passed: target === null || injectedGate?.status === 'fail',
        message:
          target === null
            ? 'nothing injected: pick a gate to inject a regression'
            : `${target}: ${injectedGate?.findings[0] ?? 'did not fail'}`,
      },
      {
        id: 'other-gates-unaffected',
        label: 'Every other gate keeps its result',
        passed: others.every((g) => before.get(g.gate) === g.status),
        message:
          others
            .filter((g) => before.get(g.gate) !== g.status)
            .map((g) => g.gate)
            .join(', ') || 'unchanged',
      },
      {
        id: 'fresh-matches-baseline',
        label: 'A fresh measurement reproduces the eval and tracing baselines',
        passed: !out.fresh || freshGates.every((g) => g.status === 'pass' || g.gate === target),
        message: out.fresh ? freshGates.map((g) => `${g.gate}=${g.status}`).join(', ') : 'fresh measurement off',
      },
      {
        id: 'live-answer-quality',
        label: 'Live: a real model’s answer meets the quality threshold',
        passed: 'skipped' in live || (live.passed && !live.simulated),
        message:
          'skipped' in live
            ? live.skipped
            : `score ${live.score} vs threshold ${live.threshold}; missing ${live.missing.join(', ') || 'nothing'}`,
      },
    ]);
  },
};
