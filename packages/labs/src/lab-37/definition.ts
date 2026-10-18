import type { LabDefinitionInput } from '@mlp/contracts';

const configs = [
  { label: 'char-300', strategy: 'character', maxSize: 300, overlap: 0 },
  { label: 'recursive-200', strategy: 'recursive', maxSize: 200, overlap: 50 },
  { label: 'token-80', strategy: 'token', maxSize: 80, overlap: 16 },
];

export const lab37Definition = {
  id: 'lab-37',
  number: 37,
  title: 'Chunking strategies',
  moduleId: 'module-08',
  summary:
    'Split documents with Mastra’s chunkers, compare strategies, sizes and overlap in characters and tokens, and keep every chunk traceable to its source and exact offsets, with no empty chunks.',
  concept:
    'A retriever never sees a whole document: it sees chunks, so how you split decides what can be found and cited. ' +
    'Mastra’s MDocument offers several strategies: character and recursive splitting by separators, token splitting by model tokens, and structure-aware splitting by Markdown headings or sentences. ' +
    'Size and overlap pull in opposite directions: small chunks are precise but lose context, large ones keep context but dilute the match, and overlap repeats text where a section had to be cut, so a fact split in two still appears whole in one chunk, at the cost of more embeddings. ' +
    'Sizes come in two units: characters are what you read, tokens are what models and embedding limits count, so this lab shows both for every chunk. ' +
    'Each chunk must stay traceable to its document and its exact start and end offsets, because later lessons cite sources by chunk. ' +
    'Mastra can report a start index (addStartIndex), but in this version it is -1 for some overlapping token chunks, so the lab verifies every offset against the source and relocates the chunk when needed. ' +
    'Some splitters also leave degenerate fragments, such as a lone full stop; those are dropped and reported instead of being embedded.',
  objectives: [
    'Chunk documents with Mastra’s character, recursive, token, Markdown and sentence strategies',
    'Compare chunk count, size and overlap in characters and tokens',
    'Keep every chunk traceable to its source and verified offsets',
    'Detect and drop empty or degenerate chunks',
  ],
  prerequisites: ['lab-36'],
  inputs: [
    {
      kind: 'select',
      name: 'source',
      label: 'Documents',
      options: [
        { value: 'sample', label: 'Built-in course documents (handbook and privacy policy)' },
        { value: 'library', label: 'My course library (documents ingested in lab 36)' },
        { value: 'paste', label: 'Paste text' },
      ],
      default: 'sample',
      required: true,
    },
    { kind: 'textarea', name: 'text', label: 'Text to chunk', minLength: 20, maxLength: 20_000, rows: 8, default: '', required: true, visibleWhen: { field: 'source', in: ['paste'] } },
    {
      kind: 'json',
      name: 'configs',
      label: 'Configurations (1–4): label, strategy (character | recursive | token | markdown | sentence), maxSize, overlap',
      maxBytes: 4_000,
      default: configs,
      required: true,
    },
  ],
  exampleInput: { source: 'sample', configs },
  expectedOutput: {
    description:
      'char-300 gives 9 chunks with no repeated text, recursive-200 gives 13 chunks with 146 characters of overlap, and token-80 gives 5 chunks of up to 80 tokens; two of the token chunks are relocated because Mastra reported startIndex -1. Every chunk shows its source and offsets, coverage is 100 % and nothing is dropped.',
    example: {
      source: 'sample',
      results: [
        { config: { label: 'char-300' }, unit: 'characters', chunkCount: 9, stats: { coverage: 1, overLimit: 0, offsets: { mastra: 9, relocated: 0, unlocated: 0 } } },
        { config: { label: 'recursive-200' }, unit: 'characters', chunkCount: 13, stats: { coverage: 1, overLimit: 0, totalOverlapChars: 146 } },
        { config: { label: 'token-80' }, unit: 'tokens', chunkCount: 5, stats: { coverage: 1, overLimit: 0, offsets: { mastra: 3, relocated: 2, unlocated: 0 } } },
      ],
    },
  },
  guide: {
    procedure: [
      'Open run.ts and chunks.ts in the Source tab: find doc.chunk({ strategy, maxSize, overlap, addStartIndex: true }) and locate().',
      'Run the example. For each configuration compare chunkCount, the size stats in characters and tokens, and totalOverlapChars.',
      'Open a few chunk previews: check source, start and end, and offsetSource. Which configuration needed relocated offsets?',
      'Change recursive-200 to maxSize 300 and overlap 60: why does totalOverlapChars drop to 0?',
      'Add { "label": "md", "strategy": "markdown", "maxSize": 600, "overlap": 0 }: how do the chunks follow the headings?',
      'Choose Paste text, paste a few short sentences, and try { "label": "s", "strategy": "sentence", "maxSize": 40, "overlap": 0 }: is anything dropped?',
      'Choose My course library to chunk what you ingested in lab 36.',
    ],
    prediction: 'With recursive splitting at 200 characters and an overlap of 50, will the total number of characters in all chunks be larger or smaller than the documents?',
    hints: [
      { level: 1, text: 'Overlap repeats text at chunk borders.' },
      { level: 2, text: 'Every overlapping pair counts the shared part twice.' },
      { level: 3, text: 'Larger: totalOverlapChars is the extra text you would embed and store.' },
    ],
    commonMistakes: [
      { mistake: 'Measuring chunk size only in characters.', fix: 'Embedding and context limits count tokens; check both.' },
      { mistake: 'Expecting overlap between every pair of chunks.', fix: 'Splitters only overlap inside a segment they had to cut; sections that fit stay apart.' },
      { mistake: 'Trusting a reported start index.', fix: 'Verify source.slice(start, end) === text, and relocate when it does not match.' },
      { mistake: 'Embedding every chunk the splitter returns.', fix: 'Drop empty and punctuation-only fragments first.' },
      { mistake: 'Losing the source of a chunk.', fix: 'Keep document id, name and offsets on every chunk for citations.' },
    ],
    challenge: {
      prompt: 'Choose one configuration for a support bot that must quote refund rules exactly. Justify the strategy, size and overlap from this lab’s numbers.',
      successCriteria: ['Each refund rule appears whole in at least one chunk', 'The extra overlap cost is stated'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What is the main cost of a larger overlap?',
      choices: ['Lost text', 'More repeated text to embed and store', 'Fewer chunks', 'Wrong offsets'],
      correctIndex: 1,
      explanation: 'Overlap keeps borders intact by duplicating text.',
    },
    {
      id: 'q2',
      prompt: 'Why measure chunk size in tokens as well as characters?',
      choices: ['Tokens are prettier', 'Models and embedding limits count tokens', 'Characters are wrong', 'Mastra requires it'],
      correctIndex: 1,
      explanation: 'A 300-character chunk can be 50 or 120 tokens depending on the text.',
    },
    {
      id: 'q3',
      prompt: 'Mastra reports startIndex -1 for a token chunk. What should the app do?',
      choices: ['Drop the chunk', 'Relocate it in the source and verify the offset', 'Use 0', 'Ignore offsets'],
      correctIndex: 1,
      explanation: 'Every chunk must stay traceable for citations.',
    },
    {
      id: 'q4',
      prompt: 'A splitter returns the chunk ".". What happens to it here?',
      choices: ['It is embedded', 'It is dropped and reported as degenerate', 'It is merged silently', 'The run fails'],
      correctIndex: 1,
      explanation: 'Chunks without letters or digits add nothing to retrieval.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'Sources, MDocument chunking per configuration, stats and checks.' },
    { path: 'chunks.ts', title: 'Chunk analysis', description: 'Offset verification and relocation, degenerate filter, coverage and token counts.' },
    { path: 'corpus.ts', title: 'Course documents', description: 'The built-in documents used by the RAG labs.' },
  ],
  exercise: {
    instructions:
      'In your project, chunk a document with two Mastra strategies, attach source and verified offsets to every chunk, drop degenerate chunks, and write a test that source.slice(start, end) equals each chunk’s text.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'no-empty-chunks', label: 'No empty or degenerate chunk is returned (they are dropped and reported)' },
    { id: 'offsets-traceable', label: 'Every chunk shows its source document and verified start/end offsets' },
    { id: 'sizes-within-limit', label: 'Every chunk is within its configuration’s maxSize (tokens for token chunking, characters otherwise)' },
    { id: 'source-covered', label: 'The chunks cover all of the source text’s letters and digits (nothing lost)' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Why chunk', minutes: 1, talkingPoints: ['Retrievers see chunks, not documents'] },
      { title: 'Strategies', minutes: 2, talkingPoints: ['Character, recursive, token', 'Markdown and sentence'] },
      { title: 'Size and overlap', minutes: 1.5, talkingPoints: ['Characters vs tokens', 'Overlap cost'] },
      { title: 'Traceability', minutes: 1.5, talkingPoints: ['Source and offsets', 'startIndex -1 for tokens', 'Relocation'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Degenerate chunks', 'Next: embeddings and the vector store'] },
    ],
  },
  execution: {
    modes: ['offline'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: {},
    costNotice: 'No model is called: chunking and token counting run locally.',
  },
  tags: ['rag', 'chunking', 'tokens', 'traceability'],
} satisfies LabDefinitionInput;
