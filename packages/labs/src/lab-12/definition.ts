import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const invalidArgs = { action: 'refund', orderId: 'order-42', amountCents: 75000, reason: 'broken' };

export const lab12Definition = {
  id: 'lab-12',
  number: 12,
  title: 'Tool validation with Zod',
  moduleId: 'module-03',
  summary:
    'Design a discriminated-union tool schema, send invalid and valid arguments, and prove invalid input never reaches business logic.',
  concept:
    'A tool’s inputSchema is a contract: Mastra checks the model’s arguments against it before execute runs, and rejects anything that does not fit. ' +
    'When the arguments are invalid, Mastra returns a validation error to the model listing each failing field, and your business logic never runs. ' +
    'A discriminated union, written with z.discriminatedUnion, lets one tool accept several shapes: here the action field decides whether refund or exchange fields are required. ' +
    'Field-level messages such as "Order ids look like ORD-123456" help both the model, which can fix its call, and the people reading the logs. ' +
    'Typed outputs matter too: an output schema, also a union here, guarantees callers get either an accepted ticket or a clear rejection. ' +
    'Business rules such as "refunds above $500 need a human" can live in the schema, so they are enforced before any side effect can happen. ' +
    'In this lab you write the exact arguments the model sends, so you can break each rule and watch the validation stop it.',
  objectives: [
    'Write a discriminated-union Zod input schema for a tool',
    'Show that invalid arguments are rejected before execute runs',
    'Read field-specific validation errors and fix the arguments',
    'Define a typed output schema and validate results against it',
  ],
  prerequisites: ['lab-11'],
  inputs: [
    {
      kind: 'json',
      name: 'toolArgs',
      label: 'Tool arguments the model sends (JSON)',
      help: 'refund: orderId (ORD-123456), amountCents (1–50000), reason (damaged|late|wrong-item|other). exchange: orderId, sku (TSH-0042), size (XS–XL).',
      maxBytes: 2000,
      default: invalidArgs,
      required: true,
    },
    {
      kind: 'text',
      name: 'request',
      label: 'Customer request',
      minLength: 1,
      maxLength: 500,
      default: 'Please refund my broken mug.',
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
  exampleInput: { toolArgs: invalidArgs, request: 'Please refund my broken mug.', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'The tool call is rejected: three field errors (orderId, amountCents, reason), execute() never runs, and the agent explains the problem.',
    example: {
      argsValid: false,
      executeCalls: 0,
      toolOutput: null,
      fieldErrors: [
        { path: 'orderId', message: 'Order ids look like ORD-123456' },
        { path: 'amountCents', message: 'Refunds above $500 need a human' },
        { path: 'reason', message: 'Invalid option: expected one of "damaged"|"late"|"wrong-item"|"other"' },
      ],
    },
  },
  guide: {
    procedure: [
      'Read SupportActionInputSchema in the Source tab: which fields does each action require?',
      'Run the example (invalid refund). Read fieldErrors and the warn logs: one per bad field.',
      'Check executeCalls: 0 — the business logic never ran.',
      'Fix the arguments one field at a time (ORD-123456, 2500, "damaged") and run after each fix.',
      'Switch to an exchange: {"action":"exchange","orderId":"ORD-000123","sku":"TSH-0042","size":"M"}.',
      'Send an exchange with refund fields to see how the discriminator changes which errors appear.',
    ],
    prediction: 'If you send {"action":"exchange","orderId":"ORD-000123","amountCents":100}, which fields will be reported?',
    hints: [
      { level: 1, text: 'The action decides which branch of the union is checked.' },
      { level: 2, text: 'exchange requires sku and size; amountCents is not part of that branch.' },
      { level: 3, text: 'Errors for sku and size (missing); amountCents is simply ignored by the exchange branch.' },
    ],
    commonMistakes: [
      {
        mistake: 'Validating inside execute() after side effects started.',
        fix: 'Put rules in inputSchema so invalid calls never run.',
      },
      {
        mistake: 'One huge optional-everything schema.',
        fix: 'Use a discriminated union so each action has exactly the fields it needs.',
      },
      { mistake: 'Vague error messages.', fix: 'Give each rule a message that says what a valid value looks like.' },
      { mistake: 'Trusting tool output shapes.', fix: 'Declare an outputSchema and keep it a union of explicit outcomes.' },
    ],
    challenge: {
      prompt:
        'Add a third action "cancel" with orderId and a "confirm": true literal. What happens if the model sends confirm: false?',
      successCriteria: ['z.literal(true) rejects false', 'The union still discriminates on action'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'The model sends arguments that fail inputSchema. What runs?',
      choices: [
        'execute() with partial data',
        'Nothing; Mastra returns a validation error to the model',
        'execute() and then validation',
        'The agent crashes',
      ],
      correctIndex: 1,
      explanation: 'Mastra validates first; execute only receives valid input.',
    },
    {
      id: 'q2',
      prompt: 'What does z.discriminatedUnion("action", […]) use to pick a branch?',
      choices: ['The first field', 'The value of the "action" field', 'The longest branch', 'Random'],
      correctIndex: 1,
      explanation: 'The discriminator field selects which object schema applies.',
    },
    {
      id: 'q3',
      prompt: 'Where should "refunds above $500 need a human" be enforced?',
      choices: [
        'In the UI only',
        'In the tool inputSchema (before execute)',
        'After the refund is issued',
        'In the model prompt only',
      ],
      correctIndex: 1,
      explanation: 'Schema rules run before any side effect can happen.',
    },
  ],
  sourceFiles: [
    {
      path: 'schema.ts',
      title: 'Schemas and business logic',
      description: 'Discriminated input/output unions and field errors.',
    },
    { path: 'run.ts', title: 'Lab run', description: 'Tool with an execute counter, streamed trace, checks.' },
  ],
  exercise: {
    instructions:
      'In your project, turn one of your tools’ inputs into a discriminated union with at least two actions and custom error messages. Write unit tests with SupportActionInputSchema.safeParse-style calls for one valid and two invalid inputs per action.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'invalid-not-executed', label: 'Invalid arguments never reached the business logic' },
    { id: 'field-errors', label: 'Each invalid field is reported with a message' },
    { id: 'mastra-agrees', label: 'Mastra’s own tool validation agreed with the schema' },
    { id: 'typed-output', label: 'Accepted calls returned output that matches the output schema' },
  ],
  instructorOutline: {
    durationMinutes: 5,
    segments: [
      { title: 'Schemas as contracts', minutes: 1, talkingPoints: ['Validation before execute'] },
      { title: 'Break it', minutes: 1.5, talkingPoints: ['Invalid refund', 'Three field errors', 'executeCalls = 0'] },
      { title: 'Discriminated unions', minutes: 1.5, talkingPoints: ['refund vs exchange', 'Errors follow the action'] },
      { title: 'Typed outputs', minutes: 1, talkingPoints: ['accepted | rejected', 'Next: multiple tools'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 45_000,
    maxTimeoutMs: 90_000,
    budget: { maxSteps: 2, maxToolCalls: 2 },
    costNotice: 'Offline is free. Live mode makes up to two model calls with your provider key.',
  },
  tags: ['tools', 'zod', 'validation'],
} satisfies LabDefinitionInput;
