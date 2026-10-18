import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const dataset = [
  { id: 'card-declined', question: 'My card was declined, what should I do?', relevant: ['err-4012'], answerable: true },
  { id: 'money-back', question: 'Will I get my money returned?', relevant: ['refunds'], answerable: true },
  { id: 'parcel', question: 'When will my parcel be delivered?', relevant: ['shipping'], answerable: true },
  { id: 'error-5003', question: 'What does error E-5003 mean?', relevant: ['err-5003'], answerable: true },
  { id: 'water-damage', question: 'Is water damage covered by the warranty?', relevant: ['warranty'], answerable: true },
  { id: 'transcripts', question: 'How long do you keep support chat transcripts?', relevant: ['privacy'], answerable: true },
  { id: 'student-discount', question: 'Do you offer a student discount?', relevant: [], answerable: false },
  { id: 'crypto', question: 'Can I pay with cryptocurrency?', relevant: [], answerable: false },
];

export const DEFAULT_GATES = {
  'retrieval-hit-rate': 0.8,
  'context-relevance': 0.3,
  'answer-faithfulness': 0.9,
  abstention: 1,
  'answer-rate': 0.6,
};

export const lab45Definition = {
  id: 'lab-45',
  number: 45,
  title: 'RAG quality evaluation',
  moduleId: 'module-09',
  summary:
    'Measure a RAG pipeline with a visible fixture suite: retrieval hit rate, context relevance, answer faithfulness, abstention and answer rate, computed by deterministic Mastra scorers, gated by declared thresholds and reproducible to the last digit.',
  concept:
    'Whether a RAG system “works” is a claim that needs evidence, and evidence means a fixed set of questions with known right answers, run through the pipeline and scored. ' +
    'Retrieval and generation fail differently, so they are measured separately: hit rate asks whether a passage containing the answer was retrieved at all, context relevance asks how much of what was retrieved is relevant, and faithfulness asks whether the model’s claims are supported by the retrieved passages. ' +
    'Honesty needs its own measures: unanswerable questions should get no claims (abstention), and answerable ones should get at least one verified claim (answer rate), otherwise a system that never answers would look perfectly faithful. ' +
    'Each metric is a Mastra scorer built with createScorer, whose steps compute the number and a reason stating the arithmetic, and which returns “not scorable” when a metric does not apply to an item, such as faithfulness when no claim was made. ' +
    'These scorers are code-based and deterministic, so the same outputs always give the same scores; LLM-judged metrics are useful too, but their scores vary between runs and must be treated as estimates. ' +
    'Every reported number carries its sample size and is recomputed from the visible per-item results, because eight questions are a sample, not a guarantee. ' +
    'Gates turn metrics into a decision: each metric has a declared minimum, and a change that drops one below it fails the suite.',
  objectives: [
    'Build a fixture dataset with ground truth for a RAG pipeline',
    'Write deterministic Mastra scorers for retrieval and answer quality',
    'Report every metric with its sample size and per-item evidence',
    'Gate changes on declared thresholds and prove the metrics are reproducible',
  ],
  prerequisites: ['lab-44'],
  inputs: [
    {
      kind: 'json',
      name: 'dataset',
      label: 'Dataset (1–12 items): id, question, relevant (passage ids), answerable',
      maxBytes: 8_000,
      default: dataset,
      required: true,
    },
    {
      kind: 'select',
      name: 'retrieval',
      label: 'Retrieval',
      options: [
        { value: 'hybrid', label: 'Hybrid (BM25 + vector, RRF)' },
        { value: 'vector-only', label: 'Vector only' },
        { value: 'keyword-only', label: 'Keyword only (BM25)' },
      ],
      default: 'hybrid',
      required: true,
    },
    {
      kind: 'number',
      name: 'maxSources',
      label: 'Passages retrieved per question (k)',
      min: 1,
      max: 6,
      step: 1,
      default: 4,
      required: true,
    },
    {
      kind: 'select',
      name: 'offlineBehaviour',
      label: 'Offline generator',
      options: [
        { value: 'faithful', label: 'Faithful' },
        { value: 'sloppy', label: 'Sloppy (invents and misquotes)' },
      ],
      default: 'faithful',
      required: true,
    },
    {
      kind: 'json',
      name: 'gates',
      label: 'Gates: minimum mean per metric (0–1)',
      maxBytes: 1_000,
      default: DEFAULT_GATES,
      required: true,
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Generator model (live)',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: {
    dataset,
    retrieval: 'hybrid',
    maxSources: 4,
    offlineBehaviour: 'faithful',
    gates: DEFAULT_GATES,
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'Offline with hybrid retrieval: hit rate 6/6 = 1.00, context relevance 0.51 (n = 7), faithfulness 4/4 = 1.00, abstention 2/2 = 1.00 and answer rate 4/6 = 0.67. All gates pass, and re-scoring and re-running give identical numbers. The answer rate is not 1.00 because the offline scripted generator cannot answer the two paraphrased questions even though the right passage was retrieved: a generator gap that hit rate alone would hide.',
    example: {
      config: { retrieval: 'hybrid', maxSources: 4 },
      aggregates: {
        'retrieval-hit-rate': { mean: 1, sum: 6, n: 6, notScorable: 2 },
        'answer-faithfulness': { mean: 1, sum: 4, n: 4, notScorable: 4 },
        abstention: { mean: 1, sum: 2, n: 2, notScorable: 6 },
        'answer-rate': { mean: 0.6667, sum: 4, n: 6, notScorable: 2 },
      },
      reproducibility: { rescoreIdentical: true, rerunIdentical: true },
    },
  },
  guide: {
    procedure: [
      'Open metrics.ts in the Source tab: read one scorer from preprocess to generateReason, and find notScorable().',
      'Run the example. Read the summary lines, then open two items and compare their retrieved passages, claims and per-metric reasons.',
      'Switch Retrieval to Keyword only and run: which items miss, and which gate fails?',
      'Switch the offline generator to Sloppy and run: how does faithfulness change, and why does answer rate stay the same?',
      'Raise k to 6 and run: what happens to context relevance, and why?',
      'Add an item of your own with its ground truth and run again.',
      'Optional (costs about a cent): run live and compare the numbers; only re-scoring is checked for reproducibility live.',
    ],
    prediction: 'With keyword-only retrieval, which items will miss the relevant passage?',
    hints: [
      { level: 1, text: 'Keyword search needs shared words.' },
      { level: 2, text: 'Look for questions phrased differently from their passages.' },
      {
        level: 3,
        text: '“Will I get my money returned?” and “When will my parcel be delivered?” share no word with their passages, so they miss.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Reporting a single “accuracy” number.',
        fix: 'Measure retrieval and generation separately, plus abstention and answer rate.',
      },
      { mistake: 'Quoting a metric without its sample size.', fix: 'Always report n and how many items were not scorable.' },
      {
        mistake: 'Scoring faithfulness only on the answers that were shown.',
        fix: 'Score the model’s raw claims; the guard hides problems from users, not from the evaluation.',
      },
      {
        mistake: 'Calling LLM-judged scores reproducible.',
        fix: 'Use deterministic scorers for gates; treat judged scores as estimates.',
      },
    ],
    challenge: {
      prompt:
        'Add an LLM-judged “answer helpfulness” scorer with createScorer and a judge model. How do you report its variance, and should it gate a release?',
      successCriteria: ['The judged scorer runs several times and reports a range', 'Only deterministic metrics gate'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Why measure retrieval hit rate separately from faithfulness?',
      choices: [
        'They are the same',
        'A wrong answer can come from missing context or from an unfaithful model; each needs its own fix',
        'Faithfulness is optional',
        'Hit rate is cheaper',
      ],
      correctIndex: 1,
      explanation: 'Separate metrics point at the failing stage.',
    },
    {
      id: 'q2',
      prompt: 'What does notScorable() mean for an item?',
      choices: [
        'Score 0',
        'The metric does not apply to this item and it is left out of the mean',
        'The item failed',
        'An error',
      ],
      correctIndex: 1,
      explanation: 'For example faithfulness when no claim was made.',
    },
    {
      id: 'q3',
      prompt: 'A system that never answers. What does it score on faithfulness and on answer rate?',
      choices: ['1 and 1', 'Not scorable on faithfulness, 0 on answer rate', '0 and 0', '1 and 0'],
      correctIndex: 1,
      explanation: 'That is why answer rate is measured too.',
    },
    {
      id: 'q4',
      prompt: 'The suite reports hit rate 6/6 = 1.00. What can you claim?',
      choices: [
        'Retrieval is perfect',
        'On these 6 answerable fixture items, a relevant passage was always retrieved',
        'The model is accurate',
        'Nothing',
      ],
      correctIndex: 1,
      explanation: 'A metric is evidence about its sample, not a guarantee.',
    },
  ],
  sourceFiles: [
    { path: 'metrics.ts', title: 'Scorers', description: 'Five createScorer metrics, aggregation and summary.' },
    { path: 'run.ts', title: 'Lab run', description: 'Pipeline per item, reproducibility, gates and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, write a ground-truth dataset for your RAG pipeline, implement hit rate, context relevance and faithfulness as Mastra scorers, and fail the build when a metric drops below its gate.',
    solutionFile: 'solution.md',
  },
  checks: [
    {
      id: 'metrics-reproducible',
      label: 'Re-scoring the stored outputs (and, offline, re-running the suite) gives identical metrics',
    },
    {
      id: 'samples-visible',
      label: 'Every item shows its question, ground truth, retrieved passages, claims and a reason per metric',
    },
    { id: 'gates-met', label: 'Every metric meets its declared minimum' },
    { id: 'summary-verifiable', label: 'Every number in the summary is recomputed from the per-item scores' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Evidence, not impressions', minutes: 1, talkingPoints: ['A fixture set with ground truth'] },
      {
        title: 'Five metrics',
        minutes: 2,
        talkingPoints: ['Hit rate, context relevance', 'Faithfulness, abstention, answer rate'],
      },
      { title: 'createScorer', minutes: 1.5, talkingPoints: ['Steps and reasons', 'notScorable'] },
      { title: 'Reproducibility and gates', minutes: 1.5, talkingPoints: ['Re-score and re-run', 'Declared thresholds'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Sample size honesty', 'Next module'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 120_000,
    maxTimeoutMs: 240_000,
    budget: {},
    costNotice:
      'Offline is free (scripted generator, mock embeddings; the suite runs twice). Live makes one model call per item with sources and embeds the passages and questions: about a cent for the example.',
  },
  tags: ['rag', 'evaluation', 'scorers', 'metrics', 'testing'],
} satisfies LabDefinitionInput;
