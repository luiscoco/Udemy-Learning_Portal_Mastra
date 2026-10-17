import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab14Definition = {
  id: 'lab-14',
  number: 14,
  title: 'External API tool',
  moduleId: 'module-03',
  summary:
    'Wrap a real public API (Open-Meteo weather) in a tool with an allowlist, timeouts, rate limits, response validation and an offline mock.',
  concept:
    'Many useful tools call other services over HTTP, which brings new failure modes: slow responses, outages, rate limits and unexpected data. ' +
    'The tool runs on your server, never in the browser, so it can enforce rules the model cannot bypass. ' +
    'An allowlist of hosts, plus URLs built by your code rather than by the model, prevents the agent from being tricked into calling arbitrary addresses. ' +
    'Every request needs a timeout, and the response must be validated with a schema before anything is passed back to the model. ' +
    'Instead of throwing, a good tool returns a typed error such as TIMEOUT or RATE_LIMITED, so the model can explain the problem honestly instead of inventing an answer. ' +
    'A client-side rate limit protects both your budget and the third-party service. ' +
    'Offline, the same tool talks to a local mock with recorded data and injectable faults; with the Open-Meteo data source it calls the real free API, which sometimes really does answer "503 The service is overloaded".',
  objectives: [
    'Call an external HTTP API from a tool with a strict host allowlist',
    'Apply timeouts and a client-side rate limit',
    'Validate third-party responses and return typed errors instead of throwing',
    'Swap the transport for a deterministic local mock in tests',
  ],
  prerequisites: ['lab-13'],
  inputs: [
    {
      kind: 'json',
      name: 'cities',
      label: 'Cities (JSON array)',
      help: 'Any of: Madrid, Lisbon, London, Tokyo, New York.',
      maxBytes: 400,
      default: ['Madrid', 'Tokyo'],
      required: true,
    },
    {
      kind: 'select',
      name: 'dataSource',
      label: 'Data source',
      options: [
        { value: 'mock', label: 'Local mock (offline, deterministic)' },
        { value: 'open-meteo', label: 'Real Open-Meteo API (free, needs internet)' },
      ],
      default: 'mock',
      required: true,
    },
    {
      kind: 'select',
      name: 'mockFault',
      label: 'Mock fault injection',
      options: [
        { value: 'none', label: 'None' },
        { value: 'timeout', label: 'Hang until timeout' },
        { value: 'rate-limited', label: 'HTTP 429 with Retry-After' },
        { value: 'server-error', label: 'HTTP 503 overloaded' },
        { value: 'bad-json', label: 'Broken JSON body' },
      ],
      default: 'none',
      required: true,
    },
    {
      kind: 'number',
      name: 'timeoutMs',
      label: 'Request timeout (ms)',
      min: 200,
      max: 10000,
      step: 100,
      default: 3000,
      required: true,
    },
    {
      kind: 'number',
      name: 'maxRequestsPerMinute',
      label: 'Client rate limit (requests/minute)',
      min: 1,
      max: 20,
      default: 5,
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
  exampleInput: {
    cities: ['Madrid', 'Tokyo'],
    dataSource: 'mock',
    mockFault: 'none',
    timeoutMs: 3000,
    maxRequestsPerMinute: 5,
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'Two getWeather tool calls, two allowlisted GET requests to api.open-meteo.com (mocked), two typed results and an answer quoting them.',
    example: {
      dataSource: 'mock',
      answer: 'Madrid: 19.1°C, wind 13.2 km/h (Open-Meteo (local mock)). Tokyo: 17.9°C, wind 7.4 km/h (Open-Meteo (local mock)).',
      results: [
        { ok: true, city: 'Madrid', temperatureC: 19.1, windKmh: 13.2 },
        { ok: true, city: 'Tokyo', temperatureC: 17.9, windKmh: 7.4 },
      ],
    },
  },
  guide: {
    procedure: [
      'Read tool.ts and http.ts in the Source tab: find the allowlist, the timeout and the response schema.',
      'Run the example (mock) and read the GET log lines: host, status, duration.',
      'Set the fault to "Hang until timeout" with a 500 ms timeout: each city reports TIMEOUT after about half a second.',
      'Try "HTTP 429" and "HTTP 503": the run still succeeds and the answer explains the failure.',
      'Try "Broken JSON": the schema catches it as BAD_RESPONSE.',
      'Set the rate limit to 1 and ask for three cities: the second and third calls are refused locally.',
      'Switch the data source to the real Open-Meteo API (internet needed) and run.',
    ],
    prediction: 'With the rate limit set to 1 per minute and three cities, how many real HTTP requests are made?',
    hints: [
      { level: 1, text: 'The limiter is checked before each request.' },
      { level: 2, text: 'The first call takes the only slot; the next ones are refused without touching the network.' },
      { level: 3, text: 'One request; the other two cities get RATE_LIMITED with a retry-after, and the answer says so.' },
    ],
    commonMistakes: [
      {
        mistake: 'Letting the model pass a URL to the tool.',
        fix: 'Accept typed parameters (a city) and build the URL on the server from an allowlist.',
      },
      { mistake: 'No timeout on fetch.', fix: 'Use AbortSignal.timeout so a hanging API cannot hang your agent.' },
      {
        mistake: 'Passing raw third-party JSON to the model.',
        fix: 'Validate it with a schema and return only the fields you need.',
      },
      { mistake: 'Throwing on HTTP errors.', fix: 'Return typed errors so the model can explain instead of guessing.' },
      { mistake: 'Calling real APIs in unit tests.', fix: 'Inject a mock transport with recorded responses.' },
    ],
    challenge: {
      prompt:
        'Add a small cache (60 s) keyed by city so repeated questions do not hit the API. Where should the cache live, and how do you test it with the mock?',
      successCriteria: ['Second call for the same city makes no HTTP request', 'Cache entries expire'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Why does the tool take a city name instead of a URL?',
      choices: [
        'URLs are too long',
        'So the server builds allowlisted URLs and the model cannot redirect requests',
        'Open-Meteo requires it',
        'For caching',
      ],
      correctIndex: 1,
      explanation: 'Typed parameters plus a server-side allowlist prevent request forgery through the agent.',
    },
    {
      id: 'q2',
      prompt: 'The API returns HTTP 503. What should the tool return?',
      choices: [
        'Throw and crash the run',
        'A typed error the model can explain (retryable)',
        'Yesterday’s weather',
        'An empty object',
      ],
      correctIndex: 1,
      explanation: 'A typed, retryable error keeps the agent honest and the run stable.',
    },
    {
      id: 'q3',
      prompt: 'How do unit tests stay offline and deterministic?',
      choices: [
        'They skip the tool',
        'They inject a mock transport with recorded responses',
        'They call the API with a test key',
        'They mock the model only',
      ],
      correctIndex: 1,
      explanation: 'The HttpClient interface lets tests use a local mock with fixed data and faults.',
    },
  ],
  sourceFiles: [
    { path: 'tool.ts', title: 'Weather tool', description: 'Allowlist, rate limit, timeout, typed errors.' },
    { path: 'http.ts', title: 'Transport and schema', description: 'City table, URL builder, response schema, limiter.' },
    { path: 'mock.ts', title: 'Local mock', description: 'Recorded data and fault injection.' },
  ],
  exercise: {
    instructions:
      'In your project, write a tool for a public API of your choice: typed parameters, an allowlist, AbortSignal.timeout, a Zod response schema, typed error results, and an injectable fetch for tests. Test the 429 and timeout paths with a mock.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'allowlisted', label: 'Every request went to an allowlisted host' },
    { id: 'typed-results', label: 'Every tool result (success or failure) matches the result schema' },
    { id: 'failures-handled', label: 'Failures became typed errors and the answer explains them' },
    { id: 'timeout-enforced', label: 'Slow requests were cut off at the timeout' },
    { id: 'mock-offline', label: 'Mock data source made no network calls' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Tools that call the internet', minutes: 1, talkingPoints: ['New failure modes', 'Server-side only'] },
      { title: 'Allowlist and URL building', minutes: 1, talkingPoints: ['City enum', 'No model-supplied URLs'] },
      { title: 'Timeouts and validation', minutes: 1.5, talkingPoints: ['AbortSignal.timeout', 'Zod response schema'] },
      { title: 'Faults', minutes: 2, talkingPoints: ['Timeout, 429, 503, bad JSON', 'Typed errors in the answer'] },
      { title: 'Rate limit and mock vs real', minutes: 1.5, talkingPoints: ['Limiter = 1', 'Switch to real Open-Meteo'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 3, maxToolCalls: 5 },
    costNotice:
      'Offline with the mock is free. The Open-Meteo API is free (no key). Live mode adds two model calls with your provider key.',
  },
  tags: ['tools', 'http', 'resilience'],
} satisfies LabDefinitionInput;
