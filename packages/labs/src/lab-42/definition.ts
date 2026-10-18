import type { LabDefinitionInput } from '@mlp/contracts';

const questions = [
  { question: 'What does error E-5003 mean?', expect: { id: 'err-5003' } },
  { question: 'Will I get my money returned?', expect: { id: 'refunds' } },
  { question: 'When will my parcel be delivered?', expect: { id: 'shipping' } },
  { question: 'My card was declined, what should I do?', expect: { id: 'err-4012' } },
  { question: 'Is water damage covered?', expect: { id: 'warranty' } },
];

export const lab42Definition = {
  id: 'lab-42',
  number: 42,
  title: 'Hybrid search',
  moduleId: 'module-09',
  summary:
    'Combine BM25 keyword search and vector search with explicit rank fusion (RRF or a weighted blend), explain every fused score, and show that hybrid fixes the misses of each method alone.',
  concept:
    'Keyword search and vector search fail in opposite ways. Keyword search (here BM25, which weighs rare matching terms more) finds exact codes such as E-5003 but nothing when the wording differs; vector search finds “money returned” for a refund policy but can blur E-5003 with E-7001. ' +
    'Hybrid search runs both and fuses the two rankings into one. ' +
    'Reciprocal Rank Fusion (RRF) adds 1/(k + rank) from each list, so a passage ranked well by either method rises, and scores on different scales never have to be compared; k (usually 60) softens the advantage of the very top ranks. ' +
    'A weighted blend instead normalises each method’s scores to 0–1 and mixes them with a weight alpha; it is easier to tune but depends on how scores are spread. ' +
    'Some vector databases offer hybrid search natively (with sparse vectors); the libSQL store used here does not, even though Mastra’s query parameters have a sparseVector field, so the fusion is written in the application, which also makes every score explainable. ' +
    'Each hit shows its BM25 score and matched terms, its cosine similarity, both ranks, and the arithmetic that produced the fused score, and the lab recomputes that arithmetic to prove it. ' +
    'Fusion is a pure function, so the same inputs always give the same order, which is what makes hybrid ranking testable.',
  objectives: [
    'Score passages with BM25 and with vector similarity',
    'Fuse rankings with Reciprocal Rank Fusion and with a weighted blend',
    'Explain every fused score from its components',
    'Show that hybrid fixes the misses of keyword-only and vector-only search',
  ],
  prerequisites: ['lab-41'],
  inputs: [
    {
      kind: 'json',
      name: 'questions',
      label:
        'Questions (1–6), each with an optional expect { id } (passage ids: refunds, escalation, shipping, warranty, privacy, err-4012, err-5003, err-7001, order-format)',
      maxBytes: 4_000,
      default: questions,
      required: true,
    },
    {
      kind: 'select',
      name: 'method',
      label: 'Fusion method',
      options: [
        { value: 'rrf', label: 'Reciprocal Rank Fusion' },
        { value: 'weighted', label: 'Weighted blend of normalised scores' },
        { value: 'keyword-only', label: 'Keyword only (BM25)' },
        { value: 'vector-only', label: 'Vector only' },
      ],
      default: 'rrf',
      required: true,
    },
    {
      kind: 'number',
      name: 'rrfK',
      label: 'RRF k',
      min: 1,
      max: 200,
      step: 1,
      default: 60,
      required: true,
      visibleWhen: { field: 'method', in: ['rrf'] },
    },
    {
      kind: 'number',
      name: 'alpha',
      label: 'Weighted: vector weight alpha',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
      required: true,
      visibleWhen: { field: 'method', in: ['weighted'] },
    },
    {
      kind: 'number',
      name: 'vectorFloor',
      label: 'Minimum cosine to count as a vector hit',
      min: -1,
      max: 1,
      step: 0.05,
      default: 0.25,
      required: true,
    },
    { kind: 'number', name: 'topK', label: 'Hits shown per question', min: 1, max: 9, step: 1, default: 3, required: true },
  ],
  exampleInput: { questions, method: 'rrf', rrfK: 60, alpha: 0.5, vectorFloor: 0.25, topK: 3 },
  expectedOutput: {
    description:
      'With RRF every question returns its expected passage first. Keyword-only misses the two paraphrased questions (no shared words); vector-only ranks E-7001 above E-5003 for the error-code question. Accuracy: keyword 3/5, vector 4/5, RRF 5/5. Each hit explains its score, for example rrf = 1/(60+1) + 1/(60+2).',
    example: {
      method: 'rrf',
      accuracy: {
        'keyword-only': { correct: 3, judged: 5 },
        'vector-only': { correct: 4, judged: 5 },
        rrf: { correct: 5, judged: 5 },
        weighted: { correct: 5, judged: 5 },
      },
      results: [
        {
          question: 'What does error E-5003 mean?',
          topByMethod: { 'keyword-only': 'err-5003', 'vector-only': 'err-7001', rrf: 'err-5003' },
        },
        {
          question: 'Will I get my money returned?',
          topByMethod: { 'keyword-only': null, 'vector-only': 'refunds', rrf: 'refunds' },
        },
        {
          question: 'When will my parcel be delivered?',
          topByMethod: { 'keyword-only': null, 'vector-only': 'shipping', rrf: 'shipping' },
        },
        { question: 'My card was declined, what should I do?', topByMethod: { rrf: 'err-4012' } },
        { question: 'Is water damage covered?', topByMethod: { rrf: 'warranty' } },
      ],
    },
  },
  guide: {
    procedure: [
      'Open hybrid.ts in the Source tab: read tokenize, bm25Scores and fuse.',
      'Run the example. In the result, compare accuracy per method, then open the first hit of the E-5003 question and read its explanation.',
      'Look at the paraphrased questions: which BM25 terms matched (matched: [])?',
      'Switch to Weighted and try alpha 0, 0.5 and 1: when does weighted behave like keyword-only or vector-only?',
      'Set RRF k to 1 and to 200: how do the fused scores and the order change?',
      'Add a question with an order number, such as “Where do I put ORD-5521?”, and see which method finds order-format.',
      'Optional (costs a few tokens): run live; real embeddings may get E-5003 right on their own; the fusion still explains every score.',
    ],
    prediction:
      'For “What does error E-5003 mean?”, the keyword list ranks err-5003 first and the vector list ranks it second. What is its RRF score with k = 60?',
    hints: [
      { level: 1, text: 'RRF adds one term per list.' },
      { level: 2, text: 'Each term is 1/(k + rank).' },
      { level: 3, text: '1/(60+1) + 1/(60+2) ≈ 0.0325, more than err-7001 gets from being first in only one list.' },
    ],
    commonMistakes: [
      {
        mistake: 'Adding raw BM25 and cosine scores.',
        fix: 'They are on different scales: fuse ranks (RRF) or normalise first (weighted).',
      },
      {
        mistake: 'Stemming or splitting identifiers like E-5003.',
        fix: 'Keep codes whole in the tokenizer, or exact matches are lost.',
      },
      {
        mistake: 'Treating any vector hit as relevant.',
        fix: 'Use a minimum cosine so unrelated passages do not get RRF points.',
      },
      { mistake: 'Fusion that depends on iteration order.', fix: 'Sort by score, then by id, so ties are deterministic.' },
    ],
    challenge: {
      prompt:
        'Give the keyword list twice the weight in RRF (2/(k + rank)). Which questions change, and how would you decide the weight with data instead of by hand?',
      successCriteria: ['A weighted RRF variant is implemented', 'Weights are chosen by accuracy on held-out questions'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Why does RRF combine ranks rather than scores?',
      choices: [
        'Ranks are faster',
        'BM25 and cosine scores are on different scales; ranks are comparable',
        'Scores are secret',
        'Mastra requires it',
      ],
      correctIndex: 1,
      explanation: 'No normalisation needed.',
    },
    {
      id: 'q2',
      prompt: 'Which method finds “E-5003” reliably?',
      choices: ['Vector search', 'Keyword search with identifiers kept whole', 'Neither', 'Only the model'],
      correctIndex: 1,
      explanation: 'Exact tokens are keyword search’s strength.',
    },
    {
      id: 'q3',
      prompt: 'Why does keyword search miss “Will I get my money returned?”',
      choices: [
        'The index is empty',
        'No word of the question appears in the refund passage',
        'BM25 is broken',
        'The question is too long',
      ],
      correctIndex: 1,
      explanation: 'Paraphrases need vector search.',
    },
    {
      id: 'q4',
      prompt: 'Does the libSQL vector store used here support hybrid search natively?',
      choices: [
        'Yes, with sparseVector',
        'No: Mastra defines sparseVector, but @mastra/libsql ignores it',
        'Only for markdown',
        'Only live',
      ],
      correctIndex: 1,
      explanation: 'So the lab fuses in the application.',
    },
  ],
  sourceFiles: [
    {
      path: 'hybrid.ts',
      title: 'Hybrid retrieval',
      description: 'Tokenizer, BM25, ranking, RRF and weighted fusion with explanations.',
    },
    { path: 'run.ts', title: 'Lab run', description: 'Vector side, per-question rankings, method comparison and checks.' },
    { path: 'passages.ts', title: 'Passages', description: 'Policies and error codes used by the lab.' },
  ],
  exercise: {
    instructions:
      'In your project, implement BM25 and RRF over a small passage set, show each fused score’s arithmetic, and write deterministic tests with fixed rankings, including a keyword-only miss and a vector-only miss that hybrid fixes.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'hybrid-expected-top', label: 'The selected method ranked each question’s expected passage first' },
    { id: 'hybrid-beats-single', label: 'The selected method is at least as accurate as keyword-only and vector-only' },
    { id: 'scoring-explained', label: 'Every hit’s fused score recomputes exactly from the components it shows' },
    { id: 'deterministic', label: 'Fusing the same rankings twice gives the same order and scores' },
    { id: 'complementary', label: 'Hybrid fixed at least one keyword-only miss and one vector-only miss' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Two kinds of misses', minutes: 1.5, talkingPoints: ['Exact codes vs paraphrases'] },
      { title: 'BM25 in a minute', minutes: 1, talkingPoints: ['Rare terms weigh more', 'Identifiers kept whole'] },
      { title: 'Fusion', minutes: 2, talkingPoints: ['RRF 1/(k+rank)', 'Weighted with normalisation'] },
      { title: 'Explaining scores', minutes: 1.5, talkingPoints: ['Components and arithmetic', 'Deterministic ties'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['No native hybrid in libSQL', 'Next: reranking'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: {},
    costNotice:
      'Offline is free (mock embeddings; BM25 runs locally). Live embeds the nine passages and the questions with your OpenAI key: a few hundred tokens.',
  },
  tags: ['rag', 'hybrid-search', 'bm25', 'rank-fusion', 'explainability'],
} satisfies LabDefinitionInput;
