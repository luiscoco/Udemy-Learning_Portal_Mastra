import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab59Definition = {
  id: 'lab-59',
  number: 59,
  title: 'Compare experiments',
  moduleId: 'module-12',
  summary:
    'Run several agent configurations as Mastra experiments on the same dataset version and compare pass rate, score, tokens, latency and (only when the provider reports it) cost against a baseline, reproducibly, with JSON and CSV exports.',
  concept:
    'A configuration is everything that shapes an answer: the instructions, the tools, the model. Comparing configurations means running each one on the same dataset version, so the only difference is the configuration itself. ' +
    'Here each configuration is a registered agent (grounded with search, concise, no tools, and optionally the grounded agent on a second model), and each one runs as its own Mastra experiment over the L58 dataset with the same deterministic scorers. ' +
    'Mastra’s compareExperiments lines the stored results up per scenario; the aggregates are computed in code: pass rate, mean rubric score, token counts from each answer’s usage, and latency p50 and p95 from each scenario’s start and end times. ' +
    'Every number says where it comes from: on the mock provider token counts are simulated, live they are the provider’s, and latency changes from run to run. ' +
    'Cost is the easiest number to fabricate. The experiment results contain no cost, and Mastra’s estimatedCost is computed from a price table, so this lab shows a cost only when the provider itself reports one in usage, and otherwise says that it was not reported. ' +
    'Deltas compare each configuration with the baseline, and the per-scenario matrix shows exactly which scenarios regressed or improved. ' +
    'A comparison you cannot reproduce or share is weak evidence: the lab rebuilds it from storage, replays every configuration on the mock provider, and exports it as a self-describing JSON document and a CSV.',
  objectives: [
    'Run several configurations as experiments on one dataset version',
    'Aggregate pass rate, score, tokens and latency, each with its source',
    'Report cost only when the provider supplies it',
    'Reproduce and export a comparison against a baseline',
  ],
  prerequisites: ['lab-58'],
  inputs: [
    {
      kind: 'select',
      name: 'baseline',
      label: 'Baseline configuration',
      options: [
        { value: 'grounded', label: 'Grounded (search, two sources)' },
        { value: 'concise', label: 'Concise (search, one sentence)' },
        { value: 'no-tools', label: 'No tools (answers from memory)' },
      ],
      default: 'grounded',
      required: true,
    },
    { kind: 'boolean', name: 'includeConcise', label: 'Include the concise configuration', default: true },
    { kind: 'boolean', name: 'includeNoTools', label: 'Include the no-tools configuration', default: true },
    {
      kind: 'select',
      name: 'altModelId',
      label: 'Alternative model for the grounded configuration (live)',
      options: [{ value: 'none', label: 'None' }, ...DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id }))],
      default: 'none',
      required: true,
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model (live)',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: {
    baseline: 'grounded',
    includeConcise: true,
    includeNoTools: true,
    altModelId: 'none',
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'Three experiments run on dataset version 5. On the mock provider grounded passes 3 of 4 scenarios, concise fewer (one sentence misses key points) and no-tools passes only the out-of-scope scenario; the deltas and the per-scenario matrix show the regressions. Tokens are labelled simulated, every cost is “not reported by the provider”, the rebuilt comparison and the replay are identical, and the JSON and CSV exports parse back.',
    example: {
      selected: ['grounded', 'concise', 'no-tools'],
      reproducibility: { storageRebuildIdentical: true, replayIdentical: true },
      comparison: { datasetVersion: 5, baselineConfigId: 'grounded' },
    },
  },
  guide: {
    procedure: [
      'Open configs.ts in the Source tab: what differs between the three configurations?',
      'Run the example and read the comparison: which configuration has the best pass rate, and which scenarios regressed against the baseline?',
      'Look at the token and cost columns: where does each number come from?',
      'Choose No tools as the baseline and run again: how do the deltas change sign?',
      'Download the CSV and open it in a spreadsheet; download the JSON and find the metric definitions.',
      'In live mode, add an alternative model and compare the two grounded runs.',
    ],
    prediction: 'Will the no-tools configuration pass the out-of-scope scenario?',
    hints: [
      { level: 1, text: 'That scenario does not need the search tool.' },
      { level: 2, text: 'Its assertions only check for the refusal and the absence of “Paris”.' },
      { level: 3, text: 'Yes: refusing needs no tool, so no-tools passes it while failing the three course questions.' },
    ],
    commonMistakes: [
      {
        mistake: 'Comparing experiments run on different dataset versions.',
        fix: 'Pin every configuration to the same version.',
      },
      {
        mistake: 'Showing an estimated cost as if it were billed.',
        fix: 'Show cost only when the provider reports it, and say when it does not.',
      },
      { mistake: 'Treating simulated token counts as real usage.', fix: 'Label the source of every metric.' },
      {
        mistake: 'Judging configurations on latency from a single run.',
        fix: 'Report percentiles and remember latency is not reproducible.',
      },
      {
        mistake: 'Sharing a screenshot instead of the data.',
        fix: 'Export a self-describing JSON and a CSV with the experiment ids.',
      },
    ],
    challenge: {
      prompt:
        'Add a “long” configuration that answers from three sources, include it in the comparison and decide, with the exported CSV, whether it is worth its extra tokens.',
      successCriteria: [
        'A fourth configuration in the comparison',
        'Its token delta against grounded',
        'A decision backed by pass rate and tokens',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Why must every configuration run on the same dataset version?',
      choices: ['It is faster', 'So the configuration is the only difference', 'Mastra requires it', 'To save tokens'],
      correctIndex: 1,
      explanation: 'Different versions would mix dataset changes into the comparison.',
    },
    {
      id: 'q2',
      prompt: 'What does compareExperiments return?',
      choices: ['Aggregated pass rates', 'Per-scenario outputs and scores for each experiment', 'A cost report', 'A chart'],
      correctIndex: 1,
      explanation: 'Aggregates are computed by the app.',
    },
    {
      id: 'q3',
      prompt: 'The provider reports no cost. What should the comparison show?',
      choices: ['A price-table estimate', 'Zero', 'No cost, with the reason', 'The token count'],
      correctIndex: 2,
      explanation: 'An unreported cost is unknown, not zero and not an estimate.',
    },
    {
      id: 'q4',
      prompt: 'Which metric is excluded from the reproducibility check?',
      choices: ['Pass rate', 'Mean score', 'Latency', 'Token counts on the mock provider'],
      correctIndex: 2,
      explanation: 'Latency depends on the machine and the moment.',
    },
  ],
  sourceFiles: [
    { path: 'configs.ts', title: 'Configurations', description: 'Instructions, tools, models and the mock-provider scripts.' },
    { path: 'metrics.ts', title: 'Metrics', description: 'Aggregates, percentiles, the cost rule, deltas and the CSV export.' },
    { path: 'run.ts', title: 'Comparison run', description: 'Experiments, compareExperiments, replays, export and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, run two agent configurations as experiments on the same dataset version, compute pass rate, tokens and latency p95 per configuration from the stored results, and export a CSV that marks cost as not reported unless your provider returns one.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'configs-ran', label: 'Every selected configuration ran as an experiment on the same dataset version' },
    {
      id: 'metrics-measured',
      label: 'Each configuration has a pass rate, mean score, token counts (with their source) and latency percentiles',
    },
    {
      id: 'no-fabricated-cost',
      label: 'Cost is shown only when the provider reported it; otherwise it is empty with the reason',
    },
    {
      id: 'deltas-consistent',
      label: 'Deltas equal each configuration’s metrics minus the baseline’s, and regressions match the per-scenario changes',
    },
    {
      id: 'reproducible',
      label: 'The comparison rebuilt from storage is identical, and a mock-provider replay gives the same deterministic metrics',
    },
    { id: 'exportable', label: 'The comparison exports as JSON and CSV that parse back to the same values' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'What a configuration is', minutes: 1, talkingPoints: ['Instructions, tools, model', 'Same dataset version'] },
      {
        title: 'Running the experiments',
        minutes: 1.5,
        talkingPoints: ['One experiment per configuration', 'compareExperiments'],
      },
      {
        title: 'Honest metrics',
        minutes: 2,
        talkingPoints: ['Pass rate and score', 'Token sources', 'Latency percentiles', 'No fabricated cost'],
      },
      { title: 'Deltas and regressions', minutes: 1.5, talkingPoints: ['Against a baseline', 'Per-scenario changes'] },
      { title: 'Reproduce and export', minutes: 1, talkingPoints: ['Rebuild from storage', 'Mock replay', 'JSON and CSV'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 240_000,
    maxTimeoutMs: 300_000,
    budget: { maxSteps: 3 },
    costNotice:
      'Offline is free (mock provider). Live runs each selected configuration over four scenarios (up to 3 steps each) on your provider key, plus the alternative model when chosen; the reproducibility replays always use the mock provider.',
  },
  tags: ['evals', 'experiments', 'comparison', 'metrics', 'export'],
} satisfies LabDefinitionInput;
