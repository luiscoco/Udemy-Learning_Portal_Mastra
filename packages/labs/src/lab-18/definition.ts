import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const question = 'What is the status of my order ORD-3001?';
const sessions = [
  { role: 'admin', locale: 'en-US' },
  { role: 'customer', locale: 'de-DE' },
  { role: 'support', locale: 'ja-JP' },
];

export const lab18Definition = {
  id: 'lab-18',
  number: 18,
  title: 'Context-aware tools',
  moduleId: 'module-04',
  summary:
    'Build a tool that reads the caller’s role and locale from the request context, redacts and formats its output safely, and never serves one session’s view to another.',
  concept:
    'A tool that returns customer data must decide, on every call, what this caller may see and how to present it. ' +
    'In Mastra the tool receives the call’s request context in execute(input, context), so it can read the role and locale that the server put there instead of trusting the model. ' +
    'Redaction belongs in the tool: if a field never leaves the tool, the model cannot reveal it, however it is prompted. ' +
    'Use an allowlist of fields per role, and mask what a role may only partly see, such as an email address for a customer. ' +
    'Formatting also belongs to the context: Intl formats dates, money and units for the caller’s locale, and status labels are translated from a table rather than by the model. ' +
    'Stored free text written by customers, such as a delivery note, is untrusted: escape it, bound its length and mark it as data so the agent never follows instructions inside it. ' +
    'A classic bug is caching the formatted tool output under a key that ignores role and locale, which serves the first caller’s view to everyone after them. ' +
    'Cache raw data if you must, and format per call from the current context.',
  objectives: [
    'Read role and locale from context.requestContext inside a tool',
    'Redact output with a per-role field allowlist and masking',
    'Format dates, money, units and labels for the caller’s locale',
    'Escape untrusted stored text and avoid cross-session cache contamination',
  ],
  prerequisites: ['lab-17'],
  inputs: [
    {
      kind: 'text',
      name: 'question',
      label: 'Question (asked in every session)',
      help: 'Orders: ORD-3001 (shipped, has a suspicious delivery note) and ORD-3002 (processing).',
      minLength: 1,
      maxLength: 500,
      default: question,
      required: true,
    },
    {
      kind: 'json',
      name: 'sessions',
      label: 'Sessions, run one after another (1–4)',
      help: 'Each: { "role": customer | support | admin, "locale": en-US | es-ES | fr-FR | de-DE | ja-JP }.',
      maxBytes: 1_000,
      default: sessions,
      required: true,
    },
    {
      kind: 'select',
      name: 'cacheStrategy',
      label: 'Tool cache',
      options: [
        { value: 'cache-raw-data', label: 'Cache raw data, format per call (correct)' },
        { value: 'cache-formatted-output', label: 'Cache formatted output by order id (anti-pattern)' },
      ],
      default: 'cache-raw-data',
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
  exampleInput: { question, sessions, cacheStrategy: 'cache-raw-data', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'Three sessions share one tool. The admin (en-US) sees everything. The customer (de-DE) sees a masked email and no phone, internal note or risk score. Support (ja-JP) sees a masked phone. Each result is formatted for its own locale, and the delivery note is escaped.',
    example: {
      orderId: 'ORD-3001',
      cacheStrategy: 'cache-raw-data',
      sessions: [
        {
          sessionId: 'session-1',
          role: 'admin',
          locale: 'en-US',
          cache: 'miss',
          toolOutput: { role: 'admin', email: 'jonas.weber@example.com', total: '€89.50', status: 'Shipped', riskScore: '82%' },
        },
        {
          sessionId: 'session-2',
          role: 'customer',
          locale: 'de-DE',
          cache: 'hit',
          toolOutput: { role: 'customer', email: 'j•••@example.com', status: 'Versandt' },
        },
        {
          sessionId: 'session-3',
          role: 'support',
          locale: 'ja-JP',
          cache: 'hit',
          toolOutput: { role: 'support', phone: '••• 6789', total: '€89.50', status: '発送済み' },
        },
      ],
    },
  },
  guide: {
    procedure: [
      'Open view.ts in the Source tab and read ROLE_FIELDS and buildView(): where do role and locale come from?',
      'Run the example. Compare the three tool results in the trace: which fields does each role get?',
      'Find the delivery note: what happened to the <script> tag and the “SYSTEM:” sentence?',
      'Switch the tool cache to “Cache formatted output” and run again. Read the customer’s answer.',
      'Reorder the sessions so the customer runs first, still with the bad cache. Who is affected now?',
      'Optional (costs money): run live and check that a real model keeps each session’s language and never mentions the risk score to the customer.',
    ],
    prediction: 'With the formatted-output cache, what will the German customer see after the English admin session?',
    hints: [
      { level: 1, text: 'The bad cache key is only the order id.' },
      { level: 2, text: 'The first session fills the cache; every later session gets a cache hit.' },
      {
        level: 3,
        text: 'The admin’s English view: the full email, phone, internal note and risk score. The redaction and contamination checks fail.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Returning the whole record and asking the model to hide fields.',
        fix: 'Redact in the tool with a per-role allowlist.',
      },
      {
        mistake: 'Caching formatted, role-specific output by id.',
        fix: 'Cache raw data, or include role and locale in the key.',
      },
      {
        mistake: 'Letting the model translate labels and format money.',
        fix: 'Use Intl and label tables; tell the model to copy values.',
      },
      { mistake: 'Passing stored customer text through unchanged.', fix: 'Escape it, bound it and mark it untrusted.' },
    ],
    challenge: {
      prompt:
        'Add a "partner" role that sees the status and weight but no personal data, and a cache keyed by orderId + role + locale. Prove that four mixed sessions still match their own expected views.',
      successCriteria: ['A partner result has no name, email or phone', 'The no-cross-session check passes with the keyed cache'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Where should a tool get the caller’s role?',
      choices: [
        'From its arguments',
        'From context.requestContext set by the server',
        'From the model’s answer',
        'From a global variable',
      ],
      correctIndex: 1,
      explanation: 'The server sets role in the request context; the model cannot change it.',
    },
    {
      id: 'q2',
      prompt: 'Why redact in the tool rather than in the instructions?',
      choices: [
        'It is faster',
        'A field that never reaches the model cannot be revealed by it',
        'Instructions cannot mention fields',
        'Mastra requires it',
      ],
      correctIndex: 1,
      explanation: 'Instructions can be ignored or overridden; missing data cannot leak.',
    },
    {
      id: 'q3',
      prompt: 'A tool caches its formatted output keyed only by order id. What goes wrong?',
      choices: [
        'Nothing',
        'Later sessions get the first session’s role and locale view',
        'The cache never hits',
        'The model refuses to answer',
      ],
      correctIndex: 1,
      explanation: 'The key ignores the context that shaped the output.',
    },
    {
      id: 'q4',
      prompt: 'How should a tool return a customer’s stored delivery note?',
      choices: ['Exactly as typed', 'Escaped, length-bounded and marked untrusted', 'Translated by the model', 'Never'],
      correctIndex: 1,
      explanation: 'Stored text can carry markup or injected instructions.',
    },
  ],
  sourceFiles: [
    {
      path: 'view.ts',
      title: 'Context-aware tool',
      description: 'Role allowlists, masking, escaping, Intl formatting, both cache strategies.',
    },
    { path: 'run.ts', title: 'Lab run', description: 'Sessions on one agent, gullible offline model, expected-view checks.' },
  ],
  exercise: {
    instructions:
      'In your project, write a tool that reads role and locale from context.requestContext and returns a redacted, localized view. Test two sessions with different roles and locales against the same tool instance, asserting each output equals its own expected view.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'tool-called', label: 'Every session got its data from the context-aware tool' },
    { id: 'role-redaction', label: 'Each tool result contains only the fields the session’s role may see' },
    { id: 'locale-format', label: 'Each tool result is formatted for the session’s own locale' },
    { id: 'no-cross-session', label: 'No session received another session’s view (each result equals its own expected view)' },
    { id: 'safe-text', label: 'Untrusted stored text was escaped, and no answer leaked a forbidden value' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      {
        title: 'Tools that know who is asking',
        minutes: 1,
        talkingPoints: ['context.requestContext in execute()', 'Role and locale'],
      },
      { title: 'Redaction', minutes: 1.5, talkingPoints: ['Per-role allowlist', 'Masking email and phone'] },
      { title: 'Locale', minutes: 1, talkingPoints: ['Intl dates, money, units', 'Label tables'] },
      {
        title: 'Untrusted text and the cache bug',
        minutes: 1.5,
        talkingPoints: ['Escaping the delivery note', 'Formatted-output cache leaks'],
      },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Cache raw, format per call', 'Next: execution options'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 3, maxToolCalls: 4 },
    costNotice: 'Offline is free. Live mode makes about two model calls per session (up to 8) with your provider key.',
  },
  tags: ['tools', 'request-context', 'redaction', 'i18n', 'caching'],
} satisfies LabDefinitionInput;
