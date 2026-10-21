import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const messages = ["Hi, I'm Ana and I'm planning a trip to Porto.", 'I prefer trains to planes.'];
const followUp = "Remind me: what's my name and how do I like to travel?";

export const lab21Definition = {
  id: 'lab-21',
  number: 21,
  title: 'Persistent message history',
  moduleId: 'module-05',
  summary:
    'Give an agent durable memory with Mastra Memory on a LibSQL database, restart everything, and prove the conversation is still there in chronological order.',
  concept:
    'A chat assistant must remember the conversation, and that memory has to outlive the process: servers restart, deploy and scale. ' +
    'In Mastra, memory is a Memory instance backed by a storage adapter; here it is LibSQLStore writing to a local SQLite file, created with new LibSQLStore({ id, url: "file:…" }). ' +
    'You give the memory to the agent and name the conversation on every call with memory: { thread, resource }, where the thread is one conversation and the resource is who owns it. ' +
    'Mastra then saves each user and assistant message to the thread and, on the next call, loads recent messages back into the model’s context. ' +
    'lastMessages controls how many earlier messages are loaded: too few and the agent forgets early details, too many and every call gets longer and more expensive. ' +
    'memory.recall() returns the stored messages in chronological order with timestamps, which is how you inspect, debug and export a conversation. ' +
    'Without a storage adapter, Mastra keeps memory in the process and warns that it is lost on restart; with LibSQL the history survives, which this lab proves by closing the database and rebuilding every object. ' +
    'Storage is server-side state: keep it out of the browser, and treat thread ids as identifiers, not secrets.',
  objectives: [
    'Configure Mastra Memory with a durable LibSQL store',
    'Store a conversation with memory: { thread, resource }',
    'Inspect chronological history with memory.recall()',
    'Show that history survives a restart and tune lastMessages',
  ],
  prerequisites: ['lab-20'],
  inputs: [
    {
      kind: 'text',
      name: 'threadId',
      label: 'Thread id',
      help: 'Lowercase letters, digits and dashes. One thread is one conversation.',
      minLength: 3,
      maxLength: 41,
      default: 'trip-planning',
      required: true,
    },
    {
      kind: 'json',
      name: 'messages',
      label: 'Session 1 messages (before the restart, 1–4)',
      maxBytes: 2_000,
      default: messages,
      required: true,
    },
    {
      kind: 'text',
      name: 'followUp',
      label: 'Follow-up after the restart',
      minLength: 1,
      maxLength: 500,
      default: followUp,
      required: true,
    },
    {
      kind: 'number',
      name: 'lastMessages',
      label: 'lastMessages (earlier messages loaded into context)',
      min: 1,
      max: 40,
      step: 1,
      default: 20,
      required: true,
    },
    {
      kind: 'boolean',
      name: 'resetThread',
      label: 'Start the thread fresh (delete earlier history first)',
      help: 'Turn off and run twice: the history keeps growing across runs.',
      default: true,
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
    threadId: 'trip-planning',
    messages,
    followUp,
    lastMessages: 20,
    resetThread: true,
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'Two messages are stored and the store is closed. New instances find both messages, and the follow-up is answered from them (Ana, trains). The history alternates user and assistant in time order.',
    example: {
      threadId: 'trip-planning',
      dbFile: '.data/memory/tenants/local/lab-21.db',
      reset: true,
      restart: { closedFirstStore: true, reopened: true },
      followUp: {
        question: followUp,
        answer: 'Your name is Ana, and you prefer trains. (I can see 2 earlier message(s) from you.)',
      },
      modelSawOnFollowUp: { priorMessages: 4, userMessages: messages },
      remembered: { name: 'Ana', preference: 'trains' },
    },
  },
  guide: {
    procedure: [
      'Open run.ts in the Source tab and find the restart: first.close(), then a second ctx.services.memory.open().',
      'Run the example. In the timeline, the restart step reports how many messages the new instances found.',
      'Read the history in the result: roles, order and timestamps.',
      'Set lastMessages to 2 and run: which fact does the agent forget, and why?',
      'Turn off “Start the thread fresh” and run twice: the history grows across runs.',
      'Read restart-worker.ts: the automated test runs it as two separate processes to prove a real restart.',
    ],
    prediction: 'With lastMessages = 2, which earlier messages does the follow-up still see?',
    hints: [
      { level: 1, text: 'lastMessages counts user and assistant messages.' },
      { level: 2, text: 'Session 1 produced four messages: user, assistant, user, assistant.' },
      {
        level: 3,
        text: 'Only the last two: “I prefer trains…” and its reply. The name (Ana) is outside the window, so the answer cannot include it.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'No storage adapter, relying on the in-memory default.',
        fix: 'Configure LibSQLStore (or another adapter); in-memory history is lost on restart.',
      },
      {
        mistake: 'A new thread id on every request.',
        fix: 'Reuse the conversation’s thread id, or the agent starts from scratch each time.',
      },
      { mistake: 'A huge lastMessages “to be safe”.', fix: 'Every call pays for the loaded history; pick a window and test it.' },
      {
        mistake: 'Assuming the model stores memory.',
        fix: 'Mastra stores and loads messages; the model only sees what is loaded.',
      },
    ],
    challenge: {
      prompt:
        'Add an “export conversation” step that writes memory.recall() to a JSON file and a test that restores it into a new thread. What must you keep, and what can you drop?',
      successCriteria: ['The restored thread has the same messages in the same order', 'Timestamps and roles are preserved'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What makes Mastra conversation history survive a server restart?',
      choices: [
        'The model remembers it',
        'A storage adapter such as LibSQLStore behind Memory',
        'Using the same agent object',
        'A longer timeout',
      ],
      correctIndex: 1,
      explanation: 'Messages are stored in the database and loaded on the next call.',
    },
    {
      id: 'q2',
      prompt: 'What do thread and resource identify?',
      choices: ['Model and provider', 'The conversation, and who owns it', 'Two API keys', 'The request id and the run id'],
      correctIndex: 1,
      explanation: 'thread = one conversation; resource = its owner (a user or tenant).',
    },
    {
      id: 'q3',
      prompt: 'lastMessages is 2 and the thread has 4 earlier messages. What does the next call see?',
      choices: ['All 4', 'The last 2', 'The first 2', 'None'],
      correctIndex: 1,
      explanation: 'The most recent messages are loaded into context.',
    },
    {
      id: 'q4',
      prompt: 'How do you inspect a thread’s stored messages in order?',
      choices: ['agent.generate()', 'memory.recall({ threadId, resourceId })', 'storage.init()', 'Read the model logs'],
      correctIndex: 1,
      explanation: 'recall() returns messages chronologically with role and createdAt.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'Session 1, restart (close and reopen), follow-up and recall inspection.' },
    {
      path: 'restart-worker.ts',
      title: 'Real restart check',
      description: 'Run as two separate processes by the integration test.',
    },
    { path: 'shared/agent-kit.ts', title: 'Shared logger bridge', description: 'How Mastra logs reach the timeline safely.' },
  ],
  exercise: {
    instructions:
      'In your project, add new Memory({ storage: new LibSQLStore({ id, url: "file:./memory.db" }) }) to an agent, send two messages in one thread, restart your process, and write a test (two child processes) that proves the second process recalls the first one’s messages.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'persisted-to-disk', label: 'The conversation was written to a database file on disk' },
    { id: 'survives-restart', label: 'After closing and reopening the store, new instances found every message from session 1' },
    { id: 'chronological', label: 'The recalled history is in chronological order (user and assistant alternating)' },
    { id: 'window-respected', label: 'The follow-up received at most lastMessages earlier messages as context' },
    { id: 'answer-uses-history', label: 'The answer after the restart uses facts from session 1' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Why durable memory', minutes: 1, talkingPoints: ['Processes restart', 'In-memory default warning'] },
      { title: 'Memory + LibSQLStore', minutes: 1.5, talkingPoints: ['file: URL', 'memory: { thread, resource }'] },
      { title: 'The restart', minutes: 1.5, talkingPoints: ['close() and rebuild', 'recall() after reopening'] },
      {
        title: 'History and the window',
        minutes: 2,
        talkingPoints: ['Chronological recall', 'lastMessages = 2 forgets the name'],
      },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Two-process integration test', 'Next: threads and user boundaries'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 1 },
    costNotice:
      'Offline is free. Live mode makes one model call per message plus the follow-up (3 for the example); loaded history makes later calls longer.',
  },
  tags: ['memory', 'storage', 'libsql', 'threads', 'persistence'],
} satisfies LabDefinitionInput;
