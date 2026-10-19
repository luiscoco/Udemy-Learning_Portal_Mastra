import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const answer = 'A Mastra workflow runs its steps in a fixed order. Each step declares an input schema and an output schema.';

export const lab57Definition = {
  id: 'lab-57',
  number: 57,
  title: 'Custom scorer',
  moduleId: 'module-12',
  summary:
    'Build a deterministic Mastra scorer that grades an answer against a rubric and its expected output for completeness and relevance, with penalties for known-wrong claims, and exposes the full rationale behind every score.',
  concept:
    'A scorer turns an output into a number between 0 and 1 and explains it. Mastra’s createScorer builds one from steps: preprocess prepares the input (and can declare it not scorable), analyze collects the facts, generateScore computes the number and generateReason explains it; scorer.run() returns the score, the reason and every step’s result. ' +
    'Here every step is code, so the score is deterministic: the same answer always gets the same score and the same reason, and no model is called. ' +
    'The rubric is the expected output made explicit: the question, a reference answer, the key points an answer must cover (each with aliases), the words that make a sentence on topic, known-wrong claims, a word limit and a pass threshold. ' +
    'Completeness is the share of key points covered, relevance the share of sentences on topic, and the score is 0.6 × completeness + 0.4 × relevance minus penalties, clamped to 0–1. ' +
    'A score is only useful when you can see why it is what it is: the score card lists each criterion with its weight, sub-score and contribution, the sentence that covered each key point, what is missing, and the formula with the numbers filled in. ' +
    'Before you trust a scorer, test it: golden fixtures pin hand-computed scores for good, partial, off-topic, wrong and empty answers, and the reference answer of each rubric must score 1.',
  objectives: [
    'Build a scorer with createScorer’s preprocess, analyze, generateScore and generateReason steps',
    'Encode a rubric and expected output as key points, topic terms and penalties',
    'Expose the rationale of a score down to the evidence',
    'Pin scorer behaviour with golden fixtures and a determinism check',
  ],
  prerequisites: ['lab-56'],
  inputs: [
    {
      kind: 'select',
      name: 'rubricId',
      label: 'Rubric',
      options: [
        { value: 'workflow-steps', label: 'How does a Mastra workflow run its steps?' },
        { value: 'suspend-resume', label: 'How can a Mastra workflow pause for a human?' },
        { value: 'tool-validation', label: 'How does Mastra validate tool inputs?' },
      ],
      default: 'workflow-steps',
      required: true,
    },
    {
      kind: 'select',
      name: 'answerSource',
      label: 'Answer to score',
      options: [
        { value: 'text', label: 'The text below' },
        { value: 'agent', label: 'Let an agent answer the question first' },
      ],
      default: 'text',
      required: true,
    },
    {
      kind: 'textarea',
      name: 'answer',
      label: 'Answer text',
      minLength: 0,
      maxLength: 5000,
      rows: 4,
      default: answer,
      required: false,
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model (live, agent answer only)',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: { rubricId: 'workflow-steps', answerSource: 'text', answer, modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'The example answer covers two of the three key points (fixed order, input and output schemas) and every sentence is on topic: score = clamp(0.6 × 0.6667 + 0.4 × 1 − 0 − 0, 0, 1) = 0.8, which passes the 0.7 threshold. The missing point is “then passes one step’s output to the next step”. All 12 golden fixtures pass, and each reference answer scores 1.',
    example: {
      scoreCard: { score: 0.8, passed: true, formula: 'clamp(0.6 × 0.6667 + 0.4 × 1 − 0 − 0, 0, 1) = 0.8' },
      determinism: { identical: true },
    },
  },
  guide: {
    procedure: [
      'Open scorer.ts in the Source tab and find the four createScorer steps.',
      'Run the example and read the score card: which sentence covered each key point, and what is missing?',
      'Add a sentence that covers the missing point (“With then, the output of one step becomes the input of the next step.”) and run again.',
      'Add an off-topic sentence: how does relevance change, and by how much does the score drop?',
      'Add “Steps can also run in a random order.”: which criterion catches it?',
      'Clear the answer and run: what does the scorer return instead of a score?',
      'Switch to “Let an agent answer” and compare the agent’s score with your own answer’s.',
    ],
    prediction: 'If you add one off-topic sentence to the example answer, what will the score be?',
    hints: [
      { level: 1, text: 'Completeness does not change; relevance becomes 2/3.' },
      { level: 2, text: '0.6 × 0.6667 + 0.4 × 0.6667.' },
      { level: 3, text: '0.6667: it now fails the 0.7 threshold.' },
    ],
    commonMistakes: [
      { mistake: 'Returning only a number.', fix: 'Return the evidence and the formula, so the score can be checked.' },
      {
        mistake: 'Matching single keywords for a key point.',
        fix: 'Match phrases with aliases, and record the sentence that matched.',
      },
      { mistake: 'Scoring an empty answer as 0.', fix: 'Return notScorable: “no answer” is not the same as “a wrong answer”.' },
      {
        mistake: 'Trusting a new scorer without tests.',
        fix: 'Pin hand-computed scores in golden fixtures, including the reference answer.',
      },
      { mistake: 'Letting penalties hide in the total.', fix: 'Show each penalty as its own negative contribution.' },
    ],
    challenge: {
      prompt:
        'Add an “order” criterion to the workflow-steps rubric that rewards answers whose key points appear in the reference’s order, and add two golden fixtures for it.',
      successCriteria: ['A new criterion with a weight', 'The reference still scores 1', 'Both new fixtures pass'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Which createScorer step should declare an answer not scorable?',
      choices: ['generateReason', 'preprocess', 'generateScore', 'None; return 0'],
      correctIndex: 1,
      explanation: 'preprocess can return notScorable(reason), which stops the run with no score.',
    },
    {
      id: 'q2',
      prompt: 'An answer covers 3 of 4 key points and 2 of its 4 sentences are on topic. What is its score?',
      choices: ['0.55', '0.65', '0.75', '0.6'],
      correctIndex: 1,
      explanation: '0.6 × 0.75 + 0.4 × 0.5 = 0.65.',
    },
    {
      id: 'q3',
      prompt: 'Why must each rubric’s reference answer score 1?',
      choices: [
        'It is required by Mastra',
        'It proves the rubric matches its own expected output',
        'It makes the scorer faster',
        'It is not required',
      ],
      correctIndex: 1,
      explanation: 'A rubric that marks down its own expected output is wrong.',
    },
    {
      id: 'q4',
      prompt: 'What makes this scorer deterministic?',
      choices: ['A fixed temperature', 'Every step is code, with no model call or randomness', 'Caching', 'Golden fixtures'],
      correctIndex: 1,
      explanation: 'Fixtures test it; code makes it deterministic.',
    },
  ],
  sourceFiles: [
    { path: 'scorer.ts', title: 'Rubric scorer', description: 'createScorer steps, the arithmetic and the score card.' },
    { path: 'rubrics.ts', title: 'Rubrics', description: 'Questions, expected outputs, key points, topic terms and penalties.' },
    { path: 'golden.ts', title: 'Golden fixtures', description: 'Hand-computed scores and the fixture runner.' },
    { path: 'text.ts', title: 'Text helpers', description: 'Tokens, stemming, sentences and phrase matching.' },
    { path: 'run.ts', title: 'Lab run', description: 'Answer source, determinism check and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, write a createScorer scorer for one of your own agent tasks with a rubric of at least three key points, return notScorable for empty outputs, and add golden fixtures for a perfect, a partial and an off-topic output.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'scorer-fixtures-pass', label: 'Every golden scorer fixture returns its expected score, pass flag and missing points' },
    {
      id: 'rationale-exposed',
      label: 'The score exposes its rationale: criteria, evidence, missing points and a formula that adds up',
    },
    { id: 'deterministic', label: 'Scoring the same answer twice gives the same score and reason' },
    { id: 'reference-scores-full', label: 'Each rubric’s expected output (reference answer) scores 1 and passes' },
    { id: 'not-scorable-handled', label: 'An answer that cannot be scored gets no score, only a reason' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'What a scorer is', minutes: 1, talkingPoints: ['Score and reason', 'createScorer steps'] },
      {
        title: 'Rubric and expected output',
        minutes: 1.5,
        talkingPoints: ['Key points with aliases', 'Topic terms', 'Known-wrong claims'],
      },
      { title: 'The arithmetic', minutes: 1.5, talkingPoints: ['Weights', 'Penalties', 'Clamp and rounding'] },
      { title: 'Rationale', minutes: 1.5, talkingPoints: ['Evidence sentences', 'Missing points', 'The formula'] },
      { title: 'Testing scorers', minutes: 1.5, talkingPoints: ['Golden fixtures', 'Reference scores 1', 'notScorable'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 3 },
    costNotice:
      'Scoring never calls a model. Live only applies when an agent writes the answer (one agent run of up to 3 steps).',
  },
  tags: ['evals', 'scorers', 'rubrics', 'determinism', 'fixtures'],
} satisfies LabDefinitionInput;
