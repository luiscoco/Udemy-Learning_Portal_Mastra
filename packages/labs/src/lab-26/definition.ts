import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const email = 'Hello! Please send me 2 ceramic mugs and 3 caps. I have the discount code WELCOME10. Thanks, Ana';

export const lab26Definition = {
  id: 'lab-26',
  number: 26,
  title: 'First typed workflow',
  moduleId: 'module-06',
  summary:
    'Build a Mastra workflow with Zod input and output schemas and one typed step, stream its lifecycle, and verify at runtime that the output really has the promised type.',
  concept:
    'An agent decides its own path; a workflow is a path you define: explicit steps, in a fixed order, each with typed input and output. ' +
    'In Mastra you create a step with createStep({ id, inputSchema, outputSchema, execute }) and a workflow with createWorkflow({ id, inputSchema, outputSchema }).then(step).commit(). ' +
    'You run it with workflow.createRun() and then run.start({ inputData }) or run.stream({ inputData }), and the result tells you the status, the final result, each step’s output and timing, and the path taken. ' +
    'Mastra validates the workflow’s input at runtime: an empty email or an unknown currency fails with “Invalid input data” before any step runs, so no model is called. ' +
    'Output is different: in this Mastra version a step that returns the wrong shape still finishes with status “success”, so the output schema is a compile-time promise unless your application checks it. ' +
    'This lab adds that check explicitly: the final result is parsed with the workflow’s own outputSchema before anything trusts it. ' +
    'The single step does real work: an agent turns a free-text order email into typed items with structured output, and plain code prices them from a catalog. ' +
    'Streaming the run gives you a live trace: workflow start, step start, step result and workflow finish.',
  objectives: [
    'Define a workflow with input and output schemas and one typed step',
    'Run it with createRun() and stream its lifecycle events',
    'Know which boundaries Mastra validates at runtime and which it does not',
    'Validate workflow output explicitly before trusting it',
  ],
  prerequisites: ['lab-25'],
  inputs: [
    {
      kind: 'textarea',
      name: 'email',
      label: 'Order email',
      help: 'Products: ceramic mug, baseball cap, T-shirt, tote bag. Codes: WELCOME10, BULK5.',
      maxLength: 2000,
      default: email,
      required: true,
    },
    {
      kind: 'select',
      name: 'currency',
      label: 'Currency',
      options: [
        { value: 'EUR', label: 'EUR' },
        { value: 'USD', label: 'USD (fixed demo rate 1.09)' },
        { value: 'GBP', label: 'GBP (fixed demo rate 0.86)' },
        { value: 'JPY', label: 'JPY (not allowed by the workflow schema)' },
      ],
      default: 'EUR',
      required: true,
    },
    {
      kind: 'boolean',
      name: 'buggyStep',
      label: 'Simulate a buggy step (returns the total as text)',
      default: false,
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
  exampleInput: { email, currency: 'EUR', buggyStep: false, modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'One step runs. The output passes QuoteSchema: 2 mugs (€25.00) and 3 caps (€45.00), subtotal €70.00, WELCOME10 −€7.00, total €63.00. The invalid-input probe is rejected by Mastra.',
    example: {
      workflowId: 'quote-workflow',
      status: 'success',
      stepExecutionPath: ['extract-and-price'],
      outputValid: true,
      quote: {
        currency: 'EUR',
        lines: [
          { sku: 'MUG-01', name: 'Ceramic mug', quantity: 2, unitPrice: 1250, lineTotal: 2500 },
          { sku: 'CAP-02', name: 'Baseball cap', quantity: 3, unitPrice: 1500, lineTotal: 4500 },
        ],
        subtotal: 7000,
        discountCode: 'WELCOME10',
        discount: 700,
        total: 6300,
        formattedTotal: '€63.00',
      },
      inputProbe: { rejected: true },
      inputError: null,
    },
  },
  guide: {
    procedure: [
      'Open workflow.ts in the Source tab: find the two schemas, the step and .then(step).commit().',
      'Run the example and follow the four workflow events in the timeline.',
      'Read inputProbe in the result: what did Mastra say about the invalid input?',
      'Choose JPY and run: the run is rejected before any step.',
      'Turn on “Simulate a buggy step” and run: what status does Mastra report, and what does the output check say?',
      'Optional (costs money): run live; a real model does the extraction with structured output.',
    ],
    prediction: 'With the buggy step on, will Mastra report the workflow as failed?',
    hints: [
      { level: 1, text: 'Look at which schemas Mastra checks at runtime.' },
      { level: 2, text: 'Input is validated before the step; the step’s return value is not.' },
      { level: 3, text: 'No: the status is “success” with total as a string. Only the app’s outputSchema check catches it.' },
    ],
    commonMistakes: [
      {
        mistake: 'Trusting the output type because the workflow declares outputSchema.',
        fix: 'Parse the result with the schema before using it.',
      },
      { mistake: 'Forgetting .commit().', fix: 'A workflow must be committed before createRun().' },
      {
        mistake: 'Putting LLM output straight into calculations.',
        fix: 'Extract with structured output, validate, then compute in code.',
      },
      { mistake: 'Reusing one run for several inputs.', fix: 'Create a new run (createRun()) per execution.' },
    ],
    challenge: {
      prompt:
        'Make the step reject unknown discount codes with a typed error instead of ignoring them. How does the workflow result and trace change?',
      successCriteria: ['An unknown code produces a failed step with a clear message', 'Known codes still price correctly'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'How do you build a Mastra workflow with one step?',
      choices: [
        'new Workflow([step])',
        'createWorkflow({ id, inputSchema, outputSchema }).then(step).commit()',
        'agent.workflow(step)',
        'createStep().run()',
      ],
      correctIndex: 1,
      explanation: 'Chain steps with .then() and commit the workflow.',
    },
    {
      id: 'q2',
      prompt: 'What happens when the workflow input does not match inputSchema?',
      choices: [
        'The step fixes it',
        'Mastra rejects it with “Invalid input data” before any step runs',
        'The status is success',
        'The model is called anyway',
      ],
      correctIndex: 1,
      explanation: 'Input validation is on by default.',
    },
    {
      id: 'q3',
      prompt: 'A step returns a string where outputSchema says number. What does Mastra 1.78 report?',
      choices: ['A validation error', 'status: "success" with the wrong value', 'A timeout', 'It converts the string'],
      correctIndex: 1,
      explanation: 'Output is not validated at runtime; check it yourself.',
    },
    {
      id: 'q4',
      prompt: 'Which call gives you live lifecycle events?',
      choices: ['run.start()', 'run.stream()', 'workflow.commit()', 'createStep()'],
      correctIndex: 1,
      explanation: 'stream() emits workflow-start, step start/result and finish chunks.',
    },
  ],
  sourceFiles: [
    { path: 'workflow.ts', title: 'The workflow', description: 'Schemas, the typed step, the catalog and pricing.' },
    { path: 'run.ts', title: 'Lab run', description: 'Input probe, typed run, output check and offline extraction.' },
    {
      path: 'shared/workflow-stream.ts',
      title: 'Workflow streaming',
      description: 'Chunks to timeline events, and the output-validating wrapper.',
    },
  ],
  exercise: {
    instructions:
      'In your project, create a workflow with inputSchema and outputSchema and one step, run it with createRun().start(), and write tests that (1) invalid input is rejected and (2) a deliberately wrong step output is caught by parsing the result with the output schema.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'expected-typed-output', label: 'The workflow produced output that passes its schema and matches the catalog prices' },
    { id: 'input-validated', label: 'Mastra rejected invalid workflow input before any step ran' },
    { id: 'single-typed-step', label: 'Exactly one typed step ran' },
    { id: 'trace-ordered', label: 'The trace shows start → step running → step result → finish, in order' },
    { id: 'nothing-invented', label: 'Every quoted line is a real catalog product with a positive quantity' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Agents vs workflows', minutes: 1, talkingPoints: ['A path you define', 'Typed boundaries'] },
      {
        title: 'Step and workflow',
        minutes: 1.5,
        talkingPoints: ['createStep, createWorkflow, then, commit', 'createRun().stream()'],
      },
      { title: 'Input validation', minutes: 1, talkingPoints: ['Invalid input data', 'No step, no model call'] },
      { title: 'Output is a promise', minutes: 1.5, talkingPoints: ['Buggy step still “success”', 'Parse with outputSchema'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Structured extraction + code', 'Next: sequential steps'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 1 },
    costNotice: 'Offline is free. Live mode makes one structured-output model call; the invalid-input probe makes none.',
  },
  tags: ['workflows', 'schemas', 'typed-steps', 'validation'],
} satisfies LabDefinitionInput;
