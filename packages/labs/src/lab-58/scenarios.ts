import { z } from 'zod';
import { RUBRICS } from '../lab-57/rubrics.js';

export const DATASET_ID = 'course-faq';
export const DATASET_NAME = 'Course FAQ';

/** The expected assertions of one scenario (the item's groundTruth). */
export const AssertionsSchema = z.object({
  /** L57 rubric used for the rubric score, or null when the scenario is not about a course topic. */
  rubricId: z.string().nullable(),
  /** The rubric score must reach this value. */
  minScore: z.number().min(0).max(1).nullable(),
  /** Phrases the answer must contain (matched with the L57 tokeniser). */
  mustMention: z.array(z.string().min(1)),
  /** Phrases the answer must not contain. */
  mustNotMention: z.array(z.string().min(1)),
});
export type Assertions = z.infer<typeof AssertionsSchema>;

export interface ScenarioPayload {
  externalId: string;
  input: string;
  groundTruth: Assertions;
  metadata: { title: string };
}
export type SeedOp = { op: 'add'; item: ScenarioPayload } | { op: 'update'; item: ScenarioPayload };
export interface SeedRevision {
  revision: number;
  note: string;
  ops: SeedOp[];
}

const scenario = (
  externalId: string,
  title: string,
  groundTruth: Assertions,
  input = RUBRICS[externalId]?.question ?? '',
): ScenarioPayload => ({
  externalId,
  input,
  groundTruth,
  metadata: { title },
});

/**
 * The dataset's history, checked in. Revisions are applied in order, once each; every applied revision is
 * recorded in the dataset metadata with the dataset version it produced.
 */
export const SEED_REVISIONS: SeedRevision[] = [
  {
    revision: 1,
    note: 'Three course questions with rubric and phrase assertions',
    ops: [
      {
        op: 'add',
        item: scenario('workflow-steps', 'Workflow steps', {
          rubricId: 'workflow-steps',
          minScore: 0.7,
          mustMention: ['step'],
          mustNotMention: ['random order'],
        }),
      },
      {
        op: 'add',
        item: scenario('suspend-resume', 'Suspend and resume', {
          rubricId: 'suspend-resume',
          minScore: 0.7,
          mustMention: ['suspend', 'resume'],
          mustNotMention: [],
        }),
      },
      {
        op: 'add',
        item: scenario('tool-validation', 'Tool validation', {
          rubricId: 'tool-validation',
          minScore: 0.5,
          mustMention: ['schema'],
          mustNotMention: [],
        }),
      },
    ],
  },
  {
    revision: 2,
    note: 'Adds an out-of-scope guard and tightens tool validation',
    ops: [
      {
        op: 'add',
        item: scenario(
          'out-of-scope',
          'Out-of-scope question',
          { rubricId: null, minScore: null, mustMention: ['only answer questions about Mastra'], mustNotMention: ['Paris'] },
          'What is the capital of France?',
        ),
      },
      {
        op: 'update',
        item: scenario('tool-validation', 'Tool validation', {
          rubricId: 'tool-validation',
          minScore: 0.7,
          mustMention: ['schema', 'validat'],
          mustNotMention: [],
        }),
      },
    ],
  },
];
export const LATEST_REVISION = SEED_REVISIONS.at(-1)!.revision;
