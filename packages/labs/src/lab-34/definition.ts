import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const invoices = [
  { invoiceId: 'INV-1', customer: 'Ana Ruiz', amount: 120, failTimes: 0 },
  { invoiceId: 'INV-2', customer: 'Sam Lee', amount: 80.5, failTimes: 2 },
  { invoiceId: 'INV-3', customer: 'Kim Novak', amount: 42, failTimes: 0 },
  { invoiceId: 'INV-4', customer: 'Lea Martin', amount: 15.25, failTimes: 0 },
];

export const lab34Definition = {
  id: 'lab-34',
  number: 34,
  title: 'Long-running reliability',
  moduleId: 'module-07',
  summary:
    'Run a billing batch that survives transient provider errors and a worker crash: Mastra retries steps and restarts the run from persisted state, and idempotency keys make sure no invoice is charged twice.',
  concept:
    'A long-running job will meet failures: the payment provider answers 503 for a moment, or the worker process dies halfway through a batch. Reliability comes in layers. ' +
    'First, retries: retryConfig { attempts, delay } on the workflow makes Mastra run a failing step again after a pause, which absorbs short provider outages. ' +
    'Second, persisted progress: with storage on the Mastra instance, every completed step and the workflow state (stateSchema plus setState) are saved, so a crash loses at most the step that was running. ' +
    'Third, recovery: a new worker finds the run still marked “running” and calls restart() for it; completed steps are skipped, and the interrupted step runs again from its beginning. ' +
    'That last detail is the trap. If the crash happened after the provider charged the card but before the step finished, the restarted step charges again. ' +
    'Retries and restarts give you at-least-once execution, and only an idempotency key per operation (charge:<batch>:<invoice>) turns that into exactly-once effects, because the provider replays the first charge. ' +
    'In this lab the crash is simulated inside the server (the worker stops mid-step and its instance is discarded); an automated test also kills a real process. ' +
    'Every charge is written to a ledger, so the checks count money instead of trusting the design.',
  objectives: [
    'Retry transient failures with retryConfig',
    'Keep progress in persisted workflow state',
    'Recover an interrupted run with restart()',
    'Use idempotency keys so recovery never duplicates an operation',
  ],
  prerequisites: ['lab-33'],
  inputs: [
    {
      kind: 'json',
      name: 'invoices',
      label: 'Invoices (1–6): invoiceId, customer, amount, failTimes (0–2 transient 503s before success)',
      maxBytes: 6_000,
      default: invoices,
      required: true,
    },
    { kind: 'text', name: 'crashAfter', label: 'Crash the worker right after charging this invoice ("none" for no crash)', minLength: 4, maxLength: 12, default: 'INV-3', required: true },
    {
      kind: 'select',
      name: 'idempotency',
      label: 'Charge idempotency',
      options: [
        { value: 'key', label: 'Idempotency key per invoice and batch' },
        { value: 'none', label: 'No key (anti-pattern)' },
      ],
      default: 'key',
      required: true,
    },
    { kind: 'number', name: 'retryDelayMs', label: 'Delay between retries (ms)', min: 0, max: 2000, step: 50, default: 100, required: true },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: { invoices, crashAfter: 'INV-3', idempotency: 'key', retryDelayMs: 100, modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'Worker A charges INV-1, retries INV-2 twice after 503s, then crashes right after INV-3 is charged. Worker B finds the run “running”, restarts it: INV-3’s step runs again (its charge is replayed by the key), then INV-4 and closeBatch. Every invoice has exactly one charge and the state total is 257.75.',
    example: {
      idempotency: 'key',
      crashAfter: 'INV-3',
      firstRun: { status: 'crashed' },
      detection: { status: 'running', runningSteps: ['charge-INV-3'], stateCharged: ['INV-1', 'INV-2'] },
      restart: { status: 'success', result: { chargedCount: 4, total: 257.75 } },
      chargeCounts: { 'INV-1': 1, 'INV-2': 1, 'INV-3': 1, 'INV-4': 1 },
      providerCalls: { 'INV-1': 1, 'INV-2': 3, 'INV-3': 2, 'INV-4': 1 },
    },
  },
  guide: {
    procedure: [
      'Open billing.ts in the Source tab: find retryConfig, stateSchema/setState in the charge steps, and the idempotency key.',
      'Run the example. In the timeline, find where worker A stops and which steps worker B runs after the restart.',
      'In the result, compare detection.stateCharged with executions: what state did INV-3’s step see when it ran again?',
      'Switch “Charge idempotency” to No key and run: how many charges does INV-3 get?',
      'Set crashAfter to INV-1, then to INV-4: which steps does the restart run each time?',
      'Set INV-2’s failTimes to 0 and the retry delay to 1000: what changes?',
      'Optional (costs money): run live; only closeBatch calls the model, once.',
    ],
    prediction: 'Worker A crashes right after INV-3 is charged. When worker B restarts the run, which charge steps will execute?',
    hints: [
      { level: 1, text: 'Completed steps are in the snapshot.' },
      { level: 2, text: 'INV-3’s step was still running when the worker died.' },
      { level: 3, text: 'charge-INV-3 (again, from its start) and charge-INV-4. The key makes the provider replay INV-3’s first charge.' },
    ],
    commonMistakes: [
      { mistake: 'Assuming a restart resumes in the middle of a step.', fix: 'It re-runs the interrupted step from its start; make its side effects idempotent.' },
      { mistake: 'Generating a new idempotency key per attempt.', fix: 'Derive it from stable data (batch and invoice), so retries and restarts reuse it.' },
      { mistake: 'Keeping progress in a variable.', fix: 'Use workflow state (setState), which is persisted with the snapshot.' },
      { mistake: 'Restarting every “running” run at startup.', fix: 'Some may be live on another worker; use a lease or heartbeat before taking a run over.' },
    ],
    challenge: {
      prompt: 'Two workers share the database. How would you make sure only one of them restarts a crashed run, and that a slow but alive worker is not taken over?',
      successCriteria: ['A lease with an expiry is acquired atomically', 'The worker renews it while running'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'A worker dies inside step 3 of 5. What does restart() run?',
      choices: ['All five steps', 'Step 3 from its start, then 4 and 5', 'Only steps 4 and 5', 'Nothing'],
      correctIndex: 1,
      explanation: 'Completed steps are skipped; the interrupted step runs again (verified).',
    },
    {
      id: 'q2',
      prompt: 'Why can a restart duplicate a charge?',
      choices: ['Mastra charges twice', 'The provider already charged before the crash, and the step runs again', 'The state is lost', 'Retries are disabled'],
      correctIndex: 1,
      explanation: 'At-least-once execution needs idempotent effects.',
    },
    {
      id: 'q3',
      prompt: 'What does retryConfig { attempts: 3, delay: 100 } do?',
      choices: ['Runs every step three times', 'Retries a failing step up to three times, waiting 100 ms between attempts', 'Restarts crashed runs', 'Limits the batch to three items'],
      correctIndex: 1,
      explanation: 'Retries absorb transient errors; crashes need restart.',
    },
    {
      id: 'q4',
      prompt: 'Where should a long-running job keep its progress?',
      choices: ['In a module variable', 'In persisted workflow state', 'In the model’s context', 'In the browser'],
      correctIndex: 1,
      explanation: 'State saved with the snapshot survives crashes.',
    },
  ],
  sourceFiles: [
    { path: 'billing.ts', title: 'Billing workflow', description: 'Per-invoice charge steps, workflow state, retryConfig, provider with idempotency keys.' },
    { path: 'run.ts', title: 'Lab run', description: 'Simulated crash, detection from storage, restart and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, make a workflow with persisted state and retryConfig, kill the process inside a step that performs a side effect, restart the run from another process, and assert the side effect happened once.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'crash-detected', label: 'A fresh instance found the interrupted run in storage, with the earlier steps completed' },
    { id: 'resumed-after-crash', label: 'The restart continued from the interrupted step; no earlier charge step ran again' },
    { id: 'state-persisted', label: 'Workflow state survived the crash and the final state covers every invoice' },
    { id: 'no-duplicate-charges', label: 'Every invoice was charged exactly once' },
    { id: 'transient-recovered', label: 'Transient provider errors were retried until the charge succeeded' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'What fails in long jobs', minutes: 1, talkingPoints: ['503s', 'Crashes', 'Restarts'] },
      { title: 'Retries', minutes: 1, talkingPoints: ['retryConfig attempts and delay'] },
      { title: 'State and restart', minutes: 2, talkingPoints: ['stateSchema / setState', 'Snapshot after a crash', 'restart() re-runs the interrupted step'] },
      { title: 'Idempotency', minutes: 2, talkingPoints: ['At-least-once vs exactly-once effects', 'Stable keys', 'The no-key contrast'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Leases for multiple workers', 'Next module: tools and integrations'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 2 },
    costNotice: 'Offline is free. Live mode makes one model call (the operator summary in closeBatch). Charges are simulated and stored locally.',
  },
  tags: ['workflows', 'reliability', 'retries', 'state', 'restart', 'idempotency'],
} satisfies LabDefinitionInput;
