import type { LabDefinitionInput } from '@mlp/contracts';

export const lab38Definition = {
  id: 'lab-38',
  number: 38,
  title: 'Embeddings and store',
  moduleId: 'module-08',
  summary:
    'Turn chunks into vectors with a configurable embedder, store them in a vector index with their source metadata, and prove the records are deterministic, idempotent and retrievable.',
  concept:
    'An embedding model maps text to a vector, a list of numbers where texts with similar meaning point in similar directions; retrieval later compares a question’s vector with stored ones. ' +
    'In Mastra, embedding models are addressed like language models, as "provider/model" (here openai/text-embedding-3-small or -large), and they report how many tokens they consumed, which is what you pay for. ' +
    'Offline, this lab uses a deterministic mock embedder that hashes words into 64 dimensions and groups related words; it is a stand-in for tests, not a real model, but it makes every result reproducible. ' +
    'Vectors are only comparable within one model and one dimension, so each index holds exactly one embedder and dimension: a dimension mismatch is refused, and since createIndex on an existing index silently keeps the old dimension, the lab checks it explicitly. ' +
    'Each record is stored with metadata (document, source, offsets and text) so later answers can cite it, and with an id derived from its content, so ingesting the same document again replaces records instead of duplicating them. ' +
    'Finally the lab proves the records are retrievable by querying each one with its own vector, and checks determinism: the mock gives identical vectors, while a provider gives the same direction but not bit-for-bit the same numbers.',
  objectives: [
    'Embed chunks with a configurable embedder and track token usage and cost',
    'Store vectors with source metadata in a persistent vector index',
    'Keep one embedder and dimension per index, and make upserts idempotent with content ids',
    'Verify stored records are retrievable and embeddings deterministic',
  ],
  prerequisites: ['lab-37'],
  inputs: [
    {
      kind: 'select',
      name: 'source',
      label: 'Documents',
      options: [
        { value: 'sample', label: 'Built-in course documents' },
        { value: 'library', label: 'My course library (lab 36)' },
      ],
      default: 'sample',
      required: true,
    },
    {
      kind: 'number',
      name: 'chunkSize',
      label: 'Chunk size (characters, recursive)',
      min: 100,
      max: 1000,
      step: 10,
      default: 200,
      required: true,
    },
    { kind: 'number', name: 'overlap', label: 'Overlap (characters)', min: 0, max: 200, step: 10, default: 50, required: true },
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
      label: 'Dimensions (0 = model default; live models only)',
      min: 0,
      max: 3072,
      step: 64,
      default: 0,
      required: true,
    },
    {
      kind: 'number',
      name: 'batchSize',
      label: 'Batch size (texts per embedding call)',
      min: 1,
      max: 256,
      step: 1,
      default: 16,
      required: true,
    },
    {
      kind: 'select',
      name: 'store',
      label: 'Vector store',
      options: [
        { value: 'libsql', label: 'libSQL (persistent; lab 39 searches it)' },
        { value: 'in-memory', label: 'In-memory (gone after the run)' },
      ],
      default: 'libsql',
      required: true,
    },
    {
      kind: 'select',
      name: 'idStrategy',
      label: 'Record ids',
      options: [
        { value: 'content', label: 'Derived from content (idempotent)' },
        { value: 'random', label: 'Random per upsert (anti-pattern)' },
      ],
      default: 'content',
      required: true,
    },
  ],
  exampleInput: {
    source: 'sample',
    chunkSize: 200,
    overlap: 50,
    embedder: 'default',
    dimensions: 0,
    batchSize: 16,
    store: 'libsql',
    idStrategy: 'content',
  },
  expectedOutput: {
    description:
      'Offline: 13 chunks are embedded by the 64-dimensional mock in one batch and stored in l38_concept_hash_64_64 with their source and offsets; the second upsert leaves the count unchanged, every record is its own top hit, and re-embedding gives identical vectors. Live with text-embedding-3-small: 1536 dimensions, a few hundred tokens, a fraction of a cent.',
    example: {
      embedder: { id: 'mock/concept-hash-64', simulated: true, dimensions: 64 },
      store: 'libsql',
      indexName: 'l38_concept_hash_64_64',
      batches: [{ size: 13, tokens: 0 }],
      dimensionCheck: { ok: true, code: null },
      selfQuery: { checked: 13, topHit: 13, metadataIntact: 13 },
      determinism: { samples: 3, identical: 3 },
    },
  },
  guide: {
    procedure: [
      'Open run.ts and embedders.ts in the Source tab: follow chunk → embed (batches) → upsert → upsert again → self-query.',
      'Run the example. Compare index.countAfterFirst and countAfterSecond, and look at a record’s metadata in the result.',
      'Switch Record ids to Random and run: what happens to the count after the second upsert?',
      'Set the batch size to 4 and run: how many embedding calls are made now?',
      'Optional (costs money, a fraction of a cent): run live with the default embedder, then with dimensions 256. Compare dimensions, tokens and the determinism result.',
      'Run live with text-embedding-3-large: which index is used, and why is it a different one?',
    ],
    prediction: 'With random record ids, how many records will the index hold after the same 13 chunks are upserted twice?',
    hints: [
      { level: 1, text: 'An upsert replaces a record only when the id is the same.' },
      { level: 2, text: 'Random ids are new every time.' },
      { level: 3, text: 'Twice as many: 26 new records, half of them duplicates. Content-derived ids keep it at 13.' },
    ],
    commonMistakes: [
      {
        mistake: 'Mixing vectors from two models (or two dimensions) in one index.',
        fix: 'One index per embedder and dimension; check describeIndex before upserting.',
      },
      {
        mistake: 'Random or sequential ids for chunks.',
        fix: 'Derive ids from document, offsets and text so re-ingestion is idempotent.',
      },
      {
        mistake: 'Storing only the vector.',
        fix: 'Store document, source, offsets and text as metadata so answers can cite the source.',
      },
      {
        mistake: 'Expecting bit-identical vectors from a provider.',
        fix: 'Compare by cosine similarity; only a mock is exactly deterministic.',
      },
    ],
    challenge: {
      prompt:
        'A document is edited and re-ingested. With content ids, the changed chunks get new ids and the old ones stay behind. How do you remove the stale records?',
      successCriteria: [
        'Records are deleted by docId before re-upserting, or by comparing id sets',
        'The count matches the new chunk count',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Why one index per embedder and dimension?',
      choices: [
        'Indexes are cheap',
        'Vectors from different models or dimensions are not comparable',
        'Mastra requires it',
        'For speed only',
      ],
      correctIndex: 1,
      explanation: 'Similarity only means something inside one embedding space.',
    },
    {
      id: 'q2',
      prompt: 'What does createIndex do on an existing index with a different dimension (verified here)?',
      choices: ['Throws', 'Silently keeps the old dimension', 'Resizes the vectors', 'Deletes the index'],
      correctIndex: 1,
      explanation: 'So the lab checks describeIndex explicitly.',
    },
    {
      id: 'q3',
      prompt: 'Why derive record ids from the content?',
      choices: ['Shorter ids', 'Upserting the same chunk replaces instead of duplicating', 'Faster search', 'Required by libSQL'],
      correctIndex: 1,
      explanation: 'Idempotent re-ingestion.',
    },
    {
      id: 'q4',
      prompt: 'How do you check that a provider’s embeddings are stable?',
      choices: ['Compare the JSON exactly', 'Compare by cosine similarity (≈ 1)', 'Ask the model', 'They are always random'],
      correctIndex: 1,
      explanation: 'Providers return the same direction, not necessarily the same bits.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'Chunks, batched embeddings, upserts, self-query and determinism checks.' },
    { path: 'embedders.ts', title: 'Embedders', description: 'Mock and live embedders, index naming, cosine.' },
  ],
  exercise: {
    instructions:
      'In your project, embed chunks with a Mastra embedding model, upsert them into a vector index with content-derived ids and source metadata, and test that a second upsert keeps the count and that each record is its own top hit.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'vectors-stored', label: 'Every chunk was embedded and stored with its source metadata' },
    { id: 'dimensions-consistent', label: 'The index holds vectors of exactly this embedder’s dimension' },
    { id: 'idempotent-upsert', label: 'Upserting the same records again did not change the index count' },
    { id: 'retrievable', label: 'Each record is the top hit for its own vector, with its metadata intact' },
    { id: 'deterministic-embeddings', label: 'Re-embedding gives identical vectors (mock) or the same direction (provider)' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'What an embedding is', minutes: 1, talkingPoints: ['Text to vector', 'Similarity by direction'] },
      { title: 'Embedders and cost', minutes: 1.5, talkingPoints: ['provider/model ids', 'Token usage', 'Mock for tests'] },
      { title: 'Index integrity', minutes: 1.5, talkingPoints: ['One model per index', 'createIndex keeps the old dimension'] },
      { title: 'Records', minutes: 1.5, talkingPoints: ['Content ids', 'Metadata for citations', 'Random-id contrast'] },
      { title: 'Verification', minutes: 1.5, talkingPoints: ['Self-query', 'Determinism', 'Next: vector retrieval'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 180_000,
    budget: {},
    costNotice:
      'Offline is free (mock embedder). Live embeds every chunk with your OpenAI key: the example is a few hundred tokens, a fraction of a cent with text-embedding-3-small. Vectors are stored locally.',
  },
  tags: ['rag', 'embeddings', 'vector-store', 'libsql', 'idempotency'],
} satisfies LabDefinitionInput;
