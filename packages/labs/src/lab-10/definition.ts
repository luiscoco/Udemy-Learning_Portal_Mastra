import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab10Definition = {
  id: 'lab-10',
  number: 10,
  title: 'Failures, retries and limits',
  moduleId: 'module-02',
  summary:
    'Retry only what is safe: classify failures, back off exponentially, respect Retry-After, and stop at attempt and time limits.',
  concept:
    'Model providers fail in ordinary ways: they become overloaded, rate-limit you, time out or reject a bad request. ' +
    'Some failures are worth retrying, such as HTTP 429, 503 or a timeout, because the same request may succeed a moment later; others, such as 400 Bad Request or 401 Unauthorized, will fail every time, so retrying only wastes money and time. ' +
    'Retries need exponential backoff, waiting longer after each failure, so you do not hammer a struggling service, and they should honour a Retry-After hint when the provider sends one. ' +
    'Every retry policy needs hard limits: a maximum number of attempts, a timeout per attempt and a total time budget, so a request can never hang forever or burn tokens in a loop. ' +
    'Only idempotent work may be retried automatically; if a call has side effects, such as sending an email, a retry could do it twice. ' +
    'Mastra agents accept maxRetries and model fallback arrays for simple cases, while this lab uses an explicit application-level policy so every decision is visible in the timeline; note that an aborted generate() call resolves with empty text instead of throwing, so the policy checks the signal itself. ' +
    'Offline fault injection makes the provider fail in a scripted way, so the retry counts are exactly predictable.',
  objectives: [
    'Classify failures as retryable or non-retryable',
    'Apply exponential backoff and honour Retry-After',
    'Bound retries with max attempts, per-attempt timeouts and a total budget',
    'Explain why only idempotent calls may be retried automatically',
  ],
  prerequisites: ['lab-09'],
  inputs: [
    {
      kind: 'text',
      name: 'prompt',
      label: 'Prompt',
      minLength: 1,
      maxLength: 1000,
      default: 'Summarise our refund policy in one sentence.',
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
      name: 'scenario',
      label: 'Failure scenario (offline)',
      options: [
        { value: 'transient-then-success', label: '503, then 429, then success' },
        { value: 'always-unavailable', label: 'Always 503 Service Unavailable' },
        { value: 'bad-request', label: '400 Bad Request (non-retryable)' },
        { value: 'slow-then-success', label: 'First attempt times out, then success' },
        { value: 'rate-limited-retry-after', label: '429 with Retry-After 600 ms, then success' },
        { value: 'none', label: 'No failures' },
      ],
      default: 'transient-then-success',
      required: true,
    },
    { kind: 'number', name: 'maxAttempts', label: 'Max attempts', min: 1, max: 6, default: 4, required: true },
    {
      kind: 'number',
      name: 'baseDelayMs',
      label: 'Base backoff delay (ms)',
      help: 'Waits are base, 2×base, 4×base… (capped at 4000 ms).',
      min: 10,
      max: 2000,
      step: 10,
      default: 200,
      required: true,
    },
    {
      kind: 'number',
      name: 'perAttemptTimeoutMs',
      label: 'Timeout per attempt (ms)',
      help: 'Live models often need several seconds per call: use 10000 in live mode.',
      min: 200,
      max: 10000,
      step: 100,
      default: 1500,
      required: true,
    },
    {
      kind: 'number',
      name: 'totalBudgetMs',
      label: 'Total time budget (ms)',
      min: 500,
      max: 30000,
      step: 500,
      default: 10000,
      required: true,
    },
    { kind: 'boolean', name: 'idempotent', label: 'The call is idempotent (safe to repeat)', default: true, required: false },
  ],
  exampleInput: {
    prompt: 'Summarise our refund policy in one sentence.',
    modelId: 'openai/gpt-5-mini',
    scenario: 'transient-then-success',
    maxAttempts: 4,
    baseDelayMs: 200,
    perAttemptTimeoutMs: 1500,
    totalBudgetMs: 10000,
    idempotent: true,
  },
  expectedOutput: {
    description:
      'Three attempts: 503 (retryable, wait 200 ms), 429 (retryable, wait 400 ms), then success; outcome succeeded with 2 retries.',
    example: {
      outcome: 'succeeded',
      stopReason: 'success',
      retries: 2,
      attempts: [
        { attempt: 1, outcome: 'failure', statusCode: 503, classification: 'retryable', waitMs: 200 },
        { attempt: 2, outcome: 'failure', statusCode: 429, classification: 'retryable', waitMs: 400 },
        { attempt: 3, outcome: 'success', waitMs: 0 },
      ],
    },
  },
  guide: {
    procedure: [
      'Run the example and read the attempt steps and the "wait" logs in the timeline.',
      'Choose "Always 503" and predict how many attempts happen before the run stops. Run it.',
      'Choose "400 Bad Request": confirm there is exactly one attempt.',
      'Choose "First attempt times out": the first attempt stops at the per-attempt timeout and is retried.',
      'Choose "429 with Retry-After": the wait is 600 ms instead of 200 ms.',
      'Untick "idempotent" with the transient scenario: the policy refuses to retry.',
      'Set the total budget to 1000 ms with "Always 503" and see the budget stop the retries.',
    ],
    prediction:
      'With "Always 503", max attempts 4 and base delay 200 ms, how many attempts and how much total waiting will there be?',
    hints: [
      { level: 1, text: 'There is no wait after the last attempt.' },
      { level: 2, text: 'Waits double: 200, 400, 800…' },
      { level: 3, text: 'Four attempts and three waits: 200 + 400 + 800 = 1400 ms, then stopReason "max-attempts".' },
    ],
    commonMistakes: [
      {
        mistake: 'Retrying every error, including 400 and 401.',
        fix: 'Retry only transient failures (408, 429, 5xx, timeouts).',
      },
      { mistake: 'Retrying immediately in a tight loop.', fix: 'Back off exponentially and honour Retry-After.' },
      { mistake: 'No limits on attempts or time.', fix: 'Cap attempts, time per attempt and total time.' },
      { mistake: 'Retrying calls with side effects.', fix: 'Only retry idempotent work, or use idempotency keys.' },
      { mistake: 'Retrying after the user cancelled.', fix: 'Treat cancellation as final; never retry it.' },
    ],
    challenge: {
      prompt:
        'Add "full jitter" (a random wait between 0 and the computed delay) and explain why many clients retrying at once need it. How would you keep tests deterministic?',
      successCriteria: ['Waits vary but never exceed the exponential delay', 'Tests inject a seeded random function'],
    },
    diagram: {
      kind: 'ascii',
      caption: 'Decision for each failed attempt',
      source:
        'attempt fails ─▶ cancelled? ─yes─▶ stop (cancelled)\n                     │no\n                     ▼\n             retryable? ─no─▶ stop (non-retryable)\n                     │yes\n             idempotent? ─no─▶ stop (not-idempotent)\n                     │yes\n        attempts < max? ─no─▶ stop (max-attempts)\n                     │yes\n   fits time budget? ─no─▶ stop (budget)\n                     │yes\n          wait max(base·2^(n-1), Retry-After) ─▶ next attempt',
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Which response should NOT be retried automatically?',
      choices: ['503 Service Unavailable', '429 Too Many Requests', '400 Bad Request', 'A timeout'],
      correctIndex: 2,
      explanation: 'A bad request fails the same way every time.',
    },
    {
      id: 'q2',
      prompt: 'Base delay 100 ms. How long is the wait before attempt 4?',
      choices: ['100 ms', '300 ms', '400 ms', '800 ms'],
      correctIndex: 2,
      explanation: 'Waits are 100, 200, 400 — the third wait precedes attempt 4.',
    },
    {
      id: 'q3',
      prompt: 'Why limit the total time budget as well as attempts?',
      choices: [
        'To save disk space',
        'Slow attempts can add up even with few retries',
        'Providers require it',
        'It disables backoff',
      ],
      correctIndex: 1,
      explanation: 'Timeouts and waits accumulate; a budget caps the user-visible latency.',
    },
    {
      id: 'q4',
      prompt: 'Why only retry idempotent calls?',
      choices: ['They are cheaper', 'Repeating them has no extra side effects', 'Mastra cannot retry others', 'They never fail'],
      correctIndex: 1,
      explanation: 'A retried non-idempotent call could, for example, send an email twice.',
    },
  ],
  sourceFiles: [
    { path: 'retry.ts', title: 'Retry policy', description: 'Classification, backoff, limits (app-level).' },
    { path: 'run.ts', title: 'Lab run', description: 'Fault injection and the attempt timeline.' },
  ],
  exercise: {
    instructions:
      'Wrap your agent.generate call in a retry helper: retry only 408/429/5xx and timeouts, exponential backoff from 250 ms, honour Retry-After, max 3 attempts and 10 s total. Then compare with Mastra\'s built-in options: `new Agent({ …, maxRetries: 2 })` and a model fallback array `model: [{ model: "openai/gpt-5-mini", maxRetries: 1 }, { model: "anthropic/claude-haiku-4-5" }]`.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'classified', label: 'Each failure was classified as retryable or non-retryable correctly' },
    { id: 'no-retry-non-retryable', label: 'Non-retryable errors were not retried' },
    { id: 'bounded', label: 'Attempts and time stayed within the limits' },
    { id: 'backoff', label: 'Waits doubled each time (or honoured Retry-After)' },
    { id: 'idempotency', label: 'Non-idempotent work was never retried' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'How providers fail', minutes: 1, talkingPoints: ['429, 5xx, timeouts vs 400/401'] },
      {
        title: 'Retry and backoff',
        minutes: 2,
        talkingPoints: ['Transient scenario walk-through', 'Exponential waits, Retry-After'],
      },
      { title: 'Limits', minutes: 1.5, talkingPoints: ['Max attempts', 'Per-attempt timeout', 'Total budget'] },
      { title: 'Idempotency', minutes: 1, talkingPoints: ['Side effects', 'Idempotency keys'] },
      { title: 'Mastra built-ins', minutes: 1, talkingPoints: ['Agent maxRetries', 'Model fallback arrays'] },
      { title: 'Wrap-up module 02', minutes: 0.5, talkingPoints: ['Next module: tools and function calling'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 45_000,
    maxTimeoutMs: 60_000,
    budget: { maxSteps: 6, maxRetries: 5 },
    costNotice:
      'Offline is free. Live mode makes one model call through the retry policy (more only if the provider actually fails).',
  },
  tags: ['reliability', 'retries', 'backoff'],
} satisfies LabDefinitionInput;
