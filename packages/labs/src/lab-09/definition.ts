import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const message =
  'Urgent: I cannot log in to my account since this morning and I have a client demo at noon. My email is ana@example.com.';

export const lab09Definition = {
  id: 'lab-09',
  number: 9,
  title: 'Structured JSON generation',
  moduleId: 'module-02',
  summary:
    'Extract a typed support ticket with Mastra structured output and a Zod schema, and handle malformed model JSON without crashing.',
  concept:
    'Free text is great for people but awkward for code, which usually needs fields it can trust, such as a priority it can sort on or an email it can store. ' +
    'Mastra structured output lets you pass a Zod schema with `agent.generate(prompt, { structuredOutput: { schema } })`, and the validated, typed value comes back in result.object. ' +
    'Under the hood Mastra asks the model for JSON that matches the schema and then validates the reply against it. ' +
    'Models sometimes return the wrong shape or broken JSON, so the errorStrategy option decides what happens next: strict throws a validation error, warn returns no object, and fallback returns a value you choose. ' +
    'Whatever the strategy, your app must never crash and must never pass unvalidated data to the rest of your code. ' +
    'Describing fields with .describe() and using enums gives the model clear rules and gives you predictable values. ' +
    'In offline mode you can inject valid, fenced, wrong-shape or broken JSON replies to watch each strategy react.',
  objectives: [
    'Define a Zod schema and request structured output from an agent',
    'Read the typed result from result.object',
    'Choose between strict, warn and fallback error strategies',
    'Handle malformed model output without crashing or trusting bad data',
  ],
  prerequisites: ['lab-08'],
  inputs: [
    {
      kind: 'textarea',
      name: 'message',
      label: 'Support message',
      rows: 4,
      minLength: 5,
      maxLength: 3000,
      default: message,
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
    {
      kind: 'select',
      name: 'errorStrategy',
      label: 'errorStrategy',
      options: [
        { value: 'strict', label: 'strict — throw on invalid output' },
        { value: 'warn', label: 'warn — return no object' },
        { value: 'fallback', label: 'fallback — return a default ticket' },
      ],
      default: 'strict',
      required: true,
    },
    {
      kind: 'select',
      name: 'offlineResponse',
      label: 'Offline model reply (fault injection)',
      help: 'Offline only. Live models produce their own JSON.',
      options: [
        { value: 'valid', label: 'Valid JSON' },
        { value: 'fenced', label: 'Valid JSON inside a ```json fence' },
        { value: 'wrong-shape', label: 'Wrong shape (bad enum, wrong type)' },
        { value: 'broken-json', label: 'Broken / truncated JSON' },
      ],
      default: 'valid',
      required: true,
    },
  ],
  exampleInput: { message, modelId: 'openai/gpt-5-mini', errorStrategy: 'strict', offlineResponse: 'valid' },
  expectedOutput: {
    description: 'A typed ticket in result.object that passes the schema, plus the JSON Schema sent to the model.',
    example: {
      object: {
        title: 'Urgent: I cannot log in to my account since this morning and I have a client…',
        priority: 'high',
        category: 'account',
        tags: ['urgent'],
        customerEmail: 'ana@example.com',
      },
      schemaValid: true,
      usedFallback: false,
      error: null,
    },
  },
  guide: {
    procedure: [
      'Read TicketSchema in the Source tab: which fields are enums, and which can be null?',
      'Run the example and inspect result.object and jsonSchema.',
      'Set the offline reply to "Wrong shape" with strategy strict and run: the run completes and reports the field errors.',
      'Keep "Wrong shape" and switch to warn, then to fallback. Compare object and usedFallback.',
      'Try "Broken / truncated JSON" with each strategy.',
      'Try the fenced reply: Mastra still parses JSON inside ```json fences.',
    ],
    prediction: 'With a wrong-shape reply and errorStrategy "fallback", what will result.object contain?',
    hints: [
      { level: 1, text: 'fallback never returns invalid data and never throws.' },
      { level: 2, text: 'It returns the fallbackValue you configured when validation fails.' },
      { level: 3, text: 'The fallback ticket: "Unclassified request", priority medium, category general, no tags, email null.' },
    ],
    commonMistakes: [
      {
        mistake: 'Parsing result.text with JSON.parse yourself.',
        fix: 'Use structuredOutput and read the validated result.object.',
      },
      {
        mistake: 'Letting a strict validation error crash the request handler.',
        fix: 'Catch it and return a clear error or a fallback.',
      },
      { mistake: 'Using free-form strings for fields code depends on.', fix: 'Use z.enum for categories and priorities.' },
      {
        mistake: 'Making every field required when data can be missing.',
        fix: 'Use .nullable() or .optional() and describe when to use null.',
      },
    ],
    challenge: {
      prompt:
        'Add a "dueInHours" number field (1–72) to the schema with a description, then decide which errorStrategy your production API should use and why.',
      successCriteria: ['The schema change typechecks', 'Your strategy choice explains what the user sees on failure'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Where is the validated object after generate() with structuredOutput?',
      choices: ['result.text', 'result.object', 'result.json', 'result.steps[0]'],
      correctIndex: 1,
      explanation: 'Mastra validates the reply and exposes the typed value as result.object.',
    },
    {
      id: 'q2',
      prompt: 'The model returns priority "urgent" but the enum allows low/medium/high. With strict, what happens?',
      choices: [
        'The value is silently accepted',
        'A validation error is thrown',
        'priority becomes null',
        'The model is retried forever',
      ],
      correctIndex: 1,
      explanation: 'strict throws STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED with the field issues.',
    },
    {
      id: 'q3',
      prompt: 'Which strategy guarantees a usable object for downstream code?',
      choices: ['strict', 'warn', 'fallback', 'none'],
      correctIndex: 2,
      explanation: 'fallback returns your fallbackValue whenever validation fails.',
    },
    {
      id: 'q4',
      prompt: 'Why validate the object again with your own schema?',
      choices: [
        'Mastra never validates',
        'Defence in depth before trusting data in your app',
        'It is faster',
        'It changes the model output',
      ],
      correctIndex: 1,
      explanation: 'A second check at your boundary keeps bad data out even if configuration changes.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'structuredOutput, error strategies and safe handling.' },
    { path: 'schema.ts', title: 'TicketSchema', description: 'Zod schema and the offline extractor.' },
  ],
  exercise: {
    instructions:
      'In your project, write `toTicket(message)` that calls an agent with structuredOutput (your own Zod schema, errorStrategy "strict"), catches validation errors and returns `{ ok: true, ticket } | { ok: false, issues }` so callers never see an exception.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'no-crash', label: 'The run completed even if the model returned bad JSON' },
    { id: 'object-valid', label: 'Any returned object passes the Zod schema' },
    { id: 'strategy-respected', label: 'errorStrategy behaved as documented' },
    { id: 'typed-result', label: 'Downstream code gets a valid ticket or an explicit null, never bad data' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Why structured output', minutes: 1, talkingPoints: ['Code needs fields, not prose'] },
      {
        title: 'Schema and generate',
        minutes: 1.5,
        talkingPoints: ['TicketSchema with enums and nullable', 'structuredOutput: { schema }', 'result.object'],
      },
      {
        title: 'When models misbehave',
        minutes: 2,
        talkingPoints: ['Wrong shape and broken JSON', 'strict vs warn vs fallback'],
      },
      {
        title: 'Defence in depth',
        minutes: 1,
        talkingPoints: ['Validate again at your boundary', 'Never crash, never trust bad data'],
      },
      { title: 'Wrap-up', minutes: 0.5, talkingPoints: ['Next: failures, retries and limits'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 45_000,
    maxTimeoutMs: 90_000,
    budget: { maxSteps: 1, maxTokens: 800 },
    costNotice: 'Offline is free. Live mode makes one structured-output model call with your provider key.',
  },
  tags: ['structured-output', 'zod', 'json'],
} satisfies LabDefinitionInput;
