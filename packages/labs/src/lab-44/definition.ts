import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const questions = [
  { question: 'My card was declined and I want a refund: what should I do?', expect: { sources: ['err-4012', 'refunds'] } },
  { question: 'When will my express order arrive, and is water damage covered?', expect: { sources: ['shipping', 'warranty'] } },
  { question: 'What does error E-5003 mean?', expect: { sources: ['err-5003'] } },
  { question: 'Do you offer a student discount?', expect: { sources: [] } },
];

export const lab44Definition = {
  id: 'lab-44',
  number: 44,
  title: 'Citation-aware generation',
  moduleId: 'module-09',
  summary:
    'Generate answers as separate claims, each citing the source sentence it rests on, block claims whose citations do not match their source, and let the reader open every cited passage with the quote highlighted.',
  concept:
    'A long answer usually combines several facts from several documents, so “here are my sources” at the end is not enough: each claim needs its own citation, pointing at the sentence that supports it. ' +
    'This lab retrieves passages with the hybrid search from lab 42, gives them to a Mastra agent with their ids, and asks for JSON claims, each with citations made of a source id and a quote copied from that source. ' +
    'An application-side guard then checks every claim on its own: the cited source must be one that was provided, the quote must really appear in it, the claim must share content with the quote, and every number in the claim must come from the quote. ' +
    'Claims that fail are blocked and listed with the reason, while the valid ones are still shown, so one invented sentence does not discard a whole correct answer; if nothing survives, the answer says so honestly. ' +
    'Every shown citation carries the exact position of its quote in the source, so the Run tab can open the passage and highlight the sentence the claim rests on. ' +
    'Offline, a scripted model writes the claims deterministically, and a “sloppy” variant adds an invented discount with a fake source, a paraphrase passed off as a quote and a wrong number, to show what the guard blocks.',
  objectives: [
    'Generate answers as claims with per-claim citations and verbatim quotes',
    'Verify each claim’s citations and block only the claims that fail',
    'Return quote positions so readers can open and see the source sentence',
    'Handle questions the sources cannot answer honestly',
  ],
  prerequisites: ['lab-43'],
  inputs: [
    {
      kind: 'json',
      name: 'questions',
      label:
        'Questions (1–4), each with an optional expect { sources: [ids] } (the first question is shown with openable citations)',
      maxBytes: 4_000,
      default: questions,
      required: true,
    },
    {
      kind: 'number',
      name: 'maxSources',
      label: 'Sources given to the model',
      min: 1,
      max: 6,
      step: 1,
      default: 4,
      required: true,
    },
    {
      kind: 'select',
      name: 'guard',
      label: 'Claim guard',
      options: [
        { value: 'on', label: 'On: block claims with unmatched citations' },
        { value: 'off', label: 'Off: show every claim (anti-pattern)' },
      ],
      default: 'on',
      required: true,
    },
    {
      kind: 'select',
      name: 'offlineBehaviour',
      label: 'Offline model behaviour',
      options: [
        { value: 'faithful', label: 'Faithful: quotes its sources' },
        { value: 'sloppy', label: 'Sloppy: adds invented and misquoted claims' },
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
  exampleInput: { questions, maxSources: 4, guard: 'on', offlineBehaviour: 'faithful', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'The first answer has two claims: what to do about a declined card (citing the E-4012 passage) and the refund window (citing the refund policy); “Answer with citations” shows them with buttons [1] and [2] that open each passage with the quote highlighted. The second question cites shipping and warranty, the third the E-5003 passage, and the student-discount question honestly shows no claims.',
    example: {
      guard: 'on',
      citedAnswer: {
        claims: [
          {
            text: 'Error E-4012: the card payment was declined by the bank.',
            citations: [{ n: 1, sourceId: 'err-4012', quoteStart: 0 }],
          },
          {
            text: 'Customers can request a refund within 30 days of delivery.',
            citations: [{ n: 2, sourceId: 'refunds', quoteStart: 0 }],
          },
        ],
        blocked: [],
        fallback: false,
      },
    },
  },
  guide: {
    procedure: [
      'Open claims.ts in the Source tab: read guardClaims and locateQuote; then the JSON contract in run.ts.',
      'Run the example. In “Answer with citations”, press [1]: which sentence is highlighted, and in which document? Close it with Escape.',
      'Compare the claims of each question with its retrieved sources in the timeline.',
      'Switch Offline model behaviour to Sloppy and run: read the blocked claims and their reasons. Which valid claims were still shown?',
      'Turn the claim guard off (still sloppy) and run: what does the reader see now, and which checks fail?',
      'Optional (costs about a cent): run live; check whether the model kept one fact per claim and copied quotes exactly.',
    ],
    prediction:
      'The sloppy model says “Refunds can be requested within 60 days of delivery” and quotes the real 30-day sentence. Will the guard accept it?',
    hints: [
      { level: 1, text: 'The quote is real, so the source check passes.' },
      { level: 2, text: 'Look at the numbers in the claim and in the quote.' },
      {
        level: 3,
        text: 'No: “60” is not in the quote, so it is blocked as UNGROUNDED_NUMBER, even though the citation itself is genuine.',
      },
    ],
    commonMistakes: [
      { mistake: 'One list of sources for the whole answer.', fix: 'Tie each claim to the sentence that supports it.' },
      {
        mistake: 'Throwing away the whole answer for one bad claim.',
        fix: 'Block the failing claim, keep the verified ones, and say what was blocked.',
      },
      {
        mistake: 'Accepting a real quote that does not support the claim.',
        fix: 'Also check the claim against its quote (shared content, numbers).',
      },
      {
        mistake: 'Rendering source passages as HTML.',
        fix: 'Render them as text and highlight by offsets, so a source cannot inject markup.',
      },
    ],
    challenge: {
      prompt:
        'Replace the shared-word support check with a stronger one: ask a second model whether the quote entails the claim. How do you keep that check deterministic in tests?',
      successCriteria: ['Entailment is judged per claim', 'Offline tests use a scripted judge with fixed verdicts'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'One of five claims cites a source that was never provided. What should happen?',
      choices: [
        'Discard the whole answer',
        'Block that claim, show the other four, and list the reason',
        'Show it anyway',
        'Ask the user',
      ],
      correctIndex: 1,
      explanation: 'Per-claim verification keeps the verified content.',
    },
    {
      id: 'q2',
      prompt: 'The quote exists in the source, but the claim says 60 days and the quote says 30. What does the guard report?',
      choices: ['Nothing, the citation is real', 'UNGROUNDED_NUMBER', 'UNKNOWN_SOURCE', 'QUOTE_NOT_FOUND'],
      correctIndex: 1,
      explanation: 'A real quote does not make a wrong claim right.',
    },
    {
      id: 'q3',
      prompt: 'Why does each citation carry quoteStart and quoteEnd?',
      choices: [
        'For sorting',
        'So the reader can open the passage with the exact sentence highlighted',
        'To save tokens',
        'They are required by Mastra',
      ],
      correctIndex: 1,
      explanation: 'Inspectable sources are the point of citations.',
    },
    {
      id: 'q4',
      prompt: 'The sources do not answer the question. What is the right output?',
      choices: [
        'A best guess',
        'No claims, with an honest “cannot confirm” notice',
        'A claim citing the closest source',
        'An error',
      ],
      correctIndex: 1,
      explanation: 'The fallback flag tells the UI to say so.',
    },
  ],
  sourceFiles: [
    {
      path: 'claims.ts',
      title: 'Claim guard',
      description: 'Claims contract, quote locator and the per-claim verification rules.',
    },
    {
      path: 'run.ts',
      title: 'Lab run',
      description: 'Hybrid retrieval, the agent prompt and contract, scripted model and checks.',
    },
  ],
  exercise: {
    instructions:
      'In your project, have an agent answer with JSON claims citing source ids and verbatim quotes, verify each claim (source provided, quote present, supported, numbers grounded), and render the answer with citations that open the source with the quote highlighted.',
    solutionFile: 'solution.md',
  },
  checks: [
    {
      id: 'every-claim-cited',
      label: 'Every shown claim cites a source (or the answer honestly says it cannot confirm anything)',
    },
    { id: 'unmatched-citations-blocked', label: 'No claim with an unmatched citation was shown' },
    { id: 'sources-openable', label: 'Every citation opens its source passage at the quoted text' },
    { id: 'numbers-grounded', label: 'Every number in a shown claim appears in its cited quotes' },
    { id: 'expected-sources-cited', label: 'Each question cited the sources it should (and nothing for unanswerable ones)' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Claims, not answers', minutes: 1, talkingPoints: ['Several facts, several sources'] },
      { title: 'The claims contract', minutes: 1.5, talkingPoints: ['Source ids and verbatim quotes', 'One fact per claim'] },
      {
        title: 'Per-claim guard',
        minutes: 2,
        talkingPoints: ['Unknown source', 'Missing quote', 'Unsupported claim', 'Wrong numbers'],
      },
      { title: 'Opening sources', minutes: 1.5, talkingPoints: ['Quote offsets', 'Highlight as text, never HTML'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Honest fallback', 'Next: RAG evaluation'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 120_000,
    maxTimeoutMs: 180_000,
    budget: {},
    costNotice:
      'Offline is free (scripted model, mock embeddings). Live makes one model call per answerable question plus a few hundred embedding tokens: about a cent for the example.',
  },
  tags: ['rag', 'citations', 'grounding', 'guardrails', 'ui'],
} satisfies LabDefinitionInput;
