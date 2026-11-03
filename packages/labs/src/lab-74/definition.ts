import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import { GATE_NAMES } from './gates.js';

export const lab74Definition = {
  id: 'lab-74',
  number: 74,
  title: 'Production regression suite',
  moduleId: 'module-15',
  summary:
    'Turn quality into release gates: security, load, eval scores, traces, workflow recovery and accessibility, each with a written threshold, a recorded baseline and evidence, so a regression stops the release.',
  concept:
    'Tests tell you whether code works; release gates tell you whether this build may ship. ' +
    'This platform has six gates, written down in regression/gates.json with their thresholds and in regression/baseline.json with their recorded baselines. ' +
    'Security fails on any high or critical advisory in production dependencies unless it is on a reviewed allowlist with an expiry date, and on HTTP checks such as cookie flags and cross-origin refusal. ' +
    'Load-smoke drives the real built server: health latency must stay low, every run must finish, and overload must answer 429, never 500. ' +
    'Eval-regression replays the L57 golden scorer fixtures and the L58 Mastra experiment; tracing compares the shape of an L56 trace with its baseline; workflow-recovery runs the real two-process restart tests; accessibility runs axe on every lab page. ' +
    'npm run regression measures all of it, records the evidence with the commit, and exits with a failure so CI blocks the release. ' +
    'A gate you never saw fail is not trusted, so every gate can be given an injected regression to prove that it fails. ' +
    'In this lab you evaluate the recorded evidence with your own thresholds, inject regressions, and measure the eval and tracing gates fresh.',
  objectives: [
    'Explain what each release gate protects and what makes it fail',
    'Set thresholds and see how they change a gate’s result',
    'Prove that a gate fails when a regression is injected',
    'Read and record regression evidence tied to a commit',
  ],
  prerequisites: ['lab-73'],
  inputs: [
    {
      kind: 'number',
      name: 'healthP95Ms',
      label: 'Load: health p95 limit (ms)',
      min: 10,
      max: 1_000,
      step: 5,
      default: 100,
      required: true,
    },
    {
      kind: 'number',
      name: 'runP95Ms',
      label: 'Load: run completion p95 limit (ms)',
      min: 500,
      max: 20_000,
      step: 100,
      default: 5_000,
      required: true,
    },
    {
      kind: 'number',
      name: 'maxSerious',
      label: 'Accessibility: serious violations allowed',
      min: 0,
      max: 5,
      step: 1,
      default: 0,
      required: true,
    },
    {
      kind: 'select',
      name: 'inject',
      label: 'Inject a regression into',
      default: 'none',
      options: [{ value: 'none', label: 'Nothing (evaluate as recorded)' }, ...GATE_NAMES.map((g) => ({ value: g, label: g }))],
    },
    { kind: 'boolean', name: 'measureFresh', label: 'Measure the eval and tracing gates fresh in this run', default: true },
    {
      kind: 'number',
      name: 'liveThreshold',
      label: 'Live: answer quality threshold (0–1)',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.7,
      required: true,
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Live model',
      default: 'openai/gpt-5-mini',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
    },
  ],
  exampleInput: {
    healthP95Ms: 100,
    runP95Ms: 5_000,
    maxSerious: 0,
    inject: 'eval-regression',
    measureFresh: true,
    liveThreshold: 0.7,
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'Five gates pass on the recorded evidence; the injected eval regression fails the eval-regression gate with a finding naming the golden fixture; the fresh eval and tracing measurement matches the baseline.',
    example: { injected: 'eval-regression' },
  },
  guide: {
    procedure: [
      'Run the example: eval-regression fails because one golden fixture was flipped; the other five gates keep their results.',
      'Set inject to “nothing”: all six gates pass on the recorded evidence.',
      'Lower the health p95 limit below the recorded p95 (see load-smoke metrics): the load gate fails on your threshold, not on new data.',
      'Inject each gate in turn and read its finding.',
      'Open regression/REPORT.md and regression/evidence/latest.json in the repository: find the commit and every metric.',
      'Read regression/gates.json: find the advisory allowlist, its reasons and expiry dates.',
      'In live mode, a real model answers an L57 rubric question and the answer must reach your threshold.',
    ],
    prediction: 'If you raise the allowed serious accessibility violations to 5, what does that say about your release process?',
    hints: [
      {
        level: 1,
        text: 'A gate is a measurement plus a written threshold or baseline; change either and the result can change.',
      },
      {
        level: 2,
        text: 'Injection modifies the measurements just before evaluation, so you can see a gate fail without breaking the code.',
      },
      {
        level: 3,
        text: 'evaluateAll(measurements, gates.json, baseline.json) is the same call npm run regression makes; the lab passes your thresholds in.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Raising a threshold until the build passes.',
        fix: 'Fix the regression, or change the threshold in a reviewed commit with a reason.',
      },
      {
        mistake: 'Ignoring audit findings forever.',
        fix: 'Allowlist with a written exposure assessment and an expiry date; an expired entry fails the gate.',
      },
      {
        mistake: 'Load tests that treat 429 as an error.',
        fix: 'A concurrency limit is a feature: retry 429 with backoff and fail on 5xx or lost runs.',
      },
      { mistake: 'Gates nobody has seen fail.', fix: 'Inject a regression into each gate once and keep the evidence.' },
      {
        mistake: 'Running npm audit fix blindly.',
        fix: 'It can move pinned frameworks; patch transitive packages within their ranges and re-run every test.',
      },
    ],
    challenge: {
      prompt:
        'Add a seventh gate, bundle-size: the web app’s largest JavaScript chunk must stay within 10% of its recorded baseline.',
      successCriteria: [
        'The baseline is recorded in regression/baseline.json',
        'An injected 20% growth fails the gate',
        'The finding names the chunk and both sizes',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'A new high-severity advisory appears in a production dependency. What does the security gate do?',
      choices: [
        'Nothing',
        'Fails, unless the advisory is allowlisted with a reason and an unexpired date',
        'Runs npm audit fix',
        'Warns only',
      ],
      correctIndex: 1,
      explanation: 'Unreviewed risk blocks the release; reviewed risk is documented and expires.',
    },
    {
      id: 'q2',
      prompt: 'The load test sees 429 answers while 24 runs compete for 4 slots. Is that a failure?',
      choices: [
        'Yes, any non-200 is a failure',
        'No: overload must answer 429; a 5xx or a lost run is the failure',
        'Only above 10%',
        'It means the test is broken',
      ],
      correctIndex: 1,
      explanation: 'The gate retries 429 like a good client and requires every run to finish.',
    },
    {
      id: 'q3',
      prompt: 'Why compare a trace’s span signature with a baseline?',
      choices: [
        'To check speed',
        'Missing or new spans show that instrumentation or the pipeline shape changed',
        'To count tokens',
        'Traces are random',
      ],
      correctIndex: 1,
      explanation: 'Durations differ per run; the shape should not.',
    },
    {
      id: 'q4',
      prompt: 'What proves a gate actually works?',
      choices: ['A green CI badge', 'Seeing it fail on an injected regression', 'A high threshold', 'Running it twice'],
      correctIndex: 1,
      explanation: 'A gate that never failed may not be measuring anything.',
    },
  ],
  sourceFiles: [
    { path: 'gates.ts', title: 'Gate evaluators', description: 'Thresholds, baselines, findings and injection.' },
    { path: 'measure.ts', title: 'Fresh measurements', description: 'L57 golden, L58 experiment and L56 trace in-process.' },
    { path: 'run.ts', title: 'Lab run', description: 'Recorded evidence, learner thresholds and the live answer gate.' },
  ],
  exercise: {
    instructions: 'Inject each gate once and explain the finding; then design the bundle-size challenge.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'evidence-recorded', label: 'The gates are evaluated on recorded evidence from a real regression run' },
    { id: 'injected-gate-fails', label: 'An injected regression fails its gate' },
    { id: 'other-gates-unaffected', label: 'Every other gate keeps its result' },
    { id: 'fresh-matches-baseline', label: 'A fresh measurement reproduces the eval and tracing baselines' },
    { id: 'live-answer-quality', label: 'Live: a real model’s answer meets the quality threshold' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Tests vs gates', minutes: 1, talkingPoints: ['Written thresholds', 'Evidence per commit'] },
      {
        title: 'The six gates',
        minutes: 2,
        talkingPoints: ['Security allowlist with expiry', 'Load and 429', 'Eval, tracing, recovery, a11y'],
      },
      { title: 'Make them fail', minutes: 2, talkingPoints: ['Inject a regression', 'Read the finding', 'Thresholds vs data'] },
      { title: 'In CI', minutes: 1, talkingPoints: ['npm run regression', 'Evidence artifact'] },
      { title: 'Try it', minutes: 1, talkingPoints: ['Inject every gate', 'Live answer quality'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 180_000,
    budget: { maxSteps: 3, maxToolCalls: 2 },
    costNotice: 'Offline is free. Live mode makes one short agent answer (up to 3 steps), usually well under a cent.',
  },
  tags: ['regression', 'ci', 'security', 'load', 'evals', 'tracing', 'accessibility'],
} satisfies LabDefinitionInput;
