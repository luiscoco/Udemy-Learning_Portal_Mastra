import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab60Definition = {
  id: 'lab-60',
  number: 60,
  title: 'Quality dashboard',
  moduleId: 'module-12',
  summary:
    'Build a quality dashboard from stored evaluation runs: pass-rate history, regressions since the last run, latency percentiles and trace links that open each scenario’s stored trace, with empty states that still guide you before the first run.',
  concept:
    'A dashboard turns individual evaluation runs into a trend: is quality improving, what broke since the last run, how slow is the tail, and what happened in a failing case. ' +
    'Here every number is derived from storage: the dataset’s experiments give the run history, the scores domain gives each scenario’s pass or fail with the failed assertions in the reason, and the experiment results give each scenario’s duration and trace id. ' +
    'Recording a run is one more experiment of an L59 configuration over the L58 dataset; observability with MastraStorageExporter writes each scenario’s trace to the same store. ' +
    'A regression is a scenario that passed in the previous run and fails in the latest one, and latency is reported as nearest-rank p50, p95 and p99, because averages hide the slow tail. ' +
    'A trace link is only real if the trace can be fetched again later, so the dashboard reads each linked trace back from storage with getTrace and shows its spans in the L56 span tree. ' +
    'Empty states are part of the design: before the first run there is nothing to measure, so the dashboard says why and what to do next instead of showing zeros, and with a single run it says that regressions need two.',
  objectives: [
    'Derive pass rate, regressions and latency percentiles from stored runs',
    'Store traces with the runs and link each scenario to its trace',
    'Design empty states that explain what is missing',
    'Verify that a dashboard rebuilds identically from storage',
  ],
  prerequisites: ['lab-59'],
  inputs: [
    {
      kind: 'select',
      name: 'action',
      label: 'Action',
      options: [
        { value: 'record-and-show', label: 'Record a run, then show the dashboard' },
        { value: 'show-only', label: 'Show the dashboard only' },
      ],
      default: 'record-and-show',
      required: true,
    },
    {
      kind: 'select',
      name: 'configId',
      label: 'Configuration for the recorded run',
      options: [
        { value: 'grounded', label: 'Grounded (search, two sources)' },
        { value: 'concise', label: 'Concise (search, one sentence)' },
        { value: 'no-tools', label: 'No tools (answers from memory)' },
      ],
      default: 'grounded',
      required: true,
    },
    {
      kind: 'select',
      name: 'store',
      label: 'Store',
      options: [
        { value: 'course', label: 'Course runs' },
        { value: 'empty-demo', label: 'Empty demo store (never written)' },
      ],
      default: 'course',
      required: true,
    },
    { kind: 'number', name: 'window', label: 'Runs shown', min: 1, max: 20, step: 1, default: 10, required: true },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model (live)',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: { action: 'record-and-show', configId: 'grounded', store: 'course', window: 10, modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'A grounded run of the four course-faq scenarios is recorded and the dashboard is built from storage: the latest pass rate (0.75 on the mock provider), its change against the previous run when there is one, latency p50/p95/p99, regressions (or “needs two runs” on the first run), and a trace link for every scenario that opens its stored spans. Record a no-tools run next to see two regressions.',
    example: {
      action: 'record-and-show',
      rebuildIdentical: true,
      dashboard: { datasetId: 'course-faq', empty: { isEmpty: false } },
    },
  },
  guide: {
    procedure: [
      'Choose the empty demo store with “Show the dashboard only” and run: what does the dashboard say, and which KPIs are shown?',
      'Run the example on the course store: what does the regressions panel say after the first run?',
      'Record a no-tools run: which scenarios regressed, and what are their failed assertions?',
      'Open the trace of a regressed scenario: which spans does it contain, and how long did the model take?',
      'Record a grounded run again: how does the pass-rate delta change sign?',
      'Open dashboard.ts in the Source tab and find where each number is read from storage.',
    ],
    prediction: 'After a grounded run followed by a no-tools run, how many regressions will the dashboard show?',
    hints: [
      { level: 1, text: 'Grounded passes three scenarios on the mock provider.' },
      { level: 2, text: 'No-tools still passes the out-of-scope scenario.' },
      { level: 3, text: 'Two: workflow-steps and tool-validation passed with grounded and fail with no-tools.' },
    ],
    commonMistakes: [
      {
        mistake: 'Showing 0% before any run.',
        fix: 'Show an empty state with the reason and the next action; no data is not 0%.',
      },
      {
        mistake: 'Linking to traces that are only in memory.',
        fix: 'Store traces with the runs (MastraStorageExporter) and read them back by trace id.',
      },
      { mistake: 'Reporting only the average latency.', fix: 'Show p50, p95 and p99; the tail is what users feel.' },
      {
        mistake: 'Calling every failure a regression.',
        fix: 'A regression passed before and fails now; a scenario that always failed is not one.',
      },
      {
        mistake: 'Computing dashboard numbers in the browser from cached results.',
        fix: 'Derive them from storage so they can be rebuilt and checked.',
      },
    ],
    challenge: {
      prompt:
        'Add a “flaky” panel that lists scenarios whose outcome changed in more than half of the shown runs, with a trace link for the latest failure.',
      successCriteria: [
        'Derived from stored runs only',
        'Empty when fewer than three runs exist, with the reason',
        'Each entry links to a stored trace',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Where do the dashboard’s per-scenario pass and fail come from?',
      choices: [
        'The browser cache',
        'The stored scenario-assertions scores of each experiment',
        'The model’s answer text',
        'The trace spans',
      ],
      correctIndex: 1,
      explanation: 'listScoresByRunId returns each scenario’s stored score and reason.',
    },
    {
      id: 'q2',
      prompt: 'What makes a trace link survive a restart?',
      choices: [
        'Keeping the run in memory',
        'Storing the spans with MastraStorageExporter and reading them by trace id',
        'Logging the trace id',
        'Nothing can',
      ],
      correctIndex: 1,
      explanation: 'The link is the trace id; the spans live in storage next to the runs.',
    },
    {
      id: 'q3',
      prompt: 'There are no runs yet. What should the pass-rate tile show?',
      choices: ['0%', '100%', 'No value, with an explanation and the next action', 'The previous course’s value'],
      correctIndex: 2,
      explanation: 'Missing data is not a zero.',
    },
    {
      id: 'q4',
      prompt: 'Why show p95 and p99 latency?',
      choices: ['They are smaller', 'The slow tail is hidden by the average', 'Mastra requires them', 'They are reproducible'],
      correctIndex: 1,
      explanation: 'Percentiles show how slow the worst cases are.',
    },
  ],
  sourceFiles: [
    {
      path: 'dashboard.ts',
      title: 'Dashboard from storage',
      description: 'Reading runs, scores, results and traces; KPIs, regressions, percentiles and empty states.',
    },
    {
      path: 'run.ts',
      title: 'Recording and checks',
      description: 'Stored traces, recording a run, rebuilding the dashboard and the checks.',
    },
  ],
  exercise: {
    instructions:
      'In your project, store your evaluation runs and their traces in one Mastra storage, then build a small report that shows the latest pass rate, the regressions since the previous run with their trace ids, and a clear message when no run exists yet.',
    solutionFile: 'solution.md',
  },
  checks: [
    {
      id: 'metrics-from-fixtures',
      label: 'Every dashboard number is derived from stored runs of the dataset (rebuilt identically from storage)',
    },
    { id: 'regressions-detected', label: 'Regressions are the scenarios that passed in the previous run and fail in the latest' },
    { id: 'latency-percentiles', label: 'Each run shows nearest-rank latency p50 ≤ p95 ≤ p99 from its stored item durations' },
    { id: 'trace-links-resolve', label: 'Every linked trace is read back from storage with its root span' },
    { id: 'empty-state-usable', label: 'Without data the dashboard says why and what to do, with no invented numbers' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'From runs to trends', minutes: 1, talkingPoints: ['History, KPIs, regressions'] },
      {
        title: 'Everything from storage',
        minutes: 1.5,
        talkingPoints: ['Experiments, scores, results', 'Rebuilding identically'],
      },
      { title: 'Regressions and latency', minutes: 1.5, talkingPoints: ['Passed then failed', 'p50 / p95 / p99'] },
      { title: 'Trace links', minutes: 1.5, talkingPoints: ['MastraStorageExporter', 'getTrace by id', 'Span tree'] },
      { title: 'Empty states', minutes: 1.5, talkingPoints: ['No dataset, no runs, one run', 'Module wrap-up'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 180_000,
    maxTimeoutMs: 300_000,
    budget: { maxSteps: 3 },
    costNotice:
      'Offline is free (mock provider). Live, “Record a run” runs the chosen configuration over four scenarios (up to 3 steps each) on your provider key; “Show the dashboard only” makes no model call.',
  },
  tags: ['evals', 'dashboard', 'regressions', 'latency', 'traces'],
} satisfies LabDefinitionInput;
