import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab58Definition = {
  id: 'lab-58',
  number: 58,
  title: 'Evaluation dataset',
  moduleId: 'module-12',
  summary:
    'Store versioned evaluation scenarios (inputs and expected assertions) in a Mastra dataset, and run an agent over a chosen version with Mastra experiments and deterministic scorers, offline on the mock provider or live.',
  concept:
    'An evaluation dataset is a list of scenarios: an input, and what a good result must satisfy. ' +
    'Mastra has native datasets: mastra.datasets creates and loads them, and each Dataset keeps items, versions, every item’s history and the experiments run against it, stored here in LibSQL so they survive restarts. ' +
    'Every added or updated item creates a new dataset version, and an experiment can be pinned to an older version to reproduce or compare results. ' +
    'This lab keeps the dataset’s history as checked-in seed revisions, applied once each: re-adding an item with the same externalId and payload is a no-op, a change goes through updateItem, and the metadata records which revision produced which version. ' +
    'Each scenario’s groundTruth holds its expected assertions: an L57 rubric with a minimum score, phrases the answer must mention and phrases it must not. ' +
    'The runner is dataset.startExperiment(): it runs the FAQ agent on every item of the chosen version and scores each answer with the L57 rubric scorer, an assertions scorer that explains every assertion, and a provenance scorer that records which model provider answered. ' +
    'Offline the agent runs on the mock provider (offline-sim), so the whole dataset runs in CI without an external LLM, and the provenance of every answer proves it. ' +
    'A replay of the same version on the mock provider must give the same outcomes.',
  objectives: [
    'Create a Mastra dataset with scenarios, inputs and expected assertions',
    'Version a dataset with idempotent seed revisions',
    'Run an agent over a pinned version with dataset experiments and scorers',
    'Run the whole dataset offline on the mock provider, reproducibly',
  ],
  prerequisites: ['lab-57'],
  inputs: [
    {
      kind: 'select',
      name: 'revision',
      label: 'Dataset revision to run',
      options: [
        { value: 'latest', label: 'Latest' },
        { value: '1', label: 'Revision 1 (three questions)' },
        { value: '2', label: 'Revision 2 (adds out-of-scope, tightens tool validation)' },
      ],
      default: 'latest',
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
  exampleInput: { revision: 'latest', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'The dataset course-faq exists with versions for revision 1 (version 3) and revision 2 (version 5). The experiment runs the four scenarios of the latest version on the mock provider (every answer is marked offline-sim): three pass, and suspend-resume fails its “Mentions resume” assertion because the scripted answer quotes only the first sentence of the suspend source. The experiment is recorded with version 5, and the offline replay matches.',
    example: {
      seed: { reseedApplied: 0 },
      requestedVersion: 5,
      evalReport: {
        dataset: { id: 'course-faq', seedRevision: 2, revisionVersions: { '1': 3, '2': 5 } },
        experiment: { datasetVersion: 5, revision: 2, provider: 'offline-sim' },
        summary: { total: 4, passed: 3, failed: 1, passRate: 0.75 },
      },
    },
  },
  guide: {
    procedure: [
      'Open scenarios.ts in the Source tab: find the two seed revisions and the assertions of each scenario.',
      'Run the example. In the report, which version ran, and which scenarios failed which assertions?',
      'Run again: what does the seed step report this time, and did the dataset version change?',
      'Choose Revision 1 and run: how many scenarios run, and what is the tool-validation minimum score now?',
      'Open run.ts and find the startExperiment call: which options pin the version and choose the scorers?',
      'In live mode, run the latest revision and compare the pass rate with the offline run.',
    ],
    prediction: 'If you run the latest revision twice, will the dataset version change between the runs?',
    hints: [
      { level: 1, text: 'Versions change only when items change.' },
      { level: 2, text: 'The second run finds seedRevision 2 in the metadata.' },
      { level: 3, text: 'No: no seed operation is applied, so the version stays 5.' },
    ],
    commonMistakes: [
      {
        mistake: 'Editing scenarios in place without versions.',
        fix: 'Change them through the dataset so a new version is created and old runs stay comparable.',
      },
      {
        mistake: 'Running evaluations only against a live model.',
        fix: 'Run them on a mock provider in CI, and live when you need real quality numbers.',
      },
      {
        mistake: 'Re-adding a changed scenario under the same externalId.',
        fix: 'Mastra refuses it; use updateItem for changes.',
      },
      {
        mistake: 'Storing only a score per scenario.',
        fix: 'Store the assertions and explain each one, so a failure says what was wrong.',
      },
      {
        mistake: 'Comparing results from different dataset versions.',
        fix: 'Pin the experiment to a version and record it with the results.',
      },
    ],
    challenge: {
      prompt:
        'Add a revision 3 that adds a scenario about memory with its own assertions, and run revision 2 and revision 3 to show both versions side by side.',
      successCriteria: ['seedRevision becomes 3 once', 'Revision 2 still runs four scenarios', 'Revision 3 runs five'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What creates a new dataset version in Mastra?',
      choices: ['Every experiment', 'Adding or updating an item', 'Updating the dataset metadata', 'Restarting the server'],
      correctIndex: 1,
      explanation: 'Item mutations create versions; metadata updates do not.',
    },
    {
      id: 'q2',
      prompt: 'Why can the dataset run in CI without an API key?',
      choices: [
        'It caches answers',
        'The agent runs on the scripted mock provider offline',
        'Scorers call no model',
        'Experiments skip the agent',
      ],
      correctIndex: 1,
      explanation: 'The mock provider answers; the deterministic scorers call no model either.',
    },
    {
      id: 'q3',
      prompt: 'How do you rerun an experiment exactly as it was before a scenario changed?',
      choices: [
        'Restore a backup',
        'Pin startExperiment to the older dataset version',
        'Delete the new item',
        'It is impossible',
      ],
      correctIndex: 1,
      explanation: 'Versions keep every item’s content as it was.',
    },
    {
      id: 'q4',
      prompt: 'Where are a scenario’s expected assertions stored?',
      choices: ['In the agent instructions', 'In the item’s groundTruth', 'In the scorer’s id', 'In the experiment name'],
      correctIndex: 1,
      explanation: 'groundTruth travels with the item to every scorer.',
    },
  ],
  sourceFiles: [
    {
      path: 'scenarios.ts',
      title: 'Scenarios and revisions',
      description: 'Inputs, expected assertions and the seed revisions.',
    },
    { path: 'dataset.ts', title: 'Dataset', description: 'Idempotent seeding and version bookkeeping.' },
    { path: 'scorers.ts', title: 'Scorers', description: 'Rubric adapter for agent messages and the assertions scorer.' },
    { path: 'run.ts', title: 'Runner', description: 'Storage, experiments, replay and checks.' },
    { path: 'agent.ts', title: 'FAQ agent', description: 'Instructions and the mock-provider script.' },
  ],
  exercise: {
    instructions:
      'In your project, create a Mastra dataset for one of your agents with at least three items whose groundTruth holds expected assertions, add a scorer for them, run dataset.startExperiment against the agent on a mock model, then change one item and rerun the old version.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'dataset-versioned', label: 'The dataset is stored with one version per seed revision, and reseeding is a no-op' },
    { id: 'version-pinned', label: 'The experiment ran on the requested dataset version and its scenarios' },
    {
      id: 'runs-on-mock-provider',
      label: 'Offline, every answer comes from the mock provider (no external LLM); live, from a real provider',
    },
    {
      id: 'assertions-evaluated',
      label: 'Every scenario is scored by the rubric and assertions scorers, with each assertion explained',
    },
    { id: 'experiment-recorded', label: 'The experiment is recorded in the dataset with its version' },
    { id: 'reproducible', label: 'Replaying the same version on the mock provider gives the same per-scenario outcomes' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Why datasets', minutes: 1, talkingPoints: ['Scenarios and assertions', 'From one score to a suite'] },
      {
        title: 'Mastra datasets',
        minutes: 1.5,
        talkingPoints: ['mastra.datasets', 'Items, groundTruth, externalId', 'LibSQL storage'],
      },
      { title: 'Versions', minutes: 1.5, talkingPoints: ['Item mutations create versions', 'Seed revisions', 'Pinning'] },
      { title: 'Experiments', minutes: 1.5, talkingPoints: ['startExperiment', 'Scorers on agent messages', 'listExperiments'] },
      { title: 'Without an LLM', minutes: 1.5, talkingPoints: ['Mock provider in CI', 'Replays', 'Next: comparing experiments'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 180_000,
    maxTimeoutMs: 300_000,
    budget: { maxSteps: 3 },
    costNotice:
      'Offline is free (the mock provider answers; scorers never call a model). Live runs the FAQ agent once per scenario (four at the latest revision, up to 3 steps each) on your provider key; the reproducibility replay always uses the mock provider.',
  },
  tags: ['evals', 'datasets', 'experiments', 'versioning', 'mock-provider'],
} satisfies LabDefinitionInput;
