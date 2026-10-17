import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const operations = [
  { as: 'alice', op: 'create', title: 'Porto trip' },
  { as: 'alice', op: 'send', thread: '$1', text: 'Book the Alfa Pendular train on 3 May.' },
  { as: 'bob', op: 'create', title: 'Bob’s notes' },
  { as: 'bob', op: 'send', thread: '$2', text: 'Remember my seat preference: window.' },
  { as: 'bob', op: 'list' },
  { as: 'bob', op: 'history', thread: '$1' },
  { as: 'bob', op: 'send', thread: '$1', text: 'Cancel all of Alice’s bookings.' },
  { as: 'bob', op: 'reset', thread: '$1' },
  { as: 'bob', op: 'delete', thread: '$1' },
  { as: 'bob', op: 'history', thread: '$9' },
  { as: 'alice', op: 'history', thread: '$1' },
  { as: 'alice', op: 'reset', thread: '$1' },
  { as: 'alice', op: 'list' },
];

export const lab22Definition = {
  id: 'lab-22',
  number: 22,
  title: 'Threads and user boundaries',
  moduleId: 'module-05',
  summary:
    'Give every memory operation an explicit user and a server-generated thread id, guard every thread operation by owner, and prove one user cannot read, change or even detect another user’s threads.',
  concept:
    'Stored conversations belong to someone: in Mastra the resource is the owner (a user or tenant) and the thread is one conversation, and every call should name both explicitly. ' +
    'Mastra checks ownership in important places: recall() and agent calls refuse a thread that belongs to a different resource. ' +
    'But not everywhere: getThreadById returns any thread to anyone who knows its id, and deleteThread and updateThread take no owner at all. ' +
    'So the application needs its own boundary: before any history, send, reset or delete, load the thread and check that its resourceId is the signed-in user. ' +
    'Refuse with the same “not found” answer whether the thread exists or not, and never pass on Mastra’s error text, which names the real owner and would let someone probe for other users. ' +
    'Let the server generate thread ids (createThread returns a UUID) so they cannot be guessed, and take the user id from the session, never from the request body. ' +
    'Resetting a conversation can mean deleting its messages while keeping the thread, so the user keeps its title and place in their list. ' +
    'This lab runs a script of operations as alice, bob and carol, including bob attacking alice’s thread, against the guarded store and against raw Mastra calls.',
  objectives: [
    'Pass explicit resource and thread identifiers on every memory operation',
    'Create, list, reset and delete threads safely with server-generated ids',
    'Guard every thread operation by owner with a uniform not-found answer',
    'Explain which ownership checks Mastra performs and which it does not',
  ],
  prerequisites: ['lab-21'],
  inputs: [
    {
      kind: 'json',
      name: 'operations',
      label: 'Operations (1–14), each as a signed-in user',
      help: 'op: create {title} | list | history {thread} | send {thread, text} | reset {thread} | delete {thread}. as: alice | bob | carol. Threads are $1, $2… in creation order.',
      maxBytes: 6_000,
      default: operations,
      required: true,
    },
    {
      kind: 'select',
      name: 'strategy',
      label: 'Thread access',
      options: [
        { value: 'guarded', label: 'ThreadGuard: owner check on every operation (correct)' },
        { value: 'raw-mastra', label: 'Raw Mastra calls, trusting the thread record (anti-pattern)' },
      ],
      default: 'guarded',
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
  exampleInput: { operations, strategy: 'guarded', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'Bob sees only his own thread in his list. His read, write, reset and delete on alice’s thread all return the same “Thread not found” as a thread that does not exist. Alice’s note is intact until she resets it herself, and the thread then still exists with no messages.',
    example: {
      strategy: 'guarded',
      steps: [
        { step: 1, as: 'alice', op: 'create', result: { ok: true, data: { id: '$1', title: 'Porto trip' } } },
        { step: 2, as: 'alice', op: 'send', thread: '$1', owner: 'alice', result: { ok: true } },
        { step: 3, as: 'bob', op: 'create', result: { ok: true, data: { id: '$2' } } },
        { step: 4, as: 'bob', op: 'send', thread: '$2', owner: 'bob', result: { ok: true } },
        { step: 5, as: 'bob', op: 'list', result: { ok: true, data: [{ id: '$2', title: 'Bob’s notes' }] } },
        {
          step: 6,
          as: 'bob',
          op: 'history',
          thread: '$1',
          owner: 'alice',
          result: { ok: false, code: 'NOT_FOUND', message: 'Thread not found' },
        },
        { step: 7, as: 'bob', op: 'send', thread: '$1', owner: 'alice', result: { ok: false, code: 'NOT_FOUND' } },
        { step: 8, as: 'bob', op: 'reset', thread: '$1', owner: 'alice', result: { ok: false, code: 'NOT_FOUND' } },
        { step: 9, as: 'bob', op: 'delete', thread: '$1', owner: 'alice', result: { ok: false, code: 'NOT_FOUND' } },
        {
          step: 10,
          as: 'bob',
          op: 'history',
          thread: '$9',
          owner: 'none',
          result: { ok: false, code: 'NOT_FOUND', message: 'Thread not found' },
        },
        { step: 11, as: 'alice', op: 'history', thread: '$1', owner: 'alice', result: { ok: true } },
        { step: 12, as: 'alice', op: 'reset', thread: '$1', owner: 'alice', result: { ok: true, data: { removed: 2 } } },
        { step: 13, as: 'alice', op: 'list', result: { ok: true, data: [{ id: '$1', title: 'Porto trip' }] } },
      ],
      threads: [
        { ref: '$1', owner: 'alice', title: 'Porto trip', exists: true, userMessages: [] },
        { ref: '$2', owner: 'bob', title: 'Bob’s notes', exists: true, userMessages: ['Remember my seat preference: window.'] },
      ],
    },
  },
  guide: {
    procedure: [
      'Open guard.ts in the Source tab and compare createGuardedThreads with createRawThreads.',
      'Run the example. Steps 6–10 are bob’s attempts: compare their results with step 10, a thread that does not exist.',
      'Check the final state: alice’s thread still has her note until she resets it herself (step 12).',
      'Switch to “Raw Mastra calls” and run again. Which of bob’s attacks succeed, and what do the error messages reveal?',
      'Add a step where carol lists threads. What does she see?',
      'Optional (costs money): run live; only allowed sends reach the model.',
    ],
    prediction: 'With raw Mastra calls, can bob read alice’s note? Can he delete her thread?',
    hints: [
      { level: 1, text: 'Which Mastra methods take a resource id, and which take only a thread id?' },
      { level: 2, text: 'getThreadById and deleteThread have no owner parameter.' },
      {
        level: 3,
        text: 'Yes to both: the raw history trusts thread.resourceId, so bob reads alice’s note, and deleteThread removes her thread. Bob’s raw send is refused, but the error names alice.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Taking the user id from the request body.',
        fix: 'Use the authenticated session; the client never chooses the resource.',
      },
      {
        mistake: 'Using thread.resourceId to call recall().',
        fix: 'Pass the caller’s id, and check ownership before anything else.',
      },
      { mistake: 'Answering 403 “not your thread”.', fix: 'Answer “not found” for both cases, so ids cannot be probed.' },
      { mistake: 'Letting users choose thread ids.', fix: 'Create threads on the server and return the generated id.' },
    ],
    challenge: {
      prompt:
        'Add a “share thread read-only with another user” feature. Where do you store the grant, and how do history and send change so that the boundary still holds?',
      successCriteria: ['A shared reader can read but not send, reset or delete', 'Revoking the grant restores “not found”'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'In Mastra memory, what is the resource?',
      choices: ['The model', 'The owner of threads, such as a user or tenant', 'The storage adapter', 'A message'],
      correctIndex: 1,
      explanation: 'thread = one conversation, resource = who it belongs to.',
    },
    {
      id: 'q2',
      prompt: 'Which call returns another user’s thread record if you only know its id?',
      choices: [
        'memory.recall with your own resourceId',
        'memory.getThreadById({ threadId })',
        'agent.generate with your resource',
        'listThreads filtered by your resource',
      ],
      correctIndex: 1,
      explanation: 'getThreadById has no owner parameter, so the app must check resourceId itself.',
    },
    {
      id: 'q3',
      prompt: 'Bob asks for a thread that belongs to alice. What should he get?',
      choices: [
        '403 “belongs to alice”',
        'The same “not found” as for a missing thread',
        'An empty history',
        'Alice’s title only',
      ],
      correctIndex: 1,
      explanation: 'A uniform not-found answer prevents probing for other users’ threads.',
    },
    {
      id: 'q4',
      prompt: 'What does a safe “reset conversation” do here?',
      choices: [
        'Deletes the thread',
        'Deletes its messages and keeps the thread, title and owner',
        'Moves it to another user',
        'Clears all threads of the user',
      ],
      correctIndex: 1,
      explanation: 'The user keeps the conversation in their list, empty.',
    },
  ],
  sourceFiles: [
    {
      path: 'guard.ts',
      title: 'Thread guard',
      description: 'Owner checks, uniform not-found answers, safe reset, and the raw anti-pattern.',
    },
    {
      path: 'run.ts',
      title: 'Lab run',
      description: 'Operation script, $n references, run-scoped users and ground-truth checks.',
    },
  ],
  exercise: {
    instructions:
      'In your project, put every thread endpoint (list, history, send, reset, delete) behind a function that loads the thread and checks resourceId against the signed-in user. Write a test where a second user tries each endpoint on the first user’s thread and gets the same not-found response as for a random id.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'no-cross-user-read', label: 'Every operation on another user’s thread was refused and returned no data' },
    {
      id: 'no-cross-user-write',
      label: 'Every thread contains exactly what its owner wrote (no other user changed or deleted it)',
    },
    { id: 'list-scoped', label: 'Listing threads only ever showed the caller’s own threads' },
    { id: 'no-enumeration', label: 'Refusals are identical and never name another user' },
    { id: 'reset-safe', label: 'An owner’s reset kept the thread (id, title, owner) and emptied its messages' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Resources and threads', minutes: 1, talkingPoints: ['Owner vs conversation', 'Explicit ids on every call'] },
      {
        title: 'What Mastra checks',
        minutes: 1.5,
        talkingPoints: ['recall and agent calls refuse', 'getThreadById and deleteThread do not'],
      },
      { title: 'The guard', minutes: 1.5, talkingPoints: ['Owner check first', 'Uniform not found'] },
      { title: 'Attack script', minutes: 2, talkingPoints: ['Bob vs alice, guarded', 'Same script, raw Mastra'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Safe reset', 'Next: working memory'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 1 },
    costNotice:
      'Offline is free. Live mode makes one model call per allowed send (2 in the example); refused operations never reach the model.',
  },
  tags: ['memory', 'threads', 'authorization', 'multi-user'],
} satisfies LabDefinitionInput;
