import type { LabDefinitionInput } from '@mlp/contracts';

export const lab62Definition = {
  id: 'lab-62',
  number: 62,
  title: 'Tenant isolation',
  moduleId: 'module-13',
  summary:
    'Enforce ownership scopes across threads, documents, runs and storage records by partitioning every learner’s stores on the server.',
  concept:
    'Authentication tells the server who is calling, but data stays shared until every store is scoped to that caller. ' +
    'Inside one Mastra storage, resourceId and threadId are just values: two learners who both use the thread id "notes" for the resource "learner" read and write the same rows. ' +
    'Filtering by an id that the client supplies is not isolation, because the client can supply someone else’s id. ' +
    'The platform therefore isolates at the service layer: each run receives services built for its authenticated owner, and every memory store, document library and saved file resolves inside that owner’s partition. ' +
    'A partition id is a fixed-length hash of the owner id, so names never appear in paths and a value like "../../etc/passwd" cannot leave the tenants folder. ' +
    'Runs stay owner-bound from Lab 61: another learner gets 404 for every run route, and a route audit fails the build when a new route is not classified as public or tenant-scoped. ' +
    'Existing shared data is not migrated automatically; an explicit script copies it into one owner’s partition so it never becomes visible to everyone. ' +
    'This is an application-level design over Mastra’s storage adapters, not a native Mastra multi-tenancy API, and it covers the local single-process deployment.',
  objectives: [
    'Show why ids inside one shared store do not isolate learners',
    'Resolve the same store name to a different partition per authenticated owner',
    'Keep owner ids out of file paths by hashing them, including hostile ids',
    'Confirm that runs remain readable only by their owner',
  ],
  prerequisites: ['lab-61'],
  inputs: [
    {
      kind: 'text',
      name: 'learnerA',
      label: 'Demo learner A',
      minLength: 1,
      maxLength: 32,
      default: 'alice',
      required: true,
      help: 'Lowercase letters, digits, dot, dash or underscore. Demo learners live inside your own partition.',
    },
    {
      kind: 'text',
      name: 'learnerB',
      label: 'Demo learner B',
      minLength: 1,
      maxLength: 32,
      default: 'bob',
      required: true,
      help: 'Choose a different name from learner A.',
    },
    {
      kind: 'text',
      name: 'note',
      label: 'Learner A’s private note',
      minLength: 3,
      maxLength: 200,
      default: 'My exam retake is on Friday.',
      required: true,
      help: 'Stored as a thread title for learner A. Use invented text only.',
    },
    {
      kind: 'text',
      name: 'hostileOwner',
      label: 'Hostile owner id',
      minLength: 1,
      maxLength: 120,
      default: '../../etc/passwd',
      required: true,
      help: 'Any string: it is hashed, never used as a path.',
    },
  ],
  exampleInput: { learnerA: 'alice', learnerB: 'bob', note: 'My exam retake is on Friday.', hostileOwner: '../../etc/passwd' },
  expectedOutput: {
    description:
      'Learner B lists learner A’s thread in the shared store, but sees nothing in his own partition. Paths are shown relative to the tenants folder; partition ids are 24 hex characters, and the run belongs to learner A only.',
    example: {
      shared: { bSawThreads: [{ id: 'notes', title: 'alice: My exam retake is on Friday.' }] },
      partitioned: {
        store: 'lab-62-notes',
        bSawThreads: [],
      },
      hostile: { owner: '../../etc/passwd', parentFolder: 'tenants', underTenants: true },
      run: { readableByA: true, readableByB: false },
    },
  },
  guide: {
    procedure: [
      'Confirm Lab 61 is complete, sign in, and open the Run tab.',
      'Predict what learner B sees in the shared store when both learners use the thread id "notes", then run the example.',
      'Compare shared.bSawThreads with partitioned.bSawThreads. Which line of run.ts makes the difference?',
      'Compare fileA and fileB: the store name is the same, the partition folder is not.',
      'Change the hostile owner id to another traversal attempt and rerun; the partition stays a 24-character hash under tenants/.',
      'Read run.ts in Source, then services.ts’s forTenant and the route audit described in docs/AUTH.md.',
    ],
    prediction:
      'If the API filtered threads by a resourceId taken from the request body, could learner B read learner A’s thread?',
    hints: [
      { level: 1, text: 'An id stored inside a shared table is data, not a permission.' },
      { level: 2, text: 'Choose the store from the authenticated owner, before any lab code runs.' },
      {
        level: 3,
        text: 'The runner calls servicesFor(ownerId) for each run, and forTenant hashes the owner into tenants/<partition>/, so the same store name opens a different file per learner.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Using the learner name directly as a folder name.',
        fix: 'Hash the owner id into a fixed-length partition id so input can never shape the path.',
      },
      {
        mistake: 'Trusting a resourceId or ownerId sent by the client.',
        fix: 'Derive the owner from the verified session on the server and pass it to the runner.',
      },
      {
        mistake: 'Adding a route without an ownership decision.',
        fix: 'Classify every route as public or tenant-scoped; the route audit test fails on unclassified routes.',
      },
      {
        mistake: 'Silently assigning old shared data to whoever signs in first.',
        fix: 'Migrate legacy stores explicitly to one named owner with scripts/migrate-tenant-data.mjs.',
      },
    ],
    challenge: {
      prompt:
        'Add a new tenant-scoped route (for example, a list of the learner’s own runs) and extend the route audit and cross-tenant tests for it.',
      successCriteria: [
        'The route audit lists and classifies the new route',
        'Anonymous callers get 401 and another learner sees none of the owner’s runs',
        'The owner still sees their own runs',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Two learners use the same resourceId and threadId in one shared store. What happens?',
      choices: [
        'Mastra separates them automatically',
        'They read and write the same thread',
        'The second write fails',
        'Each gets a copy',
      ],
      correctIndex: 1,
      explanation: 'Ids inside one store are values; isolation must come from choosing the store per owner.',
    },
    {
      id: 'q2',
      prompt: 'Where does the platform get the owner used to pick a partition?',
      choices: ['The request body', 'A query parameter', 'The verified session', 'The thread title'],
      correctIndex: 2,
      explanation: 'The owner comes from the server-side session, so a client cannot choose another learner’s partition.',
    },
    {
      id: 'q3',
      prompt: 'Why hash the owner id into the partition id?',
      choices: [
        'To keep names and traversal sequences out of file paths',
        'To make storage faster',
        'Because Mastra requires it',
        'To encrypt the data',
      ],
      correctIndex: 0,
      explanation: 'A fixed-length hex hash cannot contain path separators or reveal the learner name. It is not encryption.',
    },
    {
      id: 'q4',
      prompt: 'What does the route audit test guarantee?',
      choices: [
        'Routes are fast',
        'Every registered API route is classified as public or tenant-scoped, and tenant routes refuse other learners',
        'Routes are documented in the README',
        'The API uses HTTPS',
      ],
      correctIndex: 1,
      explanation: 'A new route without a classification, or a tenant route that serves another learner, fails the test.',
    },
  ],
  sourceFiles: [
    {
      path: 'run.ts',
      title: 'Shared versus partitioned stores',
      description: 'The leak in one shared store, per-owner partitions, hostile ids and run ownership.',
    },
  ],
  exercise: {
    instructions:
      'Explain why partitioning by the authenticated owner isolates learners when filtering by a client id does not, then implement the challenge in a local test.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'shared-store-leaks', label: 'Anti-pattern shown: one shared store leaks learner A’s thread to learner B' },
    { id: 'partitions-isolate', label: 'With partitioned stores, learner B sees none of learner A’s threads' },
    { id: 'same-name-different-files', label: 'The same store name resolves to a different file per learner' },
    { id: 'partition-ids-hashed', label: 'Partition ids are fixed-length hashes; no learner name appears in a path' },
    { id: 'hostile-id-contained', label: 'A traversal-looking owner id stays inside the tenants folder' },
    { id: 'run-owner-enforced', label: 'A run belongs to its owner: A may read it, B may not' },
    { id: 'demo-namespaced', label: 'Demo learners live under the running learner’s partition' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Authenticated is not isolated', minutes: 1, talkingPoints: ['Ids are data', 'Client-supplied ids'] },
      { title: 'The shared-store leak', minutes: 1, talkingPoints: ['Same resourceId and threadId', 'B lists A’s note'] },
      {
        title: 'Partition by owner',
        minutes: 2,
        talkingPoints: ['servicesFor(ownerId)', 'tenants/<hash>/ for memory, library and files', 'Hostile ids'],
      },
      { title: 'Routes and runs', minutes: 1, talkingPoints: ['Route audit', '401 anonymous, 404 other learner'] },
      {
        title: 'Migration and limits',
        minutes: 1,
        talkingPoints: ['Explicit legacy migration', 'Single-process scope; Lab 63 next'],
      },
    ],
  },
  execution: {
    modes: ['offline'],
    defaultTimeoutMs: 20_000,
    maxTimeoutMs: 60_000,
    budget: {},
    costNotice: 'Free: local LibSQL files and an in-process runner only. No model or provider key is used.',
  },
  tags: ['security', 'multi-tenancy', 'authorization', 'storage'],
} satisfies LabDefinitionInput;
