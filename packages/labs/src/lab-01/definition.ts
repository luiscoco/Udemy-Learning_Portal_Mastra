import type { LabDefinitionInput } from '@mlp/contracts';

export const lab01Definition = {
  id: 'lab-01',
  number: 1,
  title: 'Create a Mastra project',
  moduleId: 'module-01',
  summary: 'Generate a minimal Mastra TypeScript project, build it against the real @mastra/core types and learn what every root file does.',
  concept:
    'A Mastra project is an ordinary Node.js TypeScript project with one special file: src/mastra/index.ts, which exports a Mastra instance. ' +
    'The official way to start is `npm create mastra@latest`, which asks a few questions and writes that structure for you. ' +
    'Mastra is published as ECMAScript modules, so package.json declares "type": "module" and the code uses import and export instead of require. ' +
    'The @mastra/core package needs Node.js 22.13 or newer, which is why the generated project pins it in the "engines" field. ' +
    'The mastra CLI adds three scripts: mastra dev starts a local server with Studio, mastra build bundles your project for deployment, and mastra start runs that build. ' +
    'Agents live in their own files and are registered on the Mastra instance, and each agent names its model with a "provider/model" string such as openai/gpt-5-mini. ' +
    'Provider API keys never go into code: the project ships a .env.example with the variable name and .gitignore keeps your real .env out of git. ' +
    'In this lab the server renders that project from your choices and compiles it with TypeScript against the installed @mastra/core, so a passing build proves the structure is correct.',
  objectives: [
    'Name the root files of a Mastra project and explain what each one is for',
    'Explain why Mastra projects use ESM ("type": "module") and Node.js 22.13+',
    'Configure a provider model id and the matching API key variable without committing secrets',
    'Read TypeScript build output to confirm a project is valid',
  ],
  prerequisites: ['lab-00'],
  inputs: [
    {
      kind: 'text',
      name: 'projectName',
      label: 'Project name',
      help: 'npm package name: lowercase letters, digits and dashes, 3–40 characters, starting with a letter.',
      minLength: 3,
      maxLength: 40,
      placeholder: 'my-mastra-app',
      default: 'support-desk',
      required: true,
    },
    {
      kind: 'select',
      name: 'provider',
      label: 'Model provider',
      help: 'Decides the model id and the API key variable written to .env.example.',
      options: [
        { value: 'openai', label: 'OpenAI (openai/gpt-5-mini)' },
        { value: 'anthropic', label: 'Anthropic (anthropic/claude-haiku-4-5)' },
        { value: 'google', label: 'Google (google/gemini-2.5-flash)' },
      ],
      default: 'openai',
      required: true,
    },
    {
      kind: 'text',
      name: 'agentName',
      label: 'First agent name',
      help: 'Letters and spaces, e.g. "Support Desk". Becomes the agent name, id and file name.',
      minLength: 2,
      maxLength: 40,
      default: 'Support Desk',
      required: true,
    },
    {
      kind: 'select',
      name: 'moduleType',
      label: 'Module system',
      help: 'Try "commonjs" to see what goes wrong.',
      options: [
        { value: 'module', label: 'ESM ("type": "module") — recommended' },
        { value: 'commonjs', label: 'CommonJS ("type": "commonjs")' },
      ],
      default: 'module',
      required: true,
    },
  ],
  exampleInput: { projectName: 'support-desk', provider: 'openai', agentName: 'Support Desk', moduleType: 'module' },
  expectedOutput: {
    description:
      'Five workflow steps (environment, configuration, render, build, cleanup), one log per generated file, a TypeScript build with 0 diagnostics and the project file tree with roles.',
    example: {
      projectName: 'support-desk',
      modelId: 'openai/gpt-5-mini',
      apiKeyEnvVar: 'OPENAI_API_KEY',
      agent: { variable: 'supportDeskAgent', id: 'support-desk-agent', file: 'src/mastra/agents/support-desk-agent.ts' },
      build: { ok: true, diagnostics: [] },
      rootFiles: ['.env.example', '.gitignore', 'package.json', 'tsconfig.json', 'src/mastra/index.ts'],
    },
  },
  guide: {
    procedure: [
      'On your own machine, read the official starter command: `npm create mastra@latest` (you do not need to run it for this lab).',
      'Open the Run tab, keep the example input and press Run. Watch the five workflow steps.',
      'In the timeline, read the "create …" logs: these are the files your project contains.',
      'Open the result and find package.json: locate "type", "engines" and the three mastra scripts.',
      'Open src/mastra/index.ts in the result and find where the agent is registered on the Mastra instance.',
      'Change the module system to CommonJS and run again. Read which check fails and why.',
      'Switch the provider to Anthropic and check how the model id and .env.example key change.',
    ],
    prediction: 'Which file must exist for `mastra dev` to find your agents, and what does it export?',
    hints: [
      { level: 1, text: 'Look for the file that contains `new Mastra(`.' },
      { level: 2, text: 'It is src/mastra/index.ts. It imports the agent from ./agents/… and passes it in the `agents` object.' },
      {
        level: 3,
        text: 'src/mastra/index.ts exports a constant named `mastra` created with `new Mastra({ agents: { supportDeskAgent } })`; the CLI loads that export.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Removing "type": "module" or mixing require() with import.',
        fix: 'Keep the project ESM; use import/export everywhere. @mastra/core is published as ESM.',
      },
      {
        mistake: 'Running on Node 18 or 20.',
        fix: 'Install Node 22.13+ (24 LTS recommended); the engines field makes npm warn you early.',
      },
      {
        mistake: 'Putting the API key directly in the agent file or committing .env.',
        fix: 'Keep keys in .env, list only the variable name in .env.example and keep .env in .gitignore.',
      },
      {
        mistake: 'Using a model id without the provider prefix (e.g. "gpt-5-mini").',
        fix: 'Mastra model router ids are "provider/model", e.g. "openai/gpt-5-mini".',
      },
    ],
    challenge: {
      prompt: 'Generate a project for Google with an agent called "Trip Planner". Before running, predict the agent file path, the agent id and the API key variable.',
      successCriteria: [
        'The build passes with 0 diagnostics',
        'Your prediction matches src/mastra/agents/trip-planner-agent.ts, id "trip-planner-agent" and GOOGLE_API_KEY',
      ],
    },
    diagram: {
      kind: 'ascii',
      caption: 'Layout of the generated project',
      source:
        'support-desk/\n├── package.json        "type": "module", engines, mastra scripts\n├── tsconfig.json       ES2022 + bundler resolution\n├── .env.example        OPENAI_API_KEY=   (names only)\n├── .gitignore          .env, node_modules, dist\n└── src/\n    └── mastra/\n        ├── index.ts    export const mastra = new Mastra({ agents })\n        └── agents/\n            └── support-desk-agent.ts',
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Which file does the mastra CLI load to discover your agents?',
      choices: ['package.json', 'src/mastra/index.ts', '.env', 'tsconfig.json'],
      correctIndex: 1,
      explanation: 'src/mastra/index.ts exports the Mastra instance where agents are registered.',
    },
    {
      id: 'q2',
      prompt: 'Why does a Mastra project declare "type": "module"?',
      choices: [
        'It makes the project run faster',
        'Mastra packages are ECMAScript modules, so the project uses import/export',
        'It is required by TypeScript',
        'It enables Studio',
      ],
      correctIndex: 1,
      explanation: 'Mastra ships ESM; declaring the project as ESM keeps imports consistent.',
    },
    {
      id: 'q3',
      prompt: 'Where should your OpenAI API key live?',
      choices: ['In the agent file', 'In package.json', 'In .env, which is gitignored', 'In .env.example'],
      correctIndex: 2,
      explanation: '.env holds real secrets locally; .env.example only lists the variable names.',
    },
    {
      id: 'q4',
      prompt: 'What is the minimum Node.js version for the installed @mastra/core?',
      choices: ['18', '20', '22.13', '16'],
      correctIndex: 2,
      explanation: '@mastra/core declares engines.node ">=22.13.0".',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'Validation, workflow steps, build and checks.' },
    { path: 'scaffold.ts', title: 'Renderer', description: 'Turns the template plus your choices into project files.' },
    { path: 'typecheck.ts', title: 'Build step', description: 'TypeScript compiler API in a worker thread.' },
    { path: 'template/src/mastra/index.ts', title: 'Template: entry point' },
    { path: 'template/src/mastra/agents/assistant-agent.ts', title: 'Template: agent' },
    { path: 'template/package.json', title: 'Template: package.json' },
    { path: 'template/tsconfig.json', title: 'Template: tsconfig.json' },
  ],
  exercise: {
    instructions:
      'On your machine, create a real project with `npm create mastra@latest`, then compare it with the files from this lab: list the root files both share and one difference. Then add a second agent file to your project and register it in src/mastra/index.ts. Run `npx tsc --noEmit` to prove it still builds.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'build-passes', label: 'The generated project typechecks with 0 errors' },
    { id: 'esm', label: 'package.json declares "type": "module"' },
    { id: 'node-engine', label: 'package.json requires Node.js >= 22.13' },
    { id: 'entry-registers-agent', label: 'src/mastra/index.ts registers the agent on a Mastra instance' },
    { id: 'secrets-excluded', label: '.env.example has no values and .gitignore excludes .env' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'What a Mastra project is', minutes: 1, talkingPoints: ['npm create mastra@latest', 'src/mastra/index.ts exports the Mastra instance'] },
      {
        title: 'Run the scaffold',
        minutes: 2,
        talkingPoints: ['Example input, watch the five steps', 'Read the generated file logs', 'Real TypeScript build, 0 diagnostics'],
      },
      {
        title: 'Tour the root files',
        minutes: 1.5,
        talkingPoints: ['package.json: type, engines, mastra scripts', 'tsconfig: ES2022 + bundler', '.env.example vs .env'],
      },
      { title: 'Break it on purpose', minutes: 1, talkingPoints: ['Switch to CommonJS', 'Show the failing ESM check and its message'] },
      { title: 'Wrap-up', minutes: 0.5, talkingPoints: ['Challenge: Trip Planner on Google', 'Next lab: explore architecture'] },
    ],
  },
  execution: {
    modes: ['offline'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 90_000,
    budget: { maxSteps: 5 },
    costNotice: 'Free: the project is generated and compiled on the server; no AI provider is called.',
  },
  tags: ['setup', 'esm', 'project-structure'],
} satisfies LabDefinitionInput;
