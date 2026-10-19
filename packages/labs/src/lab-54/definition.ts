import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const report =
  'Customers cannot complete checkout since 12:01. Orders hang on submit and then show an error. All regions are affected.';

export const lab54Definition = {
  id: 'lab-54',
  number: 54,
  title: 'Coordinated agent workflow',
  moduleId: 'module-11',
  summary:
    'Orchestrate an extractor, a diagnostician and a communicator agent with five typed workflow steps, validate every hand-over, retry failures with backoff, contain the final failure in an error boundary, and prove the step trace is the same on every run.',
  concept:
    'In the previous labs agents decided parts of the control flow. Here the workflow decides everything: the order of the steps is fixed in code, and agents only fill in typed values. ' +
    'Three agents work on an incident: the extractor turns the report into an Incident, the diagnostician explains the likely cause from the logs, and the communicator writes the public status update. Between them, a deterministic step fetches the logs, so no model decides which data is read. ' +
    'Every step has Zod input and output schemas. Mastra validates step inputs but not step outputs, so each agent result is validated by the step before it is passed on, including rules that cross steps: the diagnosis may only cite log lines that were actually fetched, and the update must name the service and must not leak internal log ids. ' +
    'Agent steps use Mastra’s retries option: a failed attempt throws, and Mastra runs the step again with a higher retryCount, which the step uses for an exponential backoff. ' +
    'On the last attempt the step does not throw. Its error boundary returns a typed failure instead, so the workflow keeps going and decides what that failure means: without a diagnosis the update is still published as degraded, but without an extraction nothing is published and an engineer is called. ' +
    'Because the order is fixed, the same input always produces the same step trace, which the lab checks by running it twice.',
  objectives: [
    'Coordinate three agents with typed workflow steps',
    'Validate agent output at every step boundary',
    'Retry failed steps with Mastra retries and backoff',
    'Contain failures in error boundaries and verify a stable trace',
  ],
  prerequisites: ['lab-53'],
  inputs: [
    {
      kind: 'textarea',
      name: 'report',
      label: 'Incident report',
      minLength: 10,
      maxLength: 2000,
      rows: 3,
      default: report,
      required: true,
    },
    {
      kind: 'select',
      name: 'fault',
      label: 'Fault',
      options: [
        { value: 'none', label: 'None' },
        { value: 'invalid-extraction', label: 'Invalid extraction (first answer corrupted)' },
        { value: 'transient-diagnosis', label: 'Transient diagnosis outage (two 503s)' },
        { value: 'permanent-diagnosis', label: 'Permanent diagnosis outage' },
        { value: 'extract-down', label: 'Extractor down' },
      ],
      default: 'none',
      required: true,
    },
    { kind: 'number', name: 'stepRetries', label: 'Retries per agent step', min: 0, max: 3, step: 1, default: 2, required: true },
    {
      kind: 'number',
      name: 'repeatRuns',
      label: 'Repeat the run (trace comparison)',
      min: 1,
      max: 3,
      step: 1,
      default: 2,
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
  exampleInput: { report, fault: 'none', stepRetries: 2, repeatRuns: 2, modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'Both runs follow extract → fetch-logs → diagnose → communicate → assemble with one attempt per agent step. The incident is a sev1 on checkout; the diagnosis cites L2 and L4 (payment gateway timeout, pool exhausted); the update is published and the status is complete. Both signatures are identical.',
    example: {
      outcome: {
        status: 'complete',
        incident: { service: 'checkout', severity: 'sev1', customerImpact: true },
        diagnosis: {
          likelyCause: 'Payment gateway timeout after 30s (order submit)',
          confidence: 'high',
          evidence: ['L2', 'L4'],
        },
        failures: [],
      },
    },
  },
  guide: {
    procedure: [
      'Open workflow.ts in the Source tab: find the five steps, the retries option and where each agent result is validated.',
      'Run the example and compare the two signatures in the stable-trace check.',
      'Choose “Transient diagnosis outage” and run: how many attempts does diagnose need, and what are the backoff delays?',
      'Set “Retries per agent step” to 1 and run the same fault again: what is the status now, and is the update still published?',
      'Choose “Invalid extraction”: which code does the failed attempt get, and who caught it, Mastra or the step?',
      'Choose “Extractor down”: which agents run, and what does the workflow do instead of publishing?',
    ],
    prediction: 'With “Permanent diagnosis outage” and 2 retries, does the workflow succeed or fail?',
    hints: [
      { level: 1, text: 'Look at what the diagnose step returns on its last attempt.' },
      { level: 2, text: 'The boundary returns { ok: false } instead of throwing.' },
      {
        level: 3,
        text: 'The workflow succeeds: diagnose fails three times, and the update is published as degraded with the cause under investigation.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Passing an agent’s output on without validating it.',
        fix: 'Parse it with the step’s schema; Mastra does not validate step outputs.',
      },
      { mistake: 'Retrying without backoff.', fix: 'Wait longer before each retry (here 100 ms, then 200 ms, …).' },
      {
        mistake: 'Letting the final failure crash the workflow.',
        fix: 'Return a typed failure and decide downstream what it means.',
      },
      {
        mistake: 'Treating every failure the same.',
        fix: 'A missing diagnosis degrades the update; a missing extraction stops publishing.',
      },
      { mistake: 'Letting a model choose which data to read.', fix: 'Fetch it in a deterministic step from typed values.' },
    ],
    challenge: {
      prompt:
        'Add a fourth agent, a reviewer, that must approve the update before assemble, and make a rejected update retry the communicator once.',
      successCriteria: [
        'Four agents in the trace',
        'A rejected update is rewritten once',
        'The signature is still identical across runs',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Which outputs does Mastra validate at runtime in a workflow?',
      choices: ['All step outputs', 'Only workflow and step inputs', 'Only the final output', 'None'],
      correctIndex: 1,
      explanation: 'Inputs are validated; outputs need app-level validation in the step.',
    },
    {
      id: 'q2',
      prompt: 'How does Mastra know a step should be retried?',
      choices: ['The step returns ok: false', 'The step throws and has retries left', 'The model says so', 'A timeout only'],
      correctIndex: 1,
      explanation: 'With retries: n, a throwing step runs again with retryCount + 1.',
    },
    {
      id: 'q3',
      prompt: 'What does the error boundary do on the last attempt?',
      choices: ['Throws', 'Returns a typed failure so the workflow continues', 'Retries forever', 'Skips the step silently'],
      correctIndex: 1,
      explanation: 'The workflow then decides what the failure means for the outcome.',
    },
    {
      id: 'q4',
      prompt: 'Why is the step trace the same on every run?',
      choices: [
        'The model is deterministic',
        'The order of steps is fixed in code',
        'The run is cached',
        'Mastra sorts the steps',
      ],
      correctIndex: 1,
      explanation: 'Agents fill in values; they never choose the next step.',
    },
  ],
  sourceFiles: [
    { path: 'workflow.ts', title: 'Typed workflow', description: 'Five steps, retries, faults and the outcome decision.' },
    { path: 'boundary.ts', title: 'Error boundary', description: 'Backoff, validation, attempt records and the typed failure.' },
    { path: 'schemas.ts', title: 'Schemas', description: 'Incident, Diagnosis, Result and the fixture logs.' },
    { path: 'agents.ts', title: 'Agents', description: 'Instructions, typed prompts and offline scripts.' },
    { path: 'run.ts', title: 'Lab run', description: 'Repeat runs, trace signatures and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, chain three agent steps with Zod input and output schemas, validate each agent result in its step, use retries with backoff, and return a typed failure on the last attempt so a later step can degrade gracefully.',
    solutionFile: 'solution.md',
  },
  checks: [
    {
      id: 'agents-coordinated',
      label: 'The agents run in the fixed order extractor → diagnostician → communicator, each only when its typed input exists',
    },
    { id: 'typed-boundaries', label: 'Every value passed between steps matches its schema and the cross-step rules' },
    { id: 'retry-behavior', label: 'Failed attempts are retried with doubling backoff, up to the retry limit' },
    {
      id: 'error-boundaries',
      label: 'Failures are contained: the workflow succeeds with the expected complete, degraded or failed-safe status',
    },
    { id: 'stable-trace', label: 'Repeated runs of the same input produce the same step trace' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      {
        title: 'Deterministic orchestration',
        minutes: 1,
        talkingPoints: ['Agents fill values, the workflow decides', 'Data fetched by a plain step'],
      },
      { title: 'Typed boundaries', minutes: 1.5, talkingPoints: ['Input vs output validation', 'Cross-step rules'] },
      { title: 'Retries', minutes: 1.5, talkingPoints: ['retries and retryCount', 'Backoff', 'One stream event per series'] },
      { title: 'Error boundaries', minutes: 2, talkingPoints: ['Typed failure on the last attempt', 'Degraded vs failed-safe'] },
      { title: 'Stable trace', minutes: 1, talkingPoints: ['Signatures across runs', 'Next: research team capstone'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 180_000,
    maxTimeoutMs: 300_000,
    budget: { maxSteps: 1 },
    costNotice:
      'Offline is free (scripted models; faults are simulated at the step boundary). Live makes three agent calls per run plus one per retry, times the number of repeat runs, on your provider key.',
  },
  tags: ['multi-agent', 'workflows', 'retries', 'error-boundaries', 'typed-steps'],
} satisfies LabDefinitionInput;
