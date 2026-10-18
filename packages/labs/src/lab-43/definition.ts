import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const questions = [
  { question: 'What does error E-5003 mean?', expect: { id: 'err-5003' } },
  { question: 'Will I get my money returned?', expect: { id: 'refunds' } },
  { question: 'When will my parcel be delivered?', expect: { id: 'shipping' } },
  { question: 'My card was declined, what should I do?', expect: { id: 'err-4012' } },
  { question: 'Is water damage covered?', expect: { id: 'warranty' } },
];

export const lab43Definition = {
  id: 'lab-43',
  number: 43,
  title: 'Reranking',
  moduleId: 'module-09',
  summary:
    'Rerank first-stage candidates with Mastra’s reranker, inspect every candidate’s rank before and after with its score components, keep provenance intact, and guard against scorer replies that would poison the ranking.',
  concept:
    'First-stage retrieval compares one question vector with many passage vectors; it is fast but coarse. A reranker looks at a short list of candidates together with the question and reorders them. ' +
    'Mastra’s rerankWithScorer gives each candidate a final score from three signals: a semantic relevance score from a scorer, the first-stage vector score, and its position in the first-stage list, weighted 0.4, 0.4 and 0.2 by default. ' +
    'The scorer can be an agent that asks a model to rate relevance from 0 to 1 (MastraAgentRelevanceScorer, one call per candidate), a hosted reranking model such as Cohere’s, or a local deterministic function, which is what offline runs and tests need. ' +
    'Two quiet failure modes matter: the semantic score is only computed when the candidate’s metadata has a text field (otherwise it is silently 0), and a model that answers “Relevance: 0.9” instead of a bare number makes Mastra’s agent scorer throw (in @mastra/rag), or return NaN (in the @mastra/core copy), either of which breaks the whole ranking. ' +
    'This lab therefore wraps every scorer in a guard that catches errors, NaN and out-of-range values, uses 0 for them and flags them. ' +
    'Each candidate is shown with its rank before and after, the three components and the final score, and reranking must never change what a result is: the same id, document, source and text. ' +
    'With a deterministic scorer the reranked order is identical on every run, which is what makes reranking testable.',
  objectives: [
    'Rerank candidates with Mastra’s rerankWithScorer and a relevance scorer',
    'Read the semantic, vector and position components of a final score',
    'Show before and after ranks while keeping provenance unchanged',
    'Validate scorer output and keep ranks stable with a deterministic scorer',
  ],
  prerequisites: ['lab-42'],
  inputs: [
    {
      kind: 'json',
      name: 'questions',
      label: 'Questions (1–6), each with an optional expect { id } (passage ids as in lab 42)',
      maxBytes: 4_000,
      default: questions,
      required: true,
    },
    {
      kind: 'select',
      name: 'scorer',
      label: 'Relevance scorer',
      options: [
        { value: 'agent', label: 'Mastra agent scorer (scripted offline, your model live)' },
        { value: 'keyword', label: 'Keyword overlap (local, deterministic fallback)' },
        { value: 'none', label: 'None: first stage only' },
      ],
      default: 'agent',
      required: true,
    },
    {
      kind: 'number',
      name: 'candidates',
      label: 'Candidates from the first stage',
      min: 2,
      max: 9,
      step: 1,
      default: 5,
      required: true,
    },
    {
      kind: 'number',
      name: 'weightSemantic',
      label: 'Weight: semantic',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.4,
      required: true,
    },
    { kind: 'number', name: 'weightVector', label: 'Weight: vector', min: 0, max: 1, step: 0.05, default: 0.4, required: true },
    {
      kind: 'number',
      name: 'weightPosition',
      label: 'Weight: position (weights must add up to 1)',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.2,
      required: true,
    },
    {
      kind: 'boolean',
      name: 'chattyScorer',
      label: 'Offline: the scorer answers “Relevance: 0.9” instead of a number',
      default: false,
      required: true,
      visibleWhen: { field: 'scorer', in: ['agent'] },
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Scorer model (live)',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: {
    questions,
    scorer: 'agent',
    candidates: 5,
    weightSemantic: 0.4,
    weightVector: 0.4,
    weightPosition: 0.2,
    chattyScorer: false,
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'The first stage ranks err-7001 above err-5003 for “What does error E-5003 mean?”; after reranking err-5003 is first (it moves up one place) and every question’s expected passage leads. Each row shows its rank before and after, the semantic, vector and position components, and unchanged provenance.',
    example: {
      scorer: 'agent',
      weights: { semantic: 0.4, vector: 0.4, position: 0.2 },
      results: [
        { question: 'What does error E-5003 mean?', stable: true },
        { question: 'Will I get my money returned?', stable: true },
        { question: 'When will my parcel be delivered?', stable: true },
        { question: 'My card was declined, what should I do?', stable: true },
        { question: 'Is water damage covered?', stable: true },
      ],
    },
  },
  guide: {
    procedure: [
      'Open run.ts and scorers.ts in the Source tab: find rerankWithScorer, the weights and SafeScorer.',
      'Run the example. For the E-5003 question, compare before and after, and read the winning row’s components.',
      'Switch the scorer to None: what does the E-5003 question return first now?',
      'Set the weights to semantic 1, vector 0, position 0 and run: how does the order change?',
      'Tick “the scorer answers Relevance: 0.9” and run: what do the flagged scorer calls show, and what would happen to the run without the guard?',
      'Optional (costs one or two cents): run live with the agent scorer; compare the semantic scores your model gives with the scripted ones.',
    ],
    prediction:
      'For E-5003, err-7001 is first and err-5003 second before reranking. With weights 0.4/0.4/0.2, can err-5003 overtake it?',
    hints: [
      { level: 1, text: 'Position gives the first candidate 1.0 and the second 0.8.' },
      { level: 2, text: 'The semantic score rewards the passage that contains “E-5003”.' },
      {
        level: 3,
        text: 'Yes: its higher semantic score outweighs the small position and vector differences, so it finishes first.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Storing chunks without a text field in metadata.',
        fix: 'rerankWithScorer reads metadata.text; without it every semantic score is silently 0.',
      },
      {
        mistake: 'Trusting a model’s relevance reply.',
        fix: 'Guard the scorer: a reply that is not a bare number throws (or becomes NaN) and breaks the whole rerank.',
      },
      { mistake: 'Reranking the whole index.', fix: 'Rerank a short candidate list; agent scorers cost one call per candidate.' },
      {
        mistake: 'Letting reranking rewrite results.',
        fix: 'Keep id, document, source and text unchanged so citations still match.',
      },
    ],
    challenge: {
      prompt:
        'Measure whether reranking is worth its cost: run the questions with and without the agent scorer, and report accuracy gained per extra model call.',
      successCriteria: ['Accuracy with and without reranking is reported', 'Calls and estimated cost per question are reported'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What does rerankWithScorer combine by default?',
      choices: [
        'Only the model’s score',
        'Semantic score, vector score and position, weighted 0.4 / 0.4 / 0.2',
        'BM25 and RRF',
        'The document length',
      ],
      correctIndex: 1,
      explanation: 'Weights must add up to 1.',
    },
    {
      id: 'q2',
      prompt: 'A candidate has no metadata.text. What is its semantic score?',
      choices: ['1', '0, silently', 'An error', 'The vector score'],
      correctIndex: 1,
      explanation: 'Verified in the installed version: the scorer is not even called.',
    },
    {
      id: 'q3',
      prompt: 'The scorer model replies “Relevance: 0.9”. Without a guard, what happens with @mastra/rag’s agent scorer?',
      choices: ['0.9 is used', 'It throws, and the whole rerank fails', 'The reranker retries', 'It is ignored'],
      correctIndex: 1,
      explanation: 'Verified: it accepts only a bare number in 0–1. The @mastra/core copy returns NaN instead. Hence the guard.',
    },
    {
      id: 'q4',
      prompt: 'Why use a deterministic local scorer in tests?',
      choices: [
        'It is more accurate',
        'So reranked ranks are identical on every run and tests are reliable',
        'Agents cannot rerank',
        'It is required by Mastra',
      ],
      correctIndex: 1,
      explanation: 'Live model scores vary between runs.',
    },
  ],
  sourceFiles: [
    {
      path: 'run.ts',
      title: 'Lab run',
      description: 'First stage, rerankWithScorer twice, before/after rows, provenance and checks.',
    },
    {
      path: 'scorers.ts',
      title: 'Scorers',
      description: 'Keyword relevance, SafeScorer guard and the scripted agent-scorer model.',
    },
  ],
  exercise: {
    instructions:
      'In your project, rerank a short candidate list with rerankWithScorer and a deterministic scorer, validate scorer output, and write tests that pin the reranked order, check provenance is unchanged and show a NaN reply is neutralised.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'expected-top-after-rerank', label: 'After reranking, each question’s expected passage is first' },
    { id: 'ranks-stable', label: 'Reranking the same candidates again gives the same order' },
    {
      id: 'provenance-retained',
      label: 'Every reranked result is an original candidate with unchanged id, document, source and text',
    },
    { id: 'before-after-shown', label: 'Every candidate shows its rank before and after, and its score components' },
    {
      id: 'scorer-output-validated',
      label: 'No invalid scorer reply reached the ranking (errors, NaN or out-of-range values are replaced and flagged)',
    },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Two-stage retrieval', minutes: 1, talkingPoints: ['Fast first stage, careful second'] },
      { title: 'rerankWithScorer', minutes: 2, talkingPoints: ['Semantic, vector, position', 'Weights add up to 1'] },
      { title: 'Scorers', minutes: 1.5, talkingPoints: ['Agent scorer, hosted rerankers, local fallback'] },
      { title: 'Quiet failures', minutes: 1.5, talkingPoints: ['Missing metadata.text', 'NaN replies', 'Provenance'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Stable ranks in tests', 'Next: citation-aware generation'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 120_000,
    maxTimeoutMs: 180_000,
    budget: {},
    costNotice:
      'Offline is free (mock embeddings, scripted scorer). Live with the agent scorer makes one model call per candidate and question, twice (the stability check): 5 × 5 × 2 = 50 short calls for the example, a few cents. The keyword scorer is free.',
  },
  tags: ['rag', 'reranking', 'relevance', 'provenance', 'testing'],
} satisfies LabDefinitionInput;
