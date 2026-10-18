import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const questions = [
  { question: 'Within how many days can I request a refund?', expect: { docId: 'support-handbook', contains: '30 days' } },
  { question: 'When does an express order arrive?', expect: { docId: 'support-handbook', contains: 'next business day' } },
  { question: 'How long do you keep support chat transcripts?', expect: { docId: 'privacy-policy', contains: '12 months' } },
  { question: 'Do you offer a student discount?', expect: 'unsupported' },
];

export const lab40Definition = {
  id: 'lab-40',
  number: 40,
  title: 'RAG question-answering agent',
  moduleId: 'module-08',
  summary:
    'Build an agent that searches the documents with Mastra’s vector query tool, answers with verbatim citations, and is checked by a citation guard that blocks invented sources, misquotes, ungrounded numbers and answers to questions the documents do not cover.',
  concept:
    'A RAG agent answers from retrieved passages instead of its own memory: it calls a search tool, reads the returned chunks and writes an answer that points back to them. ' +
    'Mastra provides the search tool ready-made: createVectorQueryTool wraps a vector store, an index and an embedding model, and returns the matching chunks with their metadata and scores. ' +
    'Citations make answers checkable, but only if something checks them: a model can cite a chunk it never received, quote a sentence that is not there, add a number from general knowledge, or answer a question the documents do not cover. ' +
    'So the agent must return its answer in a fixed shape (answer, supported, and citations with a chunk id and an exact quote), and the application verifies it before showing it: each cited chunk must have been retrieved in this run, each quote must appear in that chunk, the support must score above a threshold, and every number must come from a quote. ' +
    'An answer that fails is not repaired or guessed at; it is blocked and replaced by an honest “I can’t confirm that from the documents”, with the reasons logged. ' +
    'Each accepted citation is shown with its source document, offsets and score, so a reader can open the passage behind the claim. ' +
    'Offline, a scripted model plays the agent deterministically, and an “overconfident” variant invents a discount with a fake citation to show the guard at work.',
  objectives: [
    'Give a Mastra agent a vector query tool over a document index',
    'Require answers with chunk-id citations and verbatim quotes',
    'Verify citations, quotes and numbers against what was retrieved, and block failures',
    'Answer honestly when the documents do not cover a question',
  ],
  prerequisites: ['lab-39'],
  inputs: [
    {
      kind: 'json',
      name: 'questions',
      label: 'Questions (1–5), each with an optional expectation { docId, contains } or "unsupported"',
      maxBytes: 4_000,
      default: questions,
      required: true,
    },
    { kind: 'number', name: 'topK', label: 'Chunks per search (topK)', min: 1, max: 8, step: 1, default: 3, required: true },
    {
      kind: 'number',
      name: 'minScore',
      label: 'Minimum score for support',
      min: -1,
      max: 1,
      step: 0.05,
      default: 0.25,
      required: true,
    },
    {
      kind: 'select',
      name: 'guard',
      label: 'Citation guard',
      options: [
        { value: 'on', label: 'On: verify citations before showing an answer' },
        { value: 'off', label: 'Off: show whatever the model says (anti-pattern)' },
      ],
      default: 'on',
      required: true,
    },
    {
      kind: 'select',
      name: 'offlineBehaviour',
      label: 'Offline model behaviour',
      options: [
        { value: 'faithful', label: 'Faithful: quotes the documents, refuses otherwise' },
        { value: 'overconfident', label: 'Overconfident: invents an answer when nothing matches' },
      ],
      default: 'faithful',
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
  exampleInput: { questions, topK: 3, minScore: 0.25, guard: 'on', offlineBehaviour: 'faithful', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'The refund, express-delivery and transcript questions are answered with a verbatim quote and a citation to the right document, shown with its source, offsets and score. The student-discount question gets “The documents don’t say.” with no citations.',
    example: {
      guard: 'on',
      outcomes: [
        {
          question: 'Within how many days can I request a refund?',
          guard: { verdict: 'accepted' },
          shown: { supported: true, answer: 'Customers can request a refund within 30 days of delivery.' },
        },
        { question: 'When does an express order arrive?', guard: { verdict: 'accepted' }, shown: { supported: true } },
        { question: 'How long do you keep support chat transcripts?', guard: { verdict: 'accepted' }, shown: { supported: true } },
        {
          question: 'Do you offer a student discount?',
          guard: { verdict: 'accepted' },
          shown: { supported: false, answer: "The documents don't say.", citations: [] },
        },
      ],
    },
  },
  guide: {
    procedure: [
      'Open run.ts in the Source tab: find createVectorQueryTool, the instructions and the JSON answer contract; then open guard.ts.',
      'Run the example. In the trace, open the searchDocs tool calls: what did the agent receive? Compare the cited chunk ids with them.',
      'Read a shown citation: its source, offsets and score.',
      'Switch Offline model behaviour to Overconfident and run: what does the guard block for the discount question, and why?',
      'Turn the citation guard off and run again with the overconfident model: what does the learner see now?',
      'Optional (costs about a cent): run live with gpt-5-mini; check whether its quotes pass the guard.',
    ],
    prediction:
      'The overconfident model answers “students get a 15% discount” citing chunk C-unknown. Which guard rules will it break?',
    hints: [
      { level: 1, text: 'Was C-unknown in the searchDocs results?' },
      { level: 2, text: 'Is “15” in any quote from a retrieved chunk?' },
      {
        level: 3,
        text: 'UNKNOWN_CHUNK (never retrieved) and UNGROUNDED_NUMBER (15 is in no valid quote); the answer is replaced by the honest fallback.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Trusting citations because they look specific.',
        fix: 'Check each chunk id against what the tool returned in this run.',
      },
      { mistake: 'Accepting paraphrased “quotes”.', fix: 'Require verbatim quotes and check they occur in the chunk.' },
      {
        mistake: 'Letting the tool’s top-k stand in for relevance.',
        fix: 'createVectorQueryTool has no threshold; enforce a minimum score yourself.',
      },
      { mistake: 'Repairing a failed answer with a guess.', fix: 'Block it and say the documents cannot confirm it.' },
    ],
    challenge: {
      prompt:
        'Allow answers that combine two chunks (“Express orders arrive the next day; refunds take five business days”). How must the guard change so each claim is tied to its own quote?',
      successCriteria: ['Each sentence of the answer maps to at least one citation', 'A sentence without a citation is blocked'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What does createVectorQueryTool return to the agent?',
      choices: ['A final answer', 'The matching chunks’ metadata and scores', 'Only document names', 'Embeddings to compare'],
      correctIndex: 1,
      explanation: 'relevantContext (stored metadata) and sources (ids and scores).',
    },
    {
      id: 'q2',
      prompt: 'The model cites a chunk id that searchDocs never returned. What should happen?',
      choices: [
        'Show the answer',
        'Block it as UNKNOWN_CHUNK and show the honest fallback',
        'Look the chunk up later',
        'Ask the model again silently',
      ],
      correctIndex: 1,
      explanation: 'Only retrieved chunks can support an answer.',
    },
    {
      id: 'q3',
      prompt: 'Why check numbers separately?',
      choices: [
        'Numbers are long',
        'They are the facts models most often invent, and must come from a quote',
        'JSON cannot hold numbers',
        'For formatting',
      ],
      correctIndex: 1,
      explanation: 'A “15% discount” is exactly the kind of detail to verify.',
    },
    {
      id: 'q4',
      prompt: 'Does createVectorQueryTool drop weak matches on its own?',
      choices: [
        'Yes',
        'No: it returns its top k however weak, so the app enforces a minimum score',
        'Only with a reranker',
        'Only for libSQL',
      ],
      correctIndex: 1,
      explanation: 'Verified on the installed version.',
    },
  ],
  sourceFiles: [
    {
      path: 'run.ts',
      title: 'Lab run',
      description: 'Agent with createVectorQueryTool, scripted offline model, guard and checks.',
    },
    { path: 'guard.ts', title: 'Citation guard', description: 'Answer contract and the verification rules.' },
  ],
  exercise: {
    instructions:
      'In your project, give an agent a createVectorQueryTool, require JSON answers with chunk-id citations and exact quotes, and write a guard with tests for unknown chunks, missing quotes, ungrounded numbers and unsupported questions.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'citations-map-to-chunks', label: 'Every shown citation is a retrieved chunk and its quote appears verbatim in it' },
    { id: 'answers-grounded', label: 'Answerable questions got a supported answer citing the expected document' },
    { id: 'unsupported-handled', label: 'Questions the documents do not cover were answered honestly, without citations' },
    { id: 'numbers-grounded', label: 'Every number in a supported answer appears in a cited quote' },
    { id: 'provenance-shown', label: 'Every shown citation carries its source document, offsets and score' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'From retrieval to answers', minutes: 1, talkingPoints: ['Search tool, then answer'] },
      { title: 'createVectorQueryTool', minutes: 1.5, talkingPoints: ['Store, index, embedder', 'No threshold'] },
      { title: 'The answer contract', minutes: 1.5, talkingPoints: ['answer, supported, citations', 'Verbatim quotes'] },
      { title: 'The citation guard', minutes: 2, talkingPoints: ['Unknown chunks', 'Misquotes', 'Numbers', 'Honest fallback'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Provenance in the UI', 'Next module: metadata filters'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 120_000,
    maxTimeoutMs: 180_000,
    budget: { maxSteps: 4 },
    costNotice:
      'Offline is free (scripted agent, mock embeddings). Live makes two model calls per question (search, then answer) plus a few hundred embedding tokens: about a cent for the example.',
  },
  tags: ['rag', 'agents', 'citations', 'grounding', 'guardrails'],
} satisfies LabDefinitionInput;
