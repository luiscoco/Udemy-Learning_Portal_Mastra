import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const questions = [
  'Where is my order ORD-5001?',
  'Can you suggest something to go with ORD-5001?',
  'When will ORD-5002 arrive?',
  'Any recommendations for ORD-5002?',
].join('\n');

const models = DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id }));

export const lab65Definition = {
  id: 'lab-65',
  number: 65,
  title: 'Timeouts and failure testing',
  moduleId: 'module-13',
  summary:
    'Inject slow models, flaky tools, provider outages and cancellation into a support desk, and keep it answering with timeouts, bounded retries, circuit breakers and a model fallback.',
  concept:
    'An agent run touches several dependencies: one or more models and the services behind its tools, and each of them can be slow, flaky or down. ' +
    'Without boundaries a single hanging call freezes the run and the screen, and naive retries multiply the load on a service that is already failing. ' +
    'Every call here gets a per-attempt timeout that aborts the attempt through its AbortSignal, and only failures that may succeed a moment later (timeouts, 429, 5xx) are retried, a bounded number of times with exponential backoff; a 401 or 400 never is. ' +
    'A circuit breaker per dependency counts consecutive failures, opens to cut the dependency off so later calls fail fast, and lets a single probe through after a cool-down. ' +
    'Tools report a failure as a degraded result instead of throwing, so the agent answers what it can and says what is unavailable. ' +
    'For the model, Mastra’s native fallback array switches to a second model; this lab wraps each model so that its own code owns attempts and timeouts, because in Mastra 1.78 a retryable error is otherwise retried about three times inside every fallback attempt. ' +
    'Cancelling one question aborts only that question’s calls, and every attempt emits progress events, so the Run tab never looks frozen. ' +
    'All faults are injected before any provider is called, so you can test outages safely and, in live mode, cheaply.',
  objectives: [
    'Bound every model and tool call with a per-attempt timeout that aborts the work',
    'Retry only retryable failures, a bounded number of times, with backoff',
    'Isolate a failing dependency with a circuit breaker and degraded results',
    'Fall back to a second model with Mastra’s fallback array without hidden retries',
    'Propagate cancellation so no call outlives its question',
  ],
  prerequisites: ['lab-64'],
  inputs: [
    {
      kind: 'textarea',
      name: 'questions',
      label: 'Customer questions (one per line, up to 6)',
      minLength: 1,
      maxLength: 1_200,
      rows: 4,
      default: questions,
      required: true,
    },
    {
      kind: 'select',
      name: 'primaryFault',
      label: 'Primary model fault',
      default: 'outage',
      options: [
        { value: 'none', label: 'None' },
        { value: 'outage', label: 'Outage (HTTP 503)' },
        { value: 'rate-limit', label: 'Rate limit (HTTP 429)' },
        { value: 'slow', label: 'Slow (hangs)' },
        { value: 'bad-key', label: 'Rejected key (HTTP 401)' },
      ],
    },
    {
      kind: 'select',
      name: 'trackerFault',
      label: 'Shipment tracker fault',
      default: 'flaky',
      options: [
        { value: 'none', label: 'None' },
        { value: 'flaky', label: 'Flaky (first 2 calls fail)' },
        { value: 'slow', label: 'Slow (hangs)' },
      ],
    },
    {
      kind: 'select',
      name: 'recommendationsFault',
      label: 'Recommendations fault',
      default: 'down',
      options: [
        { value: 'none', label: 'None' },
        { value: 'down', label: 'Down (every call fails)' },
      ],
    },
    {
      kind: 'number',
      name: 'cancelQuestion',
      label: 'Customer closes the chat during question (0 = never)',
      min: 0,
      max: 6,
      step: 1,
      default: 0,
      required: true,
      help: 'That question is cancelled 150 ms after it starts. Combine with a slow tracker to cancel a call in flight.',
    },
    { kind: 'number', name: 'maxAttempts', label: 'Max attempts per call', min: 1, max: 4, step: 1, default: 3, required: true },
    {
      kind: 'number',
      name: 'modelTimeoutMs',
      label: 'Model attempt timeout (ms)',
      min: 200,
      max: 30_000,
      step: 100,
      default: 6_000,
      required: true,
      help: 'Time until the provider starts answering. Live models need a few seconds.',
    },
    {
      kind: 'number',
      name: 'toolTimeoutMs',
      label: 'Tool attempt timeout (ms)',
      min: 100,
      max: 10_000,
      step: 100,
      default: 500,
      required: true,
    },
    {
      kind: 'number',
      name: 'failureThreshold',
      label: 'Breaker opens after N consecutive failures',
      min: 1,
      max: 10,
      step: 1,
      default: 3,
      required: true,
    },
    {
      kind: 'number',
      name: 'coolDownMs',
      label: 'Breaker cool-down before a probe (ms)',
      min: 0,
      max: 300_000,
      step: 100,
      default: 30_000,
      required: true,
    },
    { kind: 'select', name: 'primaryModelId', label: 'Primary model', default: 'openai/gpt-5-mini', options: models },
    { kind: 'select', name: 'fallbackModelId', label: 'Fallback model', default: 'anthropic/claude-haiku-4-5', options: models },
  ],
  exampleInput: {
    questions,
    primaryFault: 'outage',
    trackerFault: 'flaky',
    recommendationsFault: 'down',
    cancelQuestion: 0,
    maxAttempts: 3,
    modelTimeoutMs: 6_000,
    toolTimeoutMs: 500,
    failureThreshold: 3,
    coolDownMs: 30_000,
    primaryModelId: 'openai/gpt-5-mini',
    fallbackModelId: 'anthropic/claude-haiku-4-5',
  },
  expectedOutput: {
    description:
      'The primary model fails three times, its breaker opens and every answer comes from the fallback model. The flaky tracker succeeds on its third attempt. The recommendations service fails three times, its breaker opens, the next recommendation call is short-circuited, and both recommendation answers say that part is unavailable. All four questions are answered.',
    example: {
      simulated: true,
      faults: { primary: 'outage', tracker: 'flaky', recommendations: 'down', cancelQuestion: 0 },
      breakers: { primary: { state: 'open' }, tracker: { state: 'closed' }, recommendations: { state: 'open' } },
    },
  },
  guide: {
    procedure: [
      'Read the faults in the inputs and predict: how many times will the primary model be called, and who answers?',
      'Run the example. In calls[], follow the primary model: 3 attempts, then short-circuits for every later call.',
      'Find the flaky tracker: two failures, then success on attempt 3, and the breaker stays closed.',
      'Find the recommendations breaker: open after 3 failures; the next question never calls the service.',
      'Set the tracker to Slow and cancel question 1. Watch the in-flight call end as cancelled while questions 2–4 continue.',
      'Set the primary fault to Rejected key: it is called once per model call, never retried.',
      'Start a run with a slow model and a long timeout, then press Stop in the Run tab: the run ends at once.',
    ],
    prediction:
      'If the breaker threshold were 10 instead of 3, what would happen to the total run time with the recommendations service down?',
    hints: [
      { level: 1, text: 'A timeout that does not cancel the work only hides the problem.' },
      { level: 2, text: 'Decide per failure whether retrying can help, and stop calling a dependency that keeps failing.' },
      {
        level: 3,
        text: 'resilientCall races each attempt against a timer that aborts the attempt’s signal, retries only isRetryable errors with backoff, and asks the breaker before every attempt; guardModel throws a non-retryable error so Mastra’s fallback entry (maxRetries: 0) moves on at once.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Retrying every error, including 401 and 400.',
        fix: 'Classify first; only transient failures are worth another attempt.',
      },
      {
        mistake: 'Stacking retry layers (framework, SDK and your own).',
        fix: 'Own retries in one place and turn the others off (here: maxRetries: 0 in the fallback array).',
      },
      {
        mistake: 'A timeout that leaves the slow call running.',
        fix: 'Abort the attempt through its AbortSignal when the timer fires.',
      },
      {
        mistake: 'Throwing from a tool when its service is down.',
        fix: 'Return a degraded result and let the agent answer the rest.',
      },
    ],
    challenge: {
      prompt:
        'Share the breakers across runs (per process) so a dependency that failed for one learner is short-circuited for the next, and add a test that a half-open probe closes the breaker again after the service recovers.',
      successCriteria: [
        'A second run does not call a dependency whose breaker is still open',
        'After the cool-down a single probe goes out; success closes the breaker',
        'Tenants never see each other’s data in breaker reports',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Which failure should not be retried?',
      choices: ['HTTP 503', 'HTTP 429', 'An attempt timeout', 'HTTP 401'],
      correctIndex: 3,
      explanation: 'A rejected key fails every time; retrying only costs time and money.',
    },
    {
      id: 'q2',
      prompt: 'What does an open circuit breaker do?',
      choices: [
        'Retries faster',
        'Refuses calls to the failing dependency so they fail fast, until a probe after the cool-down',
        'Switches off timeouts',
        'Restarts the server',
      ],
      correctIndex: 1,
      explanation: 'It protects both the failing service and your run from pointless waiting.',
    },
    {
      id: 'q3',
      prompt: 'Why do the model entries in the fallback array use maxRetries: 0?',
      choices: [
        'Mastra requires it',
        'The guard owns attempts; otherwise retries multiply (about 3 per attempt in Mastra 1.78)',
        'To save tokens on success',
        'Fallbacks only work with 0',
      ],
      correctIndex: 1,
      explanation: 'Retry layers multiply. Keep exactly one place that decides how often to try.',
    },
    {
      id: 'q4',
      prompt: 'What keeps the UI from looking frozen during a slow call?',
      choices: [
        'A spinner only',
        'Timeouts that abort, progress events per attempt, and a Stop that cancels the work',
        'Longer timeouts',
        'Caching the answer',
      ],
      correctIndex: 1,
      explanation: 'The UI reflects real progress, and nothing can wait forever.',
    },
  ],
  sourceFiles: [
    { path: 'resilience.ts', title: 'Timeouts, retries and circuit breaker', description: 'resilientCall and CircuitBreaker.' },
    {
      path: 'model-guard.ts',
      title: 'Guarded model for Mastra’s fallback array',
      description: 'Fault injection, attempts and timeouts.',
    },
    { path: 'tools.ts', title: 'Tools with degraded results', description: 'Isolation and per-question cancellation.' },
    { path: 'run.ts', title: 'Question queue and checks', description: 'Fallback array, cancellation, bounds.' },
  ],
  exercise: {
    instructions: 'Explain why retries must live in exactly one layer, then implement the challenge in a local test.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'retries-bounded', label: 'Retries stayed within the attempt limit, and a non-retryable failure was never retried' },
    { id: 'timeouts-enforced', label: 'No attempt ran longer than its timeout' },
    {
      id: 'failing-dependency-isolated',
      label: 'A dependency that kept failing was cut off by its breaker, and every question still got an answer',
    },
    { id: 'fallback-model-used', label: 'Answers came from the fallback model exactly when the primary was failing' },
    { id: 'cancellation-propagates', label: 'Cancelling a question stopped its calls without affecting the next questions' },
    { id: 'no-hang', label: 'Every question ended, and the run finished within its computed bound' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Everything fails', minutes: 1, talkingPoints: ['Slow, flaky, down', 'One hang freezes a run'] },
      { title: 'Timeouts that abort', minutes: 1, talkingPoints: ['Per-attempt AbortSignal', 'Time to first answer'] },
      {
        title: 'Retries done right',
        minutes: 2,
        talkingPoints: ['Retryable or not', 'Backoff', 'Retry amplification in fallback arrays'],
      },
      { title: 'Breakers and degraded results', minutes: 2, talkingPoints: ['Closed, open, half-open', 'Answer what you can'] },
      { title: 'Cancellation and the UI', minutes: 1, talkingPoints: ['Cancel one question', 'Stop the whole run'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 120_000,
    maxTimeoutMs: 240_000,
    budget: { maxSteps: 18, maxToolCalls: 18, maxRetries: 3 },
    costNotice:
      'Offline is free. In live mode faults are injected before the provider is called, so the failing primary costs nothing; the fallback model answers up to 6 short questions (two model calls each), usually a few cents or less.',
  },
  tags: ['reliability', 'timeouts', 'retries', 'circuit-breaker', 'fallback'],
} satisfies LabDefinitionInput;
