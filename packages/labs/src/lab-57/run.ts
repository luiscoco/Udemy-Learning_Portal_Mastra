import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition, type ScoreCard } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamAgent } from '../shared/tool-stream.js';
import { researcherScript, searchTool } from '../lab-56/pipeline.js';
import { lab57Definition } from './definition.js';
import { runGolden } from './golden.js';
import { RUBRIC_IDS, RUBRICS } from './rubrics.js';
import { createRubricScorer, scoreAnswer, toScoreCard } from './scorer.js';

export const Lab57InputSchema = z.object({
  rubricId: z.enum(RUBRIC_IDS),
  answerSource: z.enum(['text', 'agent']),
  // The web form omits an empty optional field: treat it as an empty answer (which is not scorable).
  answer: z.string().max(5_000).default(''),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab57Input = z.infer<typeof Lab57InputSchema>;

export interface Lab57Output {
  answerSource: Lab57Input['answerSource'];
  agent: { toolCalls: string[] } | null;
  determinism: {
    first: { score: number | null; reason: string };
    second: { score: number | null; reason: string };
    identical: boolean;
  };
  scoreCard: ScoreCard;
}

export const ANSWER_INSTRUCTIONS =
  'Answer the question about Mastra in two or three sentences. Call search_sources first and use only what it returns.';

export const lab57: LabImplementation<Lab57Input, Lab57Output, LabServices> = {
  definition: lab57Definition as LabDefinition,
  inputSchema: Lab57InputSchema,

  async run(ctx, input) {
    const rubric = RUBRICS[input.rubricId]!;
    let answer = input.answer;
    let agent: Lab57Output['agent'] = null;
    if (input.answerSource === 'agent') {
      const m = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: researcherScript() });
      const answerer = withLabLogger(
        ctx,
        new Agent({
          id: 'answerer',
          name: 'Answerer',
          instructions: ANSWER_INSTRUCTIONS,
          model: m.model,
          tools: { search_sources: searchTool('none') },
        }),
      );
      ctx.emit({ type: 'workflow-step', stepId: 'answer', status: 'running' });
      const res = await streamAgent(ctx, answerer, rubric.question, { maxSteps: 3 });
      answer = res.text.trim();
      agent = { toolCalls: res.tools.map((t) => t.toolName) };
      ctx.emit({
        type: 'workflow-step',
        stepId: 'answer',
        status: 'success',
        output: { words: answer.split(/\s+/).filter(Boolean).length },
      });
      ctx.setResultExtras({
        effective: { mode: ctx.mode, modelId: input.modelId, simulated: m.simulated, answerSource: 'agent' },
      });
    } else
      ctx.setResultExtras({
        effective: { mode: ctx.mode, answerSource: 'text', simulated: false, scorer: 'deterministic (no model call)' },
      });

    const scorer = createRubricScorer();
    ctx.emit({ type: 'workflow-step', stepId: 'score', status: 'running' });
    const first = await scoreAnswer(scorer, rubric, answer);
    const second = await scoreAnswer(scorer, rubric, answer);
    const pick = (r: typeof first) => ({
      score: r.notScorable ? null : (r.score ?? null),
      reason: r.notScorable?.reason ?? r.reason ?? '',
    });
    const identical =
      JSON.stringify([pick(first), first.analyzeStepResult]) === JSON.stringify([pick(second), second.analyzeStepResult]);
    const card = toScoreCard(rubric, answer, first);
    ctx.emit({ type: 'workflow-step', stepId: 'score', status: 'success', output: { score: card.score, passed: card.passed } });
    ctx.log('info', card.notScorable ? `not scorable: ${card.notScorable}` : card.reason);

    ctx.emit({ type: 'workflow-step', stepId: 'golden fixtures', status: 'running' });
    const fixtures = await runGolden(scorer);
    const bad = fixtures.filter((f) => !f.ok);
    ctx.emit({
      type: 'workflow-step',
      stepId: 'golden fixtures',
      status: bad.length ? 'failed' : 'success',
      output: { passed: fixtures.length - bad.length, total: fixtures.length },
    });
    for (const f of bad) ctx.log('error', `fixture failed: ${f.rubricId} / ${f.name}: ${f.detail}`);

    return {
      answerSource: input.answerSource,
      agent,
      determinism: { first: pick(first), second: pick(second), identical },
      scoreCard: { ...card, fixtures },
    };
  },

  validate(out) {
    const c = out.scoreCard;
    const fx = c.fixtures;
    const failed = fx.filter((f) => !f.ok);
    const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
    const sum = r4(
      Math.min(
        1,
        Math.max(
          0,
          c.criteria.reduce((n, x) => n + x.contribution, 0),
        ),
      ),
    );
    const completeness = c.criteria.find((x) => x.id === 'completeness');
    const rationaleOk =
      c.score === null
        ? !!c.notScorable && c.criteria.length === 0 && c.passed === null
        : c.criteria.length === 4 &&
          Math.abs(sum - c.score) < 1e-9 &&
          /Completeness .+ Relevance .+ Score = /.test(c.reason) &&
          c.formula.endsWith(`= ${c.score}`) &&
          !!completeness &&
          completeness.evidence.length + completeness.missing.length === c.keyPoints.length &&
          c.passed === c.score >= c.passThreshold;
    const references = fx.filter((f) => f.name === 'reference answer');
    const empty = fx.filter((f) => f.expectedScore === null);
    return summarizeChecks([
      {
        id: 'scorer-fixtures-pass',
        label: 'Every golden scorer fixture returns its expected score, pass flag and missing points',
        passed: fx.length > 0 && failed.length === 0,
        message: failed.length
          ? failed.map((f) => `${f.rubricId}/${f.name}: ${f.detail}`).join('; ')
          : `${fx.length}/${fx.length} fixtures pass`,
      },
      {
        id: 'rationale-exposed',
        label: 'The score exposes its rationale: criteria, evidence, missing points and a formula that adds up',
        passed: rationaleOk,
        message: c.score === null ? `not scorable: ${c.notScorable}` : `${c.formula}; contributions sum to ${sum}`,
      },
      {
        id: 'deterministic',
        label: 'Scoring the same answer twice gives the same score and reason',
        passed: out.determinism.identical && out.determinism.first.score === c.score,
        message: `${out.determinism.first.score} / ${out.determinism.second.score}`,
      },
      {
        id: 'reference-scores-full',
        label: 'Each rubric’s expected output (reference answer) scores 1 and passes',
        passed:
          references.length === Object.keys(RUBRICS).length &&
          references.every((f) => f.actualScore === 1 && f.actualPassed === true),
        message: references.map((f) => `${f.rubricId}: ${f.actualScore}`).join(', '),
      },
      {
        id: 'not-scorable-handled',
        label: 'An answer that cannot be scored gets no score, only a reason',
        passed: empty.length > 0 && empty.every((f) => f.ok && f.actualScore === null) && (c.score !== null || !!c.notScorable),
        message: empty.map((f) => f.detail).join('; '),
      },
    ]);
  },
};
