import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const question = 'My order ORD-2042 has not arrived yet. When will it come, and how much did I pay?';
const profiles = [
  { persona: 'ava', tone: 'friendly', locale: 'en-US' },
  { persona: 'lucia', tone: 'formal', locale: 'es-ES' },
  { persona: 'kenji', tone: 'concise', locale: 'ja-JP' },
];

export const lab16Definition = {
  id: 'lab-16',
  number: 16,
  title: 'Dynamic instructions',
  moduleId: 'module-04',
  summary:
    'Resolve an agent’s instructions per request from a validated RequestContext, run several users in parallel on one agent, and see shared state leak.',
  concept:
    'A production agent is usually one object that serves many users at the same time, and each user may need a different persona, tone or language. ' +
    'In Mastra, instructions can be a function instead of a string: it receives the call’s requestContext and returns the instructions for that call only. ' +
    'The caller creates a new RequestContext for every request, for example new RequestContext([["locale", "es-ES"]]), and passes it to agent.generate() or agent.stream(). ' +
    'Because the context travels with the call, two requests that run at the same time can never see each other’s settings. ' +
    'Adding requestContextSchema to the agent makes Mastra validate the context with Zod before anything runs, so an unknown locale is rejected before any tokens are spent. ' +
    'The classic mistake is to store the “current user” settings in a module-level variable and then await: under concurrency, every request reads whatever the last request wrote. ' +
    'Locale also changes how facts are written, so dates and money should be formatted with Intl for the request’s locale rather than by the model. ' +
    'In this lab several profiles run in parallel on one agent, and the checks prove each one got its own instructions.',
  objectives: [
    'Write instructions as a function of requestContext',
    'Validate request context with requestContextSchema',
    'Run parallel requests on one agent without shared-state leaks',
    'Format locale-specific facts with Intl and keep them in the instructions',
  ],
  prerequisites: ['lab-15'],
  inputs: [
    {
      kind: 'text',
      name: 'question',
      label: 'Customer question (same for every profile)',
      minLength: 1,
      maxLength: 500,
      default: question,
      required: true,
    },
    {
      kind: 'json',
      name: 'profiles',
      label: 'Parallel request profiles (1–4)',
      help: 'Each: { "persona": ava | lucia | kenji | max, "tone": friendly | formal | concise, "locale": en-US | es-ES | fr-FR | de-DE | ja-JP }. Use each persona once.',
      maxBytes: 2_000,
      default: profiles,
      required: true,
    },
    {
      kind: 'select',
      name: 'strategy',
      label: 'Where the agent reads settings from',
      options: [
        { value: 'request-context', label: 'RequestContext (correct)' },
        { value: 'shared-module-state', label: 'Shared module variable (anti-pattern)' },
      ],
      default: 'request-context',
      required: true,
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: { question, profiles, strategy: 'request-context', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'Three requests overlap in time on one agent. Each resolves its own persona, tone and locale, answers in its own language with the locally formatted total, and signs with its own name. The invalid-locale probe is rejected.',
    example: {
      strategy: 'request-context',
      requests: [
        {
          requestId: 'req-1',
          persona: 'ava',
          locale: 'en-US',
          answer: 'Hi there! Your order ORD-2042 should arrive on October 21, 2026; the total is €45.90. — Ava',
        },
        {
          requestId: 'req-2',
          persona: 'lucia',
          locale: 'es-ES',
          answer: 'Buenas tardes. Su pedido ORD-2042 debería llegar el 21 de octubre de 2026; el total es 45,90\u00a0€. — Lucía',
        },
        {
          requestId: 'req-3',
          persona: 'kenji',
          locale: 'ja-JP',
          answer: 'ご注文 ORD-2042 は2026年10月21日に到着予定です。合計は€45.90です。 — Kenji',
        },
      ],
      probe: { rejected: true, errorId: 'AGENT_REQUEST_CONTEXT_VALIDATION_FAILED', instructionsResolved: false },
    },
  },
  guide: {
    procedure: [
      'Open profiles.ts in the Source tab and read buildInstructions(): which values come from the request context?',
      'Run the example. In the timeline, find the three request steps and compare their start and finish times.',
      'In the result, compare each request’s instructions and answer. Who signed each one?',
      'Add a fourth profile { "persona": "max", "tone": "friendly", "locale": "de-DE" } and run again.',
      'Switch the strategy to “Shared module variable” and run. Every answer now comes from the same persona.',
      'Optional (costs money): run live and check that a real model keeps each persona and language apart.',
    ],
    prediction: 'With the shared module variable and three profiles, which persona will answer each request?',
    hints: [
      { level: 1, text: 'The loop writes the shared variable for every request before any of them reads it.' },
      { level: 2, text: 'Mastra resolves instructions after the first await inside generate().' },
      {
        level: 3,
        text: 'All three answer as the last profile (Kenji, concise, ja-JP), because that was the last value written.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Storing the current user’s settings in a module variable or on the agent object.',
        fix: 'Create a new RequestContext per request and read it in the instructions function.',
      },
      {
        mistake: 'Creating a new Agent for every request to “isolate” settings.',
        fix: 'Keep one agent; isolation comes from the request context.',
      },
      {
        mistake: 'Putting raw user text into the instructions.',
        fix: 'Validate the context with requestContextSchema and allow only known values.',
      },
      {
        mistake: 'Letting the model format dates and money.',
        fix: 'Format with Intl for the request’s locale and tell the model to copy the values.',
      },
    ],
    challenge: {
      prompt:
        'Add a "channel" value (email | chat) to the context and schema, and make chat answers shorter. How do you prove two parallel requests on different channels stay independent?',
      successCriteria: [
        'An invalid channel is rejected by requestContextSchema',
        'Parallel email and chat requests each follow their own rule',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What does an instructions function receive in Mastra?',
      choices: ['The previous answer', 'The call’s requestContext (and the mastra instance)', 'The API key', 'Nothing'],
      correctIndex: 1,
      explanation: 'instructions: ({ requestContext }) => string is resolved per call.',
    },
    {
      id: 'q2',
      prompt:
        'Two requests run in parallel. Request A sets a module variable, then B sets it, then both await generate(). What do they see?',
      choices: ['Each sees its own value', 'Both see B’s value', 'Both see A’s value', 'Mastra throws'],
      correctIndex: 1,
      explanation: 'Shared state holds only the last write when the instructions are resolved.',
    },
    {
      id: 'q3',
      prompt: 'What does requestContextSchema do?',
      choices: [
        'Formats the answer',
        'Validates the request context before the call runs',
        'Stores the context in a database',
        'Translates the instructions',
      ],
      correctIndex: 1,
      explanation: 'Invalid context fails with AGENT_REQUEST_CONTEXT_VALIDATION_FAILED before any model call.',
    },
    {
      id: 'q4',
      prompt: 'Why format the total with Intl instead of asking the model to?',
      choices: [
        'Intl is faster',
        'Locale rules (decimal comma, symbol position, spacing) are exact and repeatable',
        'Models cannot see numbers',
        'It saves tokens',
      ],
      correctIndex: 1,
      explanation: 'de-DE writes 45,90 €, en-US writes €45.90; Intl gets it right every time.',
    },
  ],
  sourceFiles: [
    {
      path: 'profiles.ts',
      title: 'Context schema and instructions',
      description: 'Personas, tones, locales, Intl facts, buildInstructions().',
    },
    {
      path: 'run.ts',
      title: 'Lab run',
      description: 'One shared agent, parallel requests, both strategies and the schema probe.',
    },
  ],
  exercise: {
    instructions:
      'In your project, give an agent instructions as a function of requestContext with a requestContextSchema, and write a test that runs two different contexts in parallel with Promise.all and asserts each answer uses its own settings.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'parallel', label: 'All requests ran at the same time on one agent' },
    { id: 'instructions-isolated', label: 'Each request resolved instructions with only its own persona, locale and reference' },
    { id: 'answers-signed', label: 'Each answer is signed by its own persona' },
    { id: 'locale-facts', label: 'Each answer quotes the total formatted for its own locale' },
    { id: 'context-validated', label: 'An invalid request context was rejected before the instructions or the model ran' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'One agent, many users', minutes: 1, talkingPoints: ['Why not one agent per user', 'Per-request settings'] },
      {
        title: 'Instructions as a function',
        minutes: 1.5,
        talkingPoints: ['({ requestContext }) => string', 'new RequestContext per call'],
      },
      { title: 'Validation', minutes: 1, talkingPoints: ['requestContextSchema', 'Rejected before any tokens'] },
      { title: 'The leak', minutes: 1.5, talkingPoints: ['Module variable + await', 'Every answer from the last profile'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Intl for locale facts', 'Next: request context in tools'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 4 },
    costNotice:
      'Offline is free. Live mode makes one model call per profile (up to 4), all in parallel. The invalid-context probe makes no model call.',
  },
  tags: ['instructions', 'request-context', 'concurrency', 'i18n'],
} satisfies LabDefinitionInput;
