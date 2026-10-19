import type { ScoreFixtureResult } from '@mlp/contracts';
import { RUBRICS } from './rubrics.js';
import { scoreAnswer, type RubricScorer } from './scorer.js';

/** A golden scorer fixture: an answer with its hand-computed score, pass flag and missing key points. */
export interface GoldenFixture {
  name: string;
  rubricId: keyof typeof RUBRICS;
  answer: string;
  /** null = the scorer must return notScorable. */
  expectedScore: number | null;
  expectedPassed: boolean | null;
  expectedMissing: string[];
}

const ref = (id: string) => RUBRICS[id]!.reference;

export const GOLDEN: GoldenFixture[] = [
  // workflow-steps (weights 0.6 / 0.4, forbidden −0.35, over length −0.1, pass ≥ 0.7)
  {
    name: 'reference answer',
    rubricId: 'workflow-steps',
    answer: ref('workflow-steps'),
    expectedScore: 1,
    expectedPassed: true,
    expectedMissing: [],
  },
  {
    name: 'partial: chaining missing (0.6 × 0.6667 + 0.4 × 1)',
    rubricId: 'workflow-steps',
    answer: 'A Mastra workflow runs its steps in a fixed order. Each step declares an input schema and an output schema.',
    expectedScore: 0.8,
    expectedPassed: true,
    expectedMissing: ['chaining'],
  },
  {
    name: 'partial and one off-topic sentence (0.6 × 0.6667 + 0.4 × 0.6667)',
    rubricId: 'workflow-steps',
    answer: 'Steps run in order. Each step has an input schema. I had pasta for lunch.',
    expectedScore: 0.6667,
    expectedPassed: false,
    expectedMissing: ['chaining'],
  },
  {
    name: 'off-topic answer',
    rubricId: 'workflow-steps',
    answer: 'I like pizza. The weather is nice today. Bananas are yellow.',
    expectedScore: 0,
    expectedPassed: false,
    expectedMissing: ['order', 'schemas', 'chaining'],
  },
  {
    name: 'reference plus a known-wrong claim (1 − 0.35)',
    rubricId: 'workflow-steps',
    answer: `${ref('workflow-steps')} Steps can also run in a random order.`,
    expectedScore: 0.65,
    expectedPassed: false,
    expectedMissing: [],
  },
  {
    name: 'reference repeated past the word limit (1 − 0.1)',
    rubricId: 'workflow-steps',
    answer: [1, 2, 3].map(() => ref('workflow-steps')).join(' '),
    expectedScore: 0.9,
    expectedPassed: true,
    expectedMissing: [],
  },
  {
    name: 'empty answer: not scorable',
    rubricId: 'workflow-steps',
    answer: '',
    expectedScore: null,
    expectedPassed: null,
    expectedMissing: [],
  },
  // suspend-resume
  {
    name: 'reference answer',
    rubricId: 'suspend-resume',
    answer: ref('suspend-resume'),
    expectedScore: 1,
    expectedPassed: true,
    expectedMissing: [],
  },
  {
    name: 'partial: resume data and storage missing (0.6 × 0.5 + 0.4)',
    rubricId: 'suspend-resume',
    answer: 'A step calls suspend to pause the run. Later the run is resumed with resume.',
    expectedScore: 0.7,
    expectedPassed: true,
    expectedMissing: ['resume-data', 'storage'],
  },
  {
    name: 'known-wrong claim only (0.4 − 0.35)',
    rubricId: 'suspend-resume',
    answer: 'The workflow waits in a polling loop until a human answers.',
    expectedScore: 0.05,
    expectedPassed: false,
    expectedMissing: ['suspend', 'resume', 'resume-data', 'storage'],
  },
  // tool-validation
  {
    name: 'reference answer',
    rubricId: 'tool-validation',
    answer: ref('tool-validation'),
    expectedScore: 1,
    expectedPassed: true,
    expectedMissing: [],
  },
  {
    name: 'partial: only the input schema (0.6 × 0.25 + 0.4)',
    rubricId: 'tool-validation',
    answer: 'Mastra checks the tool input schema.',
    expectedScore: 0.55,
    expectedPassed: false,
    expectedMissing: ['create-tool', 'before-execute', 'error-to-model'],
  },
];

/** Runs every golden fixture through the real scorer and compares score, pass flag and missing points. */
export async function runGolden(scorer: RubricScorer): Promise<ScoreFixtureResult[]> {
  const out: ScoreFixtureResult[] = [];
  for (const g of GOLDEN) {
    const rubric = RUBRICS[g.rubricId]!;
    const r = await scoreAnswer(scorer, rubric, g.answer);
    const score = r.notScorable ? null : (r.score ?? null);
    const passed = score === null ? null : score >= rubric.passThreshold;
    const missing = (r.analyzeStepResult?.covered ?? []).filter((c) => !c.evidence).map((c) => c.id);
    const scoreOk = g.expectedScore === null ? score === null : score !== null && Math.abs(score - g.expectedScore) < 1e-9;
    const ok = scoreOk && passed === g.expectedPassed && JSON.stringify(missing) === JSON.stringify(g.expectedMissing);
    out.push({
      name: g.name,
      rubricId: g.rubricId,
      expectedScore: g.expectedScore,
      actualScore: score,
      expectedPassed: g.expectedPassed,
      actualPassed: passed,
      ok,
      detail: ok
        ? r.notScorable
          ? `not scorable: ${r.notScorable.reason}`
          : `missing: ${missing.join(', ') || 'none'}`
        : `expected ${g.expectedScore} / missing [${g.expectedMissing.join(', ')}], got ${score} / missing [${missing.join(', ')}]`,
    });
  }
  return out;
}
