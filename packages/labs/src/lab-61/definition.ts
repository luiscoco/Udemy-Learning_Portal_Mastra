import { liveCheckpointDefinition } from '../shared/live-checkpoint-definition.js';
import type { LabDefinitionInput } from '@mlp/contracts';

export const lab61Definition = liveCheckpointDefinition({
  id: 'lab-61',
  number: 61,
  title: 'Authenticated API',
  moduleId: 'module-13',
  summary:
    'Protect lab execution with a development login, signed server-side sessions, owner checks and a boundary that refuses unsafe production configuration.',
  concept:
    'Authentication establishes who is making a request, while authorization decides which records that person may use. ' +
    'A run identifier alone is not authorization, because run events can contain private tool arguments and model output. ' +
    'The platform now requires a session to start a lab and binds every run to the authenticated learner; reads and event streams require that owner, and mutations also require the existing run token. ' +
    'The browser receives an opaque signed cookie, while the principal and expiration stay in a server-side store. ' +
    'HttpOnly limits script access to the cookie, SameSite=Strict and an origin check defend unsafe requests, and logout revokes the stored session. ' +
    'The development identity provider accepts only configured local users and refuses production or public-interface startup, so it cannot accidentally become a public login system. ' +
    'This lab exercises the same application-level auth primitives with real requests to a disposable loopback server and an injected clock, without calling a model. ' +
    'Production still needs a real identity provider, a shared session store, HTTPS and the remaining release gates; this is an application adapter rather than a native Mastra authentication API.',
  objectives: [
    'Distinguish authentication from run ownership authorization',
    'Verify cookie flags, signature checks, expiry and logout revocation',
    'Reject anonymous execution and another learner’s run reads',
    'Keep credentials out of responses and logs and refuse unsafe development configuration',
  ],
  prerequisites: ['lab-60'],
  inputs: [
    {
      kind: 'text',
      name: 'username',
      label: 'Demo learner',
      minLength: 1,
      maxLength: 64,
      default: 'alice',
      required: true,
      help: 'Lowercase letters, digits, dot, dash or underscore. This does not change your platform login.',
    },
    {
      kind: 'text',
      name: 'otherUser',
      label: 'Second demo learner',
      minLength: 1,
      maxLength: 64,
      default: 'bob',
      required: true,
      help: 'Choose a different name to test run ownership.',
    },
    {
      kind: 'text',
      name: 'passcode',
      label: 'Demo passcode (optional)',
      minLength: 8,
      maxLength: 120,
      required: false,
      help: 'Use an invented sample only, never a real password. Blank demonstrates local login without a passcode.',
    },
    {
      kind: 'number',
      name: 'ttlMs',
      label: 'Demo session lifetime (ms)',
      min: 1_000,
      max: 60_000,
      step: 1_000,
      default: 2_000,
      required: true,
      help: 'The demo advances its injected clock; it does not wait or alter your platform session.',
    },
  ],
  exampleInput: { username: 'alice', otherUser: 'bob', ttlMs: 2_000 },
  expectedOutput: {
    description:
      'Actual HTTP statuses for anonymous refusal, owner access, cookie tampering, expiry, cross-user denial, logout and foreign-origin refusal. Cookie flags and production refusal are checked without displaying credentials.',
    example: {
      statuses: {
        anonymous: 401,
        login: 200,
        ownerStart: 202,
        ownerRead: 200,
        tampered: 401,
        expired: 401,
        otherLearner: 404,
        logout: 200,
        afterLogout: 401,
        crossOrigin: 403,
      },
      cookie: { httpOnly: true, sameSiteStrict: true, apiPath: true },
      productionRefused: true,
      credentialsAbsent: true,
      resourcesReleased: true,
    },
  },
  guide: {
    procedure: [
      'Confirm Lab 60 is complete, sign in to the local platform, and open the Run tab.',
      'Predict the response to an anonymous run start, then run the example and inspect the event timeline.',
      'Compare ownerRead (200) with otherLearner (404): why should a run id not grant access?',
      'Find the cookie flags in the output. The cookie value is intentionally absent.',
      'Set a different session lifetime and rerun: expiry remains deterministic because the clock is advanced explicitly.',
      'Add an invented demo passcode and confirm the credentials check still passes. Never enter a real password in lab inputs.',
      'Read server.ts and run.ts in Source, then compare their boundary with docs/AUTH.md and the platform login.',
    ],
    prediction: 'Which checks would still fail if you only hid the Run button but left the API public?',
    hints: [
      { level: 1, text: 'A browser is only one possible HTTP client.' },
      {
        level: 2,
        text: 'Check identity at the server before starting a run, and check the stored owner before reading its events.',
      },
      {
        level: 3,
        text: 'Anonymous start must return 401; another authenticated learner gets 404 for a run they do not own. UI gating alone provides neither guarantee.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Treating an unguessable run id as permission.',
        fix: 'Store the authenticated principal as the run owner and enforce it on every read and mutation.',
      },
      {
        mistake: 'Saving session credentials in localStorage or returning them in JSON.',
        fix: 'Use an HttpOnly cookie and keep session records on the server.',
      },
      {
        mistake: 'Deleting only the browser cookie on logout.',
        fix: 'Revoke the server session so a copied old cookie stops working.',
      },
      {
        mistake: 'Enabling the development provider on a public host.',
        fix: 'Fail startup; implement and review a production identity adapter and shared store first.',
      },
    ],
    challenge: {
      prompt:
        'Add a negative test for each protected platform route using a second learner, including cancellation with the correct run token.',
      successCriteria: [
        'No second learner can read or mutate the run',
        'Unknown and foreign-owned runs return the same status',
        'The owner still streams events and can cancel with the run token',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What establishes who is making a request?',
      choices: ['Authentication', 'A run id', 'A UI button', 'A model prompt'],
      correctIndex: 0,
      explanation: 'The identity provider authenticates credentials and establishes a principal.',
    },
    {
      id: 'q2',
      prompt: 'What should another signed-in learner receive for your run?',
      choices: ['200', '404', 'The run token', 'A redirect to the provider'],
      correctIndex: 1,
      explanation: 'A foreign-owned run is treated like an unknown run to avoid revealing its existence.',
    },
    {
      id: 'q3',
      prompt: 'What makes a copied cookie stop working after logout?',
      choices: ['Hiding the output', 'Closing the login form', 'Server-side revocation', 'Clearing localStorage'],
      correctIndex: 2,
      explanation: 'The server removes the session record, so the old signed cookie no longer identifies a live session.',
    },
    {
      id: 'q4',
      prompt: 'Can this development login be enabled publicly in production?',
      choices: [
        'Yes, because it uses HMAC',
        'Yes, with a longer user name',
        'Yes, if the Run button is hidden',
        'No; startup is refused and a production adapter is required',
      ],
      correctIndex: 3,
      explanation: 'Signed cookies do not turn a local allowlist into real account authentication.',
    },
  ],
  sourceFiles: [
    {
      path: 'server.ts',
      title: 'Loopback authentication server',
      description: 'The shared auth primitives, owner checks, cookie handling and bounded request parsing.',
    },
    {
      path: 'run.ts',
      title: 'HTTP probes and objective checks',
      description: 'Real requests, an injected clock and safe status-only reporting.',
    },
  ],
  exercise: {
    instructions:
      'Explain the server-side check required for every protected route, then implement the challenge in a separate local test. Never weaken the platform boundary or paste production credentials into inputs.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'anonymous-refused', label: 'Anonymous execution is refused' },
    { id: 'owner-allowed', label: 'The signed-in owner can start and read a run' },
    { id: 'cookie-hardened', label: 'The session cookie is HttpOnly, SameSite=Strict and scoped to /api' },
    { id: 'tampering-refused', label: 'An altered cookie is refused' },
    { id: 'expiry-enforced', label: 'The server rejects an expired session' },
    { id: 'ownership-enforced', label: 'Another learner cannot read the run' },
    { id: 'logout-revokes', label: 'Logout revokes the stored session' },
    { id: 'origin-enforced', label: 'Foreign-origin mutations are refused' },
    { id: 'production-refused', label: 'The development provider is refused in production' },
    { id: 'credentials-absent', label: 'Responses and logs contain no session credentials or passcode' },
    { id: 'resources-released', label: 'The demo closes its server and connections' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      {
        title: 'Identity and ownership',
        minutes: 1,
        talkingPoints: ['Authentication versus authorization', 'Private SSE output'],
      },
      { title: 'Local sign-in', minutes: 1, talkingPoints: ['Allowlist and optional passcode', 'Server-only session records'] },
      {
        title: 'Probe the boundary',
        minutes: 2,
        talkingPoints: ['401, 200 and 404', 'Tampering and cross-origin requests', 'Injected expiry clock'],
      },
      {
        title: 'Revocation and secrets',
        minutes: 1,
        talkingPoints: ['Old cookie after logout', 'No credentials in results or logs'],
      },
      {
        title: 'Production and next lab',
        minutes: 1,
        talkingPoints: ['Fail closed', 'OIDC and persistent sessions remain open', 'Tenant isolation in Lab 62'],
      },
    ],
  },
  execution: {
    modes: ['offline'],
    defaultTimeoutMs: 15_000,
    maxTimeoutMs: 30_000,
    budget: {},
    costNotice:
      'Free: real HTTP requests to a disposable local server only. No model, provider key or external network service is used.',
  },
  tags: ['security', 'authentication', 'sessions', 'authorization'],
} satisfies LabDefinitionInput);
