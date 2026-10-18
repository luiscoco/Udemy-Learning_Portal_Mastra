import type { LabDefinitionInput } from '@mlp/contracts';

const questions = [
  { question: 'How long do I have to ask for my money back?', expect: { docId: 'support-handbook', contains: 'within 30 days' } },
  { question: 'When will my express order arrive?', expect: { docId: 'support-handbook', contains: 'next business day' } },
  { question: 'Is water damage covered by the warranty?', expect: { docId: 'support-handbook', contains: 'water damage' } },
  { question: 'How long do you keep support chat transcripts?', expect: { docId: 'privacy-policy', contains: '12 months' } },
  { question: 'Who handles a security incident at night?', expect: { docId: 'support-handbook', contains: 'security team' } },
  { question: 'What is the capital of France?', expect: 'none' },
];

export const lab39Definition = {
  id: 'lab-39',
  number: 39,
  title: 'Vector retrieval',
  moduleId: 'module-08',
  summary:
    'Search an index with top-k vector retrieval, read similarity scores and source snippets, and handle an empty index, an unrelated question and chunks that match without answering.',
  concept:
    'Retrieval embeds the question with the same model as the stored chunks and asks the vector store for the k nearest records; the score is the cosine similarity, where 1 means the same direction. ' +
    'The top hits are only candidates: a threshold (minScore) removes weak matches, so an unrelated question can honestly return nothing instead of the least-bad chunk. ' +
    'Each hit should show where it came from: the document, the chunk’s offsets and a snippet around the words that matched, with offsets you can verify against the source. ' +
    'Ranking depends on chunking as much as on the embedder, and there are two opposite traps: chunks that are too small (a heading such as “## Refunds” alone matches the refund question but contains no answer) and chunks that are too big (two topics merged into one chunk dilute the match, which real embeddings punish most). ' +
    'One section per chunk, with its heading kept and no merging, avoids both, which is why this lab indexes sections by default and offers 200-character recursive chunks as a contrast. ' +
    'An empty or missing index is a normal state, for example before lab 38 has been run, and it gets an explicit result rather than an error. ' +
    'Offline, the deterministic mock embedder makes every ranking reproducible; live, real embeddings give a different score scale, so expectations check which chunk wins, not exact scores.',
  objectives: [
    'Run top-k vector search with the same embedder as the index',
    'Use a score threshold so unrelated questions return nothing',
    'Show traceable source snippets with verified offsets',
    'Recognise how chunking changes ranking, and handle an empty index',
  ],
  prerequisites: ['lab-38'],
  inputs: [
    {
      kind: 'json',
      name: 'questions',
      label: 'Questions (1–6), each with an optional expectation { docId, contains } or "none"',
      maxBytes: 4_000,
      default: questions,
      required: true,
    },
    {
      kind: 'select',
      name: 'indexSource',
      label: 'Index',
      options: [
        { value: 'build', label: 'Build from the course documents now (in memory)' },
        { value: 'lab-38', label: 'My lab 38 index (persistent)' },
        { value: 'empty', label: 'An empty index' },
      ],
      default: 'build',
      required: true,
    },
    {
      kind: 'select',
      name: 'chunking',
      label: 'Chunking for the built index',
      options: [
        { value: 'sections', label: 'Sections (headings stay with their rules)' },
        { value: 'recursive-200', label: 'Recursive, 200 characters (headings become their own chunks)' },
      ],
      default: 'sections',
      required: true,
      visibleWhen: { field: 'indexSource', in: ['build'] },
    },
    {
      kind: 'select',
      name: 'embedder',
      label: 'Embedder',
      options: [
        { value: 'default', label: 'Default (mock offline, text-embedding-3-small live)' },
        { value: 'mock/concept-hash-64', label: 'Mock: concept-hash-64 (deterministic, free)' },
        { value: 'openai/text-embedding-3-small', label: 'openai/text-embedding-3-small (live)' },
        { value: 'openai/text-embedding-3-large', label: 'openai/text-embedding-3-large (live)' },
      ],
      default: 'default',
      required: true,
    },
    {
      kind: 'number',
      name: 'dimensions',
      label: 'Dimensions (0 = model default; must match the index)',
      min: 0,
      max: 3072,
      step: 64,
      default: 0,
      required: true,
    },
    { kind: 'number', name: 'topK', label: 'Top k', min: 1, max: 10, step: 1, default: 3, required: true },
    { kind: 'number', name: 'minScore', label: 'Minimum score', min: -1, max: 1, step: 0.05, default: 0.25, required: true },
  ],
  exampleInput: {
    questions,
    indexSource: 'build',
    chunking: 'sections',
    embedder: 'default',
    dimensions: 0,
    topK: 3,
    minScore: 0.25,
  },
  expectedOutput: {
    description:
      'Offline with section chunks, each of the five support questions returns the chunk that contains its answer first, with a snippet around the matching words; the capital-of-France question returns no relevant result because its best score (about 0.10) is below 0.25. Live with text-embedding-3-small the same five chunks win, on a lower score scale.',
    example: {
      indexSource: 'build',
      chunking: 'sections',
      embedder: { id: 'mock/concept-hash-64', simulated: true, dimensions: 64 },
      results: [
        { question: 'How long do I have to ask for my money back?', status: 'answered', expectationMet: true },
        { question: 'When will my express order arrive?', status: 'answered', expectationMet: true },
        { question: 'Is water damage covered by the warranty?', status: 'answered', expectationMet: true },
        { question: 'How long do you keep support chat transcripts?', status: 'answered', expectationMet: true },
        { question: 'Who handles a security incident at night?', status: 'answered', expectationMet: true },
        { question: 'What is the capital of France?', status: 'no-relevant-results', hits: [], expectationMet: true },
      ],
    },
  },
  guide: {
    procedure: [
      'Open run.ts and retrieve.ts in the Source tab: find store.query({ topK }), the minScore filter and snippetFor.',
      'Run the example. For each question, compare the scores of the hits and read the snippet: does it contain the answer?',
      'Switch Chunking to “Recursive, 200 characters” and run: which chunk wins the refund question now, and why can it not answer it?',
      'Lower the minimum score to 0: what does the capital-of-France question return?',
      'Choose “An empty index” and run: what does each question report?',
      'Run lab 38 first, then choose “My lab 38 index” with the same embedder.',
      'Optional (costs a few tokens): run live, then live with the recursive chunks: real embeddings rank the rule above the bare heading, but scores are on a lower scale than the mock’s.',
    ],
    prediction:
      'With 200-character recursive chunks, which chunk will rank first for “How long do I have to ask for my money back?”',
    hints: [
      { level: 1, text: 'Small chunks can contain nothing but a heading.' },
      { level: 2, text: 'A heading like “## Refunds” is very close to a refund question.' },
      { level: 3, text: 'The heading-only chunk “## Refunds” wins; the rule with “within 30 days” drops to rank 3.' },
    ],
    commonMistakes: [
      { mistake: 'Always returning the top k, however weak.', fix: 'Apply a minimum score and report “no relevant results”.' },
      {
        mistake: 'Querying with a different embedder than the index was built with.',
        fix: 'Use the same model and dimension; the index name encodes both here.',
      },
      { mistake: 'Showing hits without their source.', fix: 'Return document, offsets and a snippet for every hit.' },
      { mistake: 'Treating an empty index as an error.', fix: 'Report it explicitly so the user knows to ingest first.' },
    ],
    challenge: {
      prompt:
        'Prefix every chunk with its heading path before embedding (“Support handbook > Refunds: …”) and rerun the recursive-200 contrast. Does the answer chunk win now?',
      successCriteria: ['Heading text is embedded with the rule', 'Snippets and offsets still point at the original text'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What does the score of a hit mean here?',
      choices: [
        'The probability the answer is correct',
        'The cosine similarity between question and chunk vectors',
        'The number of matching words',
        'The chunk length',
      ],
      correctIndex: 1,
      explanation: '1 means the same direction; it is a similarity, not a probability.',
    },
    {
      id: 'q2',
      prompt: 'Why use a minimum score?',
      choices: [
        'To speed up search',
        'So an unrelated question returns nothing instead of the least-bad chunk',
        'Mastra requires it',
        'To save storage',
      ],
      correctIndex: 1,
      explanation: 'Honest “no results” beats a confident wrong context.',
    },
    {
      id: 'q3',
      prompt: 'Why did “## Refunds” beat the refund rule with small recursive chunks?',
      choices: [
        'It is longer',
        'It is a heading-only chunk that matches the topic but contains no answer',
        'Random noise',
        'The embedder is broken',
      ],
      correctIndex: 1,
      explanation: 'Keep each heading with its own section (not merged with the next one), or prefix chunks with their heading.',
    },
    {
      id: 'q4',
      prompt: 'The index is empty. What should the search return?',
      choices: ['An error', 'An explicit empty-index result with no hits', 'Random chunks', 'The last results'],
      correctIndex: 1,
      explanation: 'It is a normal state before ingestion.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'Index sources, top-k search, threshold, snippets and checks.' },
    {
      path: 'retrieve.ts',
      title: 'Retrieval helpers',
      description: 'Corpus indexing, keywords, snippet windows and expectations.',
    },
  ],
  exercise: {
    instructions:
      'In your project, query a vector index with the same embedder it was built with, filter by a minimum score, return document, offsets and a snippet per hit, and write fixture questions whose expected chunk must rank first.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'expected-order', label: 'Known questions returned their expected chunk first (and unrelated ones returned nothing)' },
    { id: 'scores-ranked', label: 'Hits are ranked by similarity, at most topK, all at or above minScore' },
    { id: 'snippets-traceable', label: 'Every snippet shows its source and offsets, and matches the source text there' },
    { id: 'empty-index-handled', label: 'An empty index gives an explicit “empty index” result, not an error' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'From question to vector', minutes: 1, talkingPoints: ['Same embedder as the index', 'Cosine scores'] },
      { title: 'Top k and thresholds', minutes: 1.5, talkingPoints: ['minScore', 'No relevant results'] },
      { title: 'Snippets and provenance', minutes: 1.5, talkingPoints: ['Document, offsets, snippet', 'Verification'] },
      { title: 'Chunking changes ranking', minutes: 2, talkingPoints: ['Heading-only chunks', 'Sections'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Empty index', 'Next: a RAG agent that answers with citations'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: {},
    costNotice:
      'Offline is free (mock embedder). Live embeds the questions (and, for the built index, the corpus) with your OpenAI key: a few hundred tokens, a fraction of a cent.',
  },
  tags: ['rag', 'retrieval', 'vector-search', 'scores', 'provenance'],
} satisfies LabDefinitionInput;
