import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const history = [
  "I'm allergic to peanuts.",
  'My dog is called Rex.',
  'I live in Berlin.',
  'My favourite colour is blue.',
  'I work night shifts as a nurse.',
];
const question = 'What should I avoid eating at the team dinner?';

export const lab24Definition = {
  id: 'lab-24',
  number: 24,
  title: 'Semantic recall',
  moduleId: 'module-05',
  summary:
    'Embed every message, then let Mastra find older messages by meaning: a question in a new conversation brings back a fact you mentioned long ago, scoped to the right user.',
  concept:
    'lastMessages only brings back the most recent messages, so a fact mentioned twenty messages ago or in another conversation is invisible to the agent. ' +
    'Semantic recall fixes that: Mastra embeds every stored message into a vector, and on each new message it searches those vectors for the closest meanings. ' +
    'You enable it on Memory with a vector store and an embedder, for example new Memory({ storage, vector: new LibSQLVector({ … }), embedder, options: { semanticRecall: { topK, messageRange, scope } } }). ' +
    'topK is how many matching messages to bring back, messageRange adds neighbouring messages around each match for context, and scope decides whether to search only this thread or all of the user’s threads. ' +
    'With scope "resource", Mastra adds the matches to the prompt as messages “remembered from a different conversation”, and it always filters the search by the user, so one user never recalls another user’s messages. ' +
    'Similar meaning does not need the same words: “what should I avoid eating?” lands close to “I’m allergic to peanuts”. ' +
    'Embeddings come from an embedding model, so live mode uses openai/text-embedding-3-small, while offline mode uses a deterministic stand-in that groups related words, which is not a real model. ' +
    'Because the vector store is just a MastraVector, tests can swap in an in-memory stub and inspect every search.',
  objectives: [
    'Configure semantic recall with a vector store and an embedder',
    'Explain topK, messageRange and scope',
    'Recall an older fact from another conversation by meaning',
    'Test recall with a stubbed vector service and inspect the search',
  ],
  prerequisites: ['lab-23'],
  inputs: [
    {
      kind: 'json',
      name: 'history',
      label: 'Earlier conversation (1–8 messages from you)',
      maxBytes: 3_000,
      default: history,
      required: true,
    },
    {
      kind: 'text',
      name: 'question',
      label: 'Question in a new conversation',
      minLength: 1,
      maxLength: 300,
      default: question,
      required: true,
    },
    {
      kind: 'text',
      name: 'expectedFact',
      label: 'Which earlier message should be recalled?',
      help: 'Copy it exactly from the earlier conversation.',
      minLength: 1,
      maxLength: 300,
      default: history[0],
      required: true,
    },
    { kind: 'boolean', name: 'semanticRecall', label: 'Enable semantic recall', default: true, required: true },
    {
      kind: 'number',
      name: 'topK',
      label: 'topK (matches to recall)',
      min: 1,
      max: 5,
      step: 1,
      default: 2,
      required: true,
      visibleWhen: { field: 'semanticRecall', in: ['true'] },
    },
    {
      kind: 'number',
      name: 'messageRange',
      label: 'messageRange (neighbours around each match)',
      min: 0,
      max: 2,
      step: 1,
      default: 0,
      required: true,
      visibleWhen: { field: 'semanticRecall', in: ['true'] },
    },
    {
      kind: 'select',
      name: 'scope',
      label: 'Scope',
      options: [
        { value: 'resource', label: 'resource: all of this user’s conversations' },
        { value: 'thread', label: 'thread: only the current conversation' },
      ],
      default: 'resource',
      required: true,
      visibleWhen: { field: 'semanticRecall', in: ['true'] },
    },
    {
      kind: 'number',
      name: 'lastMessages',
      label: 'lastMessages (recent window)',
      min: 1,
      max: 10,
      step: 1,
      default: 2,
      required: true,
    },
    {
      kind: 'select',
      name: 'vectorBackend',
      label: 'Vector store',
      options: [
        { value: 'libsql', label: 'LibSQLVector (durable file)' },
        { value: 'in-memory', label: 'In-memory stub (what the tests use)' },
      ],
      default: 'libsql',
      required: true,
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Chat model',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: {
    history,
    question,
    expectedFact: history[0],
    semanticRecall: true,
    topK: 2,
    messageRange: 0,
    scope: 'resource',
    lastMessages: 2,
    vectorBackend: 'libsql',
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'The question, asked in a new thread, triggers a vector search filtered to your user. Its best hit is “I’m allergic to peanuts.” from the earlier conversation; with topK 2 a weaker second hit (the night-shift job, matched through “team”) comes along. The other user’s shellfish allergy never appears, and the answer uses the fact.',
    example: {
      embedder: 'offline-sim/concept-embedder (stand-in, not a real model)',
      vectorBackend: 'libsql',
      questionQuery: {
        topK: 2,
        filter: { resource_id: 'learner' },
        // topK = 2: the strong match, plus a weaker one ("team" dinner ~ work) that a smaller topK would drop.
        hits: [
          { role: 'user', content: "I'm allergic to peanuts.", owner: 'you', thread: 'earlier-chat' },
          { role: 'user', content: 'I work night shifts as a nurse.', owner: 'you', thread: 'earlier-chat' },
        ],
      },
      recalledFact: true,
      promptRemembered: ["I'm allergic to peanuts.", 'I work night shifts as a nurse.'],
      answer:
        "From our earlier conversation I remember: “I'm allergic to peanuts.” “I work night shifts as a nurse.” Keep that in mind for your plans.",
    },
  },
  guide: {
    procedure: [
      'Open recall.ts and run.ts in the Source tab: find the vector store, the embedder and semanticRecall.',
      'Run the example. In the result, open questionQuery: what was the filter, and what came back?',
      'Turn off semantic recall and run again. What does the agent know now?',
      'Turn it back on and set the scope to “thread”: why is nothing recalled from a new conversation?',
      'Switch the vector store to the in-memory stub: the result is the same, which is how the tests run.',
      'Optional (costs money): run live; real embeddings from openai/text-embedding-3-small do the matching.',
    ],
    prediction: 'With lastMessages = 2 and recall off, will the agent know about the allergy when asked in a new thread?',
    hints: [
      { level: 1, text: 'A new thread has no recent messages of its own.' },
      { level: 2, text: 'lastMessages works per thread; only semantic recall with resource scope searches other threads.' },
      {
        level: 3,
        text: 'No: with recall off nothing is searched, so the agent answers without the allergy and the checks fail.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Enabling semanticRecall without a vector store.',
        fix: 'Mastra throws “Semantic recall requires a vector store”; pass vector and embedder to Memory.',
      },
      {
        mistake: 'Expecting thread scope to find other conversations.',
        fix: 'Use scope "resource" to search all of the user’s threads.',
      },
      {
        mistake: 'Mixing embedding models in one index.',
        fix: 'Vectors from different models (or dimensions) are not comparable; use one index per embedder.',
      },
      {
        mistake: 'A large topK “to be safe”.',
        fix: 'Every recalled message is added to the prompt and costs tokens; start small.',
      },
      {
        mistake: 'Expecting the user’s original wording to be the top hit.',
        fix: 'Assistant replies that restate a fact are embedded too; with real embeddings they often rank first. Check for the fact, not one message.',
      },
    ],
    challenge: {
      prompt:
        'Add a second user with the same question and their own history. How do you prove from the recorded queries that each user only searched their own messages?',
      successCriteria: ['Each user’s question query is filtered by their own resource id', 'No hit crosses users'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What does semantic recall add to the agent’s prompt?',
      choices: [
        'The most recent messages',
        'Older messages whose meaning is closest to the new message',
        'All messages',
        'A summary',
      ],
      correctIndex: 1,
      explanation: 'It searches embeddings of stored messages for the closest matches.',
    },
    {
      id: 'q2',
      prompt: 'Which setting lets recall search the user’s other conversations?',
      choices: ['lastMessages', 'topK', 'scope: "resource"', 'messageRange'],
      correctIndex: 2,
      explanation: 'Resource scope searches every thread of the same user.',
    },
    {
      id: 'q3',
      prompt: 'What does Mastra need besides storage to enable semantic recall?',
      choices: ['A second agent', 'A vector store and an embedder', 'A workflow', 'Working memory'],
      correctIndex: 1,
      explanation: 'Messages are embedded and searched in a vector store.',
    },
    {
      id: 'q4',
      prompt: 'How can a test check semantic recall without a real vector database?',
      choices: [
        'It cannot',
        'Pass a stub MastraVector, such as an in-memory one, and inspect its queries',
        'Mock the agent',
        'Disable recall',
      ],
      correctIndex: 1,
      explanation: 'Memory accepts any MastraVector, so a stub works the same way.',
    },
  ],
  sourceFiles: [
    {
      path: 'run.ts',
      title: 'Lab run',
      description: 'Memory with vector + embedder, the new-thread question and the recorded search.',
    },
    {
      path: 'recall.ts',
      title: 'Embedders',
      description: 'Offline concept embedder (stand-in) and the live embedding model id.',
    },
  ],
  exercise: {
    instructions:
      'In your project, add semanticRecall with a LibSQLVector and an embedder to your Memory, tell the agent a fact in one thread, and write a test (using an in-memory MastraVector stub) that asks a related question in a new thread and asserts the fact is in the vector query results.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'older-fact-recalled', label: 'Semantic search for the question returned the older relevant fact' },
    { id: 'from-another-thread', label: 'The fact came from an earlier conversation, not the current thread’s recent messages' },
    { id: 'scoped-to-user', label: 'No recalled message belongs to another user' },
    { id: 'top-k-respected', label: 'The search returned at most topK hits' },
    { id: 'answer-uses-fact', label: 'The answer uses the recalled fact' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Recency is not relevance', minutes: 1, talkingPoints: ['lastMessages per thread', 'The forgotten allergy'] },
      {
        title: 'Embeddings and vector search',
        minutes: 1.5,
        talkingPoints: ['Similar meaning, close vectors', 'Offline stand-in vs real model'],
      },
      { title: 'Configuring recall', minutes: 1.5, talkingPoints: ['vector + embedder', 'topK, messageRange, scope'] },
      {
        title: 'Inspecting the search',
        minutes: 2,
        talkingPoints: ['The recorded query and its user filter', 'Recall off, thread scope'],
      },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Stub vectors in tests', 'Next: observational memory'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 1 },
    costNotice:
      'Offline is free. Live mode makes one chat call per message (7 for the example) and embeds each stored message and query with openai/text-embedding-3-small (fractions of a cent); it needs OPENAI_API_KEY.',
  },
  tags: ['memory', 'semantic-recall', 'embeddings', 'vector-store'],
} satisfies LabDefinitionInput;
