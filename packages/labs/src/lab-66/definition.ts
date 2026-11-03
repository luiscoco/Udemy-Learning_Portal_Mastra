import type { LabDefinitionInput } from '@mlp/contracts';

export const lab66Definition = {
  id: 'lab-66',
  number: 66,
  title: 'React client integration',
  moduleId: 'module-14',
  summary:
    'Consume agent runs from the browser through a typed client SDK: contract-validated responses, typed errors, a resumable event stream, and no model keys anywhere near the browser.',
  concept:
    'A React app should never call a model provider directly: the key would ship to every visitor, and nothing would stop someone from using it. ' +
    'Instead the browser talks to your own API, and a typed client SDK is the only way the UI does so. ' +
    'This platform’s SDK, @mlp/client, has a method for every API route, and the API contract test fails when a route has no method. ' +
    'Every response is parsed with the same Zod contract the server uses, so a response that drifted from the contract becomes a CONTRACT error instead of a half-broken screen. ' +
    'Errors arrive as typed values with a code, details and a request id, so the UI can explain them, and a network failure is distinct from a server refusal. ' +
    'Run events stream over Server-Sent Events; when the connection drops, the SDK reconnects with Last-Event-ID and the server replays only what was missed, so no token is lost or shown twice. ' +
    'The SDK takes no credentials at all: the session cookie identifies the learner, and a per-run token authorizes cancel and approvals. ' +
    'In this lab the SDK drives a disposable local API built from the platform’s real run engine, so you can drop the stream, inject drift and cancel safely.',
  objectives: [
    'Call agent runs only through a typed client, never a provider SDK, in the browser',
    'Validate every response against the shared contract and surface drift as an error',
    'Resume an event stream with Last-Event-ID without losing or repeating events',
    'Keep credentials out of the client: session cookie and per-run token only',
  ],
  prerequisites: ['lab-65'],
  inputs: [
    {
      kind: 'text',
      name: 'message',
      label: 'Message for Dummy Lab 00',
      minLength: 1,
      maxLength: 200,
      default: 'Hello from the typed client',
      required: true,
    },
    { kind: 'number', name: 'delayMs', label: 'Run duration (ms)', min: 0, max: 1_000, step: 50, default: 600, required: true },
    {
      kind: 'number',
      name: 'dropAfterEvents',
      label: 'Drop the event stream after N events (0 = never)',
      min: 0,
      max: 6,
      step: 1,
      default: 3,
      required: true,
    },
    {
      kind: 'select',
      name: 'drift',
      label: 'Contract drift',
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'snapshot', label: 'Run snapshot without status' },
        { value: 'event', label: 'An event of an unknown type' },
      ],
    },
    {
      kind: 'number',
      name: 'cancelAfterMs',
      label: 'Cancel the run after (ms, 0 = never)',
      min: 0,
      max: 2_000,
      step: 50,
      default: 0,
      required: true,
    },
  ],
  exampleInput: { message: 'Hello from the typed client', delayMs: 600, dropAfterEvents: 3, drift: 'none', cancelAfterMs: 0 },
  expectedOutput: {
    description:
      'Every SDK call is typed. The stream drops after 3 events and resumes with Last-Event-ID; sequence numbers stay contiguous. The two deliberate mistakes come back as VALIDATION_FAILED and NOT_FOUND. No request carries credentials.',
    example: {
      drift: 'none',
      rendered: { status: 'succeeded', text: 'Echo: Hello from the typed client' },
      credentialScan: { credentialHeaders: [], secretLikeValues: 0, keyOptionRefused: true },
      resources: { closed: true, openSockets: 0 },
    },
  },
  guide: {
    procedure: [
      'Read client.ts in Source: find the schema each method validates with and the only header it ever adds (x-run-token).',
      'Run the example. In calls[], every entry is ok or a typed error; in events[], seq runs 0, 1, 2… with one reconnect.',
      'Open requests[]: the resumed stream request carries lastEventId; no request has credential headers.',
      'Set Contract drift to “Run snapshot without status” and rerun: runs.get fails with CONTRACT instead of returning data.',
      'Set it to “An event of an unknown type”: the stream stops with CONTRACT at the first bad event.',
      'Set Cancel after to 200 ms: the run ends cancelled through runs.cancel with the run token.',
      'Compare apps/web/src/api/runs.ts: the platform’s own UI uses exactly this SDK.',
    ],
    prediction: 'If the SDK reconnected without Last-Event-ID, what would the learner see in the Live output after a drop?',
    hints: [
      { level: 1, text: 'The browser should only know about your API, never about the model provider.' },
      { level: 2, text: 'Validate what arrives with the same schema the server used to produce it; remember the last event id.' },
      {
        level: 3,
        text: 'request() parses every body with its contract schema and throws CONTRACT on mismatch; events() sends Last-Event-ID and skips seq values it already delivered.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Putting a provider key in a VITE_ variable “just for the demo”.',
        fix: 'Everything in the bundle is public. Call your API; keep keys on the server.',
      },
      {
        mistake: 'Trusting response shapes with a TypeScript cast.',
        fix: 'Casts check nothing at runtime; parse with the contract schema.',
      },
      { mistake: 'Reconnecting a stream from the beginning.', fix: 'Send Last-Event-ID and drop events you already delivered.' },
      { mistake: 'Showing raw error text from the server.', fix: 'Map typed error codes to messages the learner can act on.' },
    ],
    challenge: {
      prompt:
        'Add a React hook useRunEvents(runId) on top of the SDK with useSyncExternalStore, and a component test that a dropped stream does not duplicate tokens on screen.',
      successCriteria: [
        'The hook unsubscribes on unmount',
        'Tokens appear once each after a reconnect',
        'A CONTRACT error shows an explanation, not a crash',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Where should a model provider API key live in a React + API app?',
      choices: ['In a VITE_ variable', 'In localStorage', 'Only on the server', 'In the SDK options'],
      correctIndex: 2,
      explanation: 'Anything the browser receives is public; the SDK even refuses credential options.',
    },
    {
      id: 'q2',
      prompt: 'What does the SDK do when a response does not match its contract?',
      choices: ['Returns it anyway', 'Throws a CONTRACT error', 'Retries forever', 'Fills in defaults silently'],
      correctIndex: 1,
      explanation: 'Drift is a bug to surface, not data to render.',
    },
    {
      id: 'q3',
      prompt: 'Why does the SDK send Last-Event-ID when it reconnects?',
      choices: [
        'To authenticate',
        'So the server replays only the events after it, and nothing is lost or repeated',
        'To pick a faster server',
        'It is required by HTTP',
      ],
      correctIndex: 1,
      explanation: 'SSE resume replays from the last delivered id; the SDK also skips any duplicate seq.',
    },
    {
      id: 'q4',
      prompt: 'What makes sure a new API route gets a typed client method?',
      choices: ['Code review only', 'The API contract test comparing routes with CLIENT_ROUTES', 'TypeScript', 'The browser'],
      correctIndex: 1,
      explanation: 'The test fails when the registered routes and the SDK’s route list differ.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Driving runs through the SDK', description: 'Typed calls, stream resume, drift and cancel.' },
    { path: 'server.ts', title: 'Disposable loopback API', description: 'Real LabRunner, SSE with Last-Event-ID, request scan.' },
  ],
  exercise: {
    instructions: 'Explain what each SDK safeguard prevents, then implement the challenge in a local component test.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'responses-validated', label: 'Every SDK call returned contract-valid data or a typed error' },
    { id: 'stream-resumed', label: 'A dropped stream resumed with Last-Event-ID, without missing or repeating events' },
    { id: 'drift-rejected', label: 'A response that drifted from the contract became a CONTRACT error, never data' },
    { id: 'errors-typed', label: 'Bad requests came back as typed errors with codes and details' },
    { id: 'no-browser-credentials', label: 'No request carried credentials, and the SDK refused an apiKey option' },
    { id: 'cancel-honoured', label: 'Cancel with the run token ended the run as cancelled' },
    { id: 'resources-released', label: 'The loopback API closed with no open sockets' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Keys stay on the server', minutes: 1, talkingPoints: ['What a bundle exposes', 'Cookie and run token'] },
      { title: 'One typed client', minutes: 1, talkingPoints: ['A method per route', 'Contract test coverage'] },
      { title: 'Validate, then render', minutes: 1, talkingPoints: ['Zod contracts on both sides', 'CONTRACT errors'] },
      { title: 'Streams that survive drops', minutes: 2, talkingPoints: ['SSE ids', 'Last-Event-ID resume', 'No duplicates'] },
      { title: 'Errors the UI can explain', minutes: 1, talkingPoints: ['Codes, details, request ids'] },
    ],
  },
  execution: {
    modes: ['offline'],
    defaultTimeoutMs: 20_000,
    maxTimeoutMs: 60_000,
    budget: {},
    costNotice: 'Free: a disposable local API and Dummy Lab 00. No model or provider key is used.',
  },
  tags: ['client-sdk', 'react', 'sse', 'contracts', 'security'],
} satisfies LabDefinitionInput;
