import { liveCheckpointDefinition } from '../shared/live-checkpoint-definition.js';
import type { LabDefinitionInput } from '@mlp/contracts';
import { ENTRY_FILES, LAYER_DIRS } from './inspect.js';

const dirOptions = LAYER_DIRS.map((d) => ({ value: d, label: d }));

export const lab02Definition = liveCheckpointDefinition({
  id: 'lab-02',
  number: 2,
  title: 'Explore project architecture',
  moduleId: 'module-01',
  summary:
    'Map the UI, API, Mastra runtime and Mastra entry point of a real Mastra application, and check how secrets stay on the server.',
  concept:
    'A production Mastra application is more than an agent file: it has a user interface, an HTTP API, and a server-side runtime where Mastra actually runs. ' +
    'The browser must never import Mastra or see API keys, so the UI talks to your own API, and only the API process loads Mastra and reads .env. ' +
    'Mastra itself has one entry point, src/mastra/index.ts, which creates the Mastra instance and registers agents, workflows and tools by name. ' +
    'Root package.json scripts tie the pieces together: dev starts everything locally, build bundles it, and test proves it still works. ' +
    'Environment variables are split by audience: secrets such as OPENAI_API_KEY live in a gitignored .env, and only variables with an explicit public prefix may reach the browser bundle. ' +
    'This platform is itself built that way, so in this lab you inspect its real files instead of reading a diagram. ' +
    'You choose which folder plays each role, and the server checks your answer against evidence it finds in the files, such as a React dependency for the UI or `new Mastra(` for the entry point.',
  objectives: [
    'Identify the UI, API, runtime and Mastra entry point of a Mastra application',
    'Explain why Mastra and API keys must stay on the server',
    'Find where agents are registered and which scripts run the project',
    'Verify .env hygiene: gitignored secrets and a public-only client prefix',
  ],
  prerequisites: ['lab-01'],
  inputs: [
    { kind: 'select', name: 'ui', label: 'Which folder is the UI (browser) layer?', options: dirOptions, required: true },
    { kind: 'select', name: 'api', label: 'Which folder is the HTTP API layer?', options: dirOptions, required: true },
    {
      kind: 'select',
      name: 'runtime',
      label: 'Which folder holds the server-only Mastra runtime?',
      options: dirOptions,
      required: true,
    },
    {
      kind: 'select',
      name: 'mastraEntry',
      label: 'Which file is the Mastra entry point (registers agents)?',
      options: ENTRY_FILES.map((f) => ({ value: f, label: f })),
      required: true,
    },
  ],
  exampleInput: {
    ui: 'apps/web',
    api: 'apps/api',
    runtime: 'packages/mastra-runtime',
    mastraEntry: 'packages/labs/src/lab-01/template/src/mastra/index.ts',
  },
  expectedOutput: {
    description:
      'An inspectFile tool call per file read, three workflow steps, a manifest with workspaces, root scripts, per-layer evidence and agent registration lines, and five passing checks.',
    example: {
      layers: [
        {
          layer: 'ui',
          path: 'apps/web',
          passed: true,
          found: ['package.json depends on react', 'has an index.html page', 'has a Vite config'],
        },
        { layer: 'api', path: 'apps/api', passed: true },
        { layer: 'runtime', path: 'packages/mastra-runtime', passed: true },
        { layer: 'mastraEntry', path: 'packages/labs/src/lab-01/template/src/mastra/index.ts', passed: true },
      ],
      env: { dotenvGitignored: true, clientEnvPrefix: 'VITE_PUBLIC_' },
    },
  },
  guide: {
    procedure: [
      'Before running, write down which folder you think plays each of the four roles.',
      'Open the Run tab, set the four selects to your prediction and press Run.',
      'Follow the inspectFile tool calls in the trace: each one is a real file the server read.',
      'Open the result and read the evidence found for each layer.',
      'Set the UI layer to apps/api and run again. Read the failing check message.',
      'Find agentRegistration in the result: these are the lines that register agents on the Mastra instance.',
      'Check the env section: is .env gitignored, and which prefix may reach the browser?',
    ],
    prediction: 'Which folder may import @mastra/core, and which one must never do so?',
    hints: [
      { level: 1, text: 'The UI is the folder with index.html and React; the API is the one that calls .listen().' },
      { level: 2, text: 'Only server code may depend on @mastra/core. Look for a package.json described as server-only.' },
      {
        level: 3,
        text: 'UI = apps/web, API = apps/api, runtime = packages/mastra-runtime, entry = the template src/mastra/index.ts from Lab 01.',
      },
    ],
    commonMistakes: [
      { mistake: 'Importing @mastra/core in the React app.', fix: 'Call your API from the browser; keep Mastra in server code.' },
      {
        mistake: 'Prefixing a secret with the public prefix (e.g. VITE_PUBLIC_OPENAI_API_KEY).',
        fix: 'Anything with the public prefix is shipped to every visitor. Keep keys unprefixed in the server .env.',
      },
      {
        mistake: 'Registering an agent in a random file and expecting mastra dev to find it.',
        fix: 'Register agents on the Mastra instance exported from src/mastra/index.ts.',
      },
    ],
    challenge: {
      prompt:
        'Using the manifest, explain in three sentences what happens from the moment a learner presses Run in the browser until a Mastra agent answers.',
      successCriteria: [
        'Mentions the browser calling the API (not Mastra) ',
        'Mentions the server-only runtime loading Mastra and reading keys from .env',
        'Mentions events streaming back to the browser',
      ],
    },
    diagram: {
      kind: 'ascii',
      caption: 'Where each concern lives',
      source:
        'Browser (apps/web)  ──HTTP/SSE──▶  API (apps/api)  ──▶  Mastra runtime (packages/mastra-runtime)\n   React, no secrets            Express, Zod            @mastra/core, model keys from .env\n                                                         └─ Mastra entry: src/mastra/index.ts\n                                                              new Mastra({ agents: { … } })',
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Which layer is allowed to read OPENAI_API_KEY?',
      choices: ['The React UI', 'The server-side API/runtime', 'Both', 'Neither; keys go in package.json'],
      correctIndex: 1,
      explanation: 'Keys stay on the server; the browser bundle must never contain them.',
    },
    {
      id: 'q2',
      prompt: 'What does src/mastra/index.ts typically contain?',
      choices: ['React components', 'Express routes', 'new Mastra({ agents: { … } })', 'The .env values'],
      correctIndex: 2,
      explanation: 'It exports the Mastra instance that registers agents, workflows and tools.',
    },
    {
      id: 'q3',
      prompt: 'In this platform, which variables can the browser bundle read?',
      choices: ['All variables in .env', 'Only VITE_PUBLIC_* variables', 'Only *_API_KEY variables', 'None at all'],
      correctIndex: 1,
      explanation: 'Vite is configured with envPrefix "VITE_PUBLIC_" so nothing else is exposed.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'Inspection trace, manifest and checks.' },
    { path: 'inspect.ts', title: 'Evidence rules', description: 'What each layer must contain.' },
  ],
  exercise: {
    instructions:
      'Add a fifth layer to the evidence rules: "contracts" (shared schemas used by both web and API). Write the evidence it must show (hint: it depends on zod and both apps/web and apps/api depend on it), then explain why contracts must not depend on @mastra/core.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'layer-ui', label: 'UI layer (browser) mapped correctly' },
    { id: 'layer-api', label: 'API layer (HTTP server) mapped correctly' },
    { id: 'layer-runtime', label: 'Mastra runtime (server-only) mapped correctly' },
    { id: 'layer-mastraEntry', label: 'Mastra entry point mapped correctly' },
    { id: 'env-hygiene', label: '.env is gitignored and the browser only sees VITE_PUBLIC_ variables' },
  ],
  instructorOutline: {
    durationMinutes: 5,
    segments: [
      {
        title: 'Why architecture matters',
        minutes: 1,
        talkingPoints: ['Keys and Mastra stay on the server', 'Browser talks to our API'],
      },
      { title: 'Predict and run', minutes: 1.5, talkingPoints: ['Pick the four layers', 'Follow the inspectFile trace'] },
      {
        title: 'Read the manifest',
        minutes: 1.5,
        talkingPoints: ['Workspaces and scripts', 'Agent registration lines', 'Env hygiene'],
      },
      { title: 'Make a wrong mapping', minutes: 1, talkingPoints: ['UI → apps/api', 'Read the evidence-based failure'] },
    ],
  },
  execution: {
    modes: ['offline'],
    defaultTimeoutMs: 15_000,
    maxTimeoutMs: 30_000,
    budget: { maxSteps: 3, maxToolCalls: 20 },
    costNotice: 'Free: the server reads repository files; no AI provider is called.',
  },
  tags: ['architecture', 'security', 'env'],
} satisfies LabDefinitionInput);
