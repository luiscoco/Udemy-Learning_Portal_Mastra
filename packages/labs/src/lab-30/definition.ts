import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const documents = [
  {
    docId: 'D-1',
    title: 'Refund policy',
    text: 'Customers can request a refund within 30 days of purchase. Refunds are issued to the original payment method within five business days.',
  },
  {
    docId: 'D-2',
    title: 'Shipping times',
    text: 'Standard shipping takes three to five days. Express shipping arrives the next business day when ordered before noon.',
  },
  { docId: 'D-3', title: 'Draft', text: 'TODO write this' },
  {
    docId: 'D-4',
    title: 'Password reset',
    text: 'To reset a password, open the login page and choose “Forgot password”. A reset link valid for one hour is emailed to the account address.',
  },
  {
    docId: 'D-5',
    title: 'Warranty',
    text: 'Hardware products carry a two-year warranty covering manufacturing defects. Accidental damage is not covered by the warranty.',
  },
];

export const lab30Definition = {
  id: 'lab-30',
  number: 30,
  title: 'Foreach processing',
  moduleId: 'module-06',
  summary:
    'Summarise a batch of documents with .foreach() at a bounded concurrency, keep results in input order, and represent per-document failures without losing the rest of the batch.',
  concept:
    'Many workflows apply the same step to every item of a list: summarise each document, enrich each record. ' +
    'In Mastra, .foreach(step, { concurrency }) runs the step once per array element, at most `concurrency` at a time, and passes an array of outputs to the next step, in the same order as the input even when items finish out of order. ' +
    'Bounding concurrency matters: a batch of a hundred documents should not open a hundred provider calls at once. ' +
    'Empty and single-item batches are normal inputs, not special cases: an empty array produces an empty result and the next step still runs. ' +
    'Failure is the subtle part. If one iteration throws, Mastra fails the whole foreach step and the workflow, and the results of the items that succeeded are not kept. ' +
    'So each item catches its own errors and returns a result union: { ok: true, summary, … } or { ok: false, error: { code, message } }. The aggregate step then reports how many succeeded and failed, and the batch status: empty, complete, partial or all-failed. ' +
    'This lab measures the concurrency it actually achieved with a counter inside the step, instead of trusting the setting.',
  objectives: [
    'Process an array with .foreach() at a bounded concurrency',
    'Handle zero, one and many items with the same code path',
    'Represent per-item failures as data so successful results are kept',
    'Measure concurrency and verify result order',
  ],
  prerequisites: ['lab-29'],
  inputs: [
    {
      kind: 'json',
      name: 'documents',
      label: 'Documents (0–12): docId, title, text, optional simulateFailure',
      maxBytes: 56_000,
      default: documents,
      required: true,
    },
    { kind: 'number', name: 'concurrency', label: 'Concurrency (items in flight)', min: 1, max: 4, step: 1, default: 2, required: true },
    {
      kind: 'select',
      name: 'failureHandling',
      label: 'When a document fails',
      options: [
        { value: 'capture', label: 'Capture it as a typed result' },
        { value: 'throw', label: 'Throw (anti-pattern)' },
      ],
      default: 'capture',
      required: true,
    },
    {
      kind: 'number',
      name: 'simulatedLatencyMs',
      label: 'Simulated latency per document (ms, offline only)',
      min: 0,
      max: 2000,
      step: 50,
      default: 200,
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
  exampleInput: { documents, concurrency: 2, failureHandling: 'capture', simulatedLatencyMs: 200, modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'Five results in input order. D-3 is too short and carries EMPTY_DOCUMENT; the other four have a summary and keywords. The batch status is partial and the measured peak concurrency is 2.',
    example: {
      workflowStatus: 'success',
      concurrency: 2,
      peakInFlight: 2,
      aggregateRan: true,
      report: {
        status: 'partial',
        total: 5,
        succeeded: 4,
        failed: 1,
        results: [
          { ok: true, docId: 'D-1', summary: 'Customers can request a refund within 30 days of purchase.' },
          { ok: true, docId: 'D-2' },
          { ok: false, docId: 'D-3', error: { code: 'EMPTY_DOCUMENT', message: 'only 3 word(s); at least 5 are needed' } },
          { ok: true, docId: 'D-4' },
          { ok: true, docId: 'D-5' },
        ],
      },
    },
  },
  guide: {
    procedure: [
      'Open batch.ts in the Source tab: find .foreach(processDocument, { concurrency }), the result union and aggregateResults().',
      'Run the example. In the timeline, watch processDocument[0]…[4] complete two at a time; compare peak in flight with the limit.',
      'Set concurrency to 1, then 4, and compare the total duration.',
      'Replace the documents with [] and run; then with a single document.',
      'Add "simulateFailure": true to D-5 and run: what happens to the other documents?',
      'Switch “When a document fails” to Throw and run: what is kept now?',
      'Optional (costs money): run live; one model call per valid document.',
    ],
    prediction: 'If one document throws inside a .foreach() step, how many summaries will the aggregate step receive?',
    hints: [
      { level: 1, text: 'A thrown error fails the step, not just the item.' },
      { level: 2, text: 'When a step fails, the next step does not run.' },
      { level: 3, text: 'None: the workflow fails and the successful items are lost. Catch per item and return { ok: false, error } instead.' },
    ],
    commonMistakes: [
      { mistake: 'Letting one item throw.', fix: 'Return a typed per-item error so the rest of the batch survives.' },
      { mistake: 'Unbounded parallelism (Promise.all over the whole list).', fix: 'Use .foreach with an explicit concurrency.' },
      { mistake: 'Treating an empty batch as an error.', fix: 'Report it explicitly as status “empty”.' },
      { mistake: 'Matching results to inputs by completion order.', fix: 'Foreach output follows input order; carry the docId anyway and check it.' },
    ],
    challenge: {
      prompt: 'Retry PROCESSING_FAILED items once before giving up, without retrying EMPTY_DOCUMENT. How do you show the retry in the result?',
      successCriteria: ['Only transient errors are retried', 'The result records the number of attempts'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What does the step after .foreach(step) receive?',
      choices: ['The last item’s output', 'An array of outputs in input order', 'An array in completion order', 'An object keyed by index'],
      correctIndex: 1,
      explanation: 'Order follows the input, even when items finish out of order (verified).',
    },
    {
      id: 'q2',
      prompt: 'One iteration throws. What happens in this Mastra version?',
      choices: ['It is skipped', 'The foreach step and workflow fail; successful results are not kept', 'It is retried forever', 'Its output is null'],
      correctIndex: 1,
      explanation: 'Hence the per-item result union.',
    },
    {
      id: 'q3',
      prompt: 'What does an empty input array do?',
      choices: ['Throws', 'Suspends the workflow', 'Produces [] and the next step runs', 'Skips the rest of the workflow'],
      correctIndex: 2,
      explanation: 'Zero items is a normal case; report it as “empty”.',
    },
    {
      id: 'q4',
      prompt: 'Why set a concurrency limit?',
      choices: ['Mastra requires it', 'To bound load on the provider and stay within rate limits', 'To keep results ordered', 'To save memory in the browser'],
      correctIndex: 1,
      explanation: 'Ordering is already guaranteed; concurrency bounds load.',
    },
  ],
  sourceFiles: [
    { path: 'batch.ts', title: 'Foreach workflow', description: 'Document schema, per-item result union, in-flight counter and aggregate.' },
    { path: 'run.ts', title: 'Lab run', description: 'Iteration trace, measured concurrency and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, process an array with .foreach() at concurrency 2 where each item returns { ok, … } or { ok: false, error }, and write tests for zero, one and many items plus one failing item.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'all-accounted', label: 'Every document has exactly one result, in input order' },
    { id: 'concurrency-bounded', label: 'Measured concurrency never exceeded the limit' },
    { id: 'partial-failures-kept', label: 'Failed documents carry a typed error and successful results are kept' },
    { id: 'aggregated', label: 'The aggregate step ran and its counts match the results' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Batches', minutes: 1, talkingPoints: ['Same step, many items'] },
      { title: '.foreach() and concurrency', minutes: 1.5, talkingPoints: ['Bounded in-flight', 'Input order kept', 'Measured peak'] },
      { title: 'Zero and one', minutes: 1, talkingPoints: ['Empty is a status, not an error'] },
      { title: 'Partial failure', minutes: 1.5, talkingPoints: ['Throw loses the batch', 'Result union keeps it'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Aggregate status', 'Next module: nested workflows'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 180_000,
    budget: { maxSteps: 12 },
    costNotice: 'Offline is free (latency is simulated). Live mode makes one model call per valid document (four in the example).',
  },
  tags: ['workflows', 'foreach', 'concurrency', 'batch', 'partial-failure'],
} satisfies LabDefinitionInput;
