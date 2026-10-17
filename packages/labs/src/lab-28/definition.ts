import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const text =
  'Hi, I was charged twice for order ORD-7781 and I need the duplicate refunded ASAP. This is the second time it happens!';

export const lab28Definition = {
  id: 'lab-28',
  number: 28,
  title: 'Parallel branches',
  moduleId: 'module-06',
  summary:
    'Run independent classification and summary steps at the same time with .parallel(), join them deterministically, and measure the real speed-up from Mastra’s step timestamps.',
  concept:
    'When two steps do not depend on each other, running them one after the other wastes time; a workflow can run them in parallel and join the results. ' +
    'In Mastra, .parallel([classify, summarize]) starts both steps with the same input, and the next step receives an object keyed by step id: { classify: …, summarize: … }. ' +
    'The join waits for every branch, so the merge always sees both outputs, and if one branch fails the workflow fails while the other branch’s result is still recorded. ' +
    'Branches can finish in any order, so the merge must not depend on which one is first: here it is a pure function that builds the same record from the same inputs every time. ' +
    'Mastra records when each step started and ended, which lets you measure parallelism instead of guessing: the span of the branches versus the sum of their durations is the real speed-up. ' +
    'Offline, each branch waits for a delay you choose; that is simulated latency and is labelled so, but the timings shown are still real measurements of the run. ' +
    'Live, both model calls run at the same time against the provider, and the numbers are whatever the provider took. ' +
    'Parallel branches should not share mutable state, so each branch here has its own agent.',
  objectives: [
    'Run independent steps with .parallel() and join them',
    'Write a merge that does not depend on completion order',
    'Measure parallelism from recorded step timestamps',
    'Recognise what a failing branch does to the workflow',
  ],
  prerequisites: ['lab-27'],
  inputs: [
    { kind: 'text', name: 'ticketId', label: 'Ticket id', minLength: 5, maxLength: 8, default: 'T-1042', required: true },
    { kind: 'textarea', name: 'text', label: 'Ticket text', minLength: 5, maxLength: 2000, default: text, required: true },
    {
      kind: 'number',
      name: 'classifyLatencyMs',
      label: 'Simulated latency: classify (ms, offline only)',
      min: 0,
      max: 3000,
      step: 50,
      default: 300,
      required: true,
    },
    {
      kind: 'number',
      name: 'summarizeLatencyMs',
      label: 'Simulated latency: summarize (ms, offline only)',
      min: 0,
      max: 3000,
      step: 50,
      default: 500,
      required: true,
    },
    {
      kind: 'select',
      name: 'failingBranch',
      label: 'Make a branch fail',
      options: [
        { value: 'none', label: 'No failure' },
        { value: 'summarize', label: 'summarize fails' },
      ],
      default: 'none',
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
    ticketId: 'T-1042',
    text,
    classifyLatencyMs: 300,
    summarizeLatencyMs: 500,
    failingBranch: 'none',
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'Both branches start together; classify finishes first. The merge builds the triage record (billing, high, billing-queue). The measured span (about 500 ms) is below the sum (about 800 ms); offline these delays are simulated.',
    example: {
      status: 'success',
      latencySource: 'simulated latency (scripted delay in offline mode)',
      completionOrder: ['classify', 'summarize'],
      mergeRan: true,
      merged: {
        ticketId: 'T-1042',
        category: 'billing',
        priority: 'high',
        summary: 'Customer reports: I was charged twice for order ORD-7781 and I need the duplicate refunded ASAP.',
        routedTo: 'billing-queue',
      },
      error: null,
    },
  },
  guide: {
    procedure: [
      'Open triage.ts in the Source tab: find .parallel([classify, summarize]) and the merge step’s input schema.',
      'Run the example. In the result, compare the branches’ start and end times, and the timing summary.',
      'Swap the latencies (classify 500, summarize 300) and run: does the completion order change? Does the merged record?',
      'Set both latencies to 0 and run: what does the measured speed-up look like now, and why?',
      'Make summarize fail: what status do the workflow, classify and merge get?',
      'Optional (costs money): run live; the two provider calls overlap for real.',
    ],
    prediction: 'With classify at 300 ms and summarize at 500 ms, roughly how long will the two branches take together?',
    hints: [
      { level: 1, text: 'Both branches start at the same moment.' },
      { level: 2, text: 'The join waits for the slowest branch.' },
      { level: 3, text: 'About 500 ms (the slower branch), not 800 ms; the measured speed-up is about ×1.6.' },
    ],
    commonMistakes: [
      {
        mistake: 'A merge that depends on which branch finished first.',
        fix: 'Merge from the keyed join object with a pure function.',
      },
      { mistake: 'Inventing a speed-up number for the UI.', fix: 'Derive it from recorded step timestamps.' },
      { mistake: 'Sharing one mutable object between branches.', fix: 'Give each branch its own inputs and resources.' },
      { mistake: 'Running dependent steps in parallel.', fix: 'Only parallelise steps that do not need each other’s output.' },
    ],
    challenge: {
      prompt:
        'Add a third branch “detectLanguage” and route non-English tickets to a different queue. How does the join input change, and does the speed-up grow?',
      successCriteria: ['The merge input has three keys', 'The span stays close to the slowest branch'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What does the step after .parallel([a, b]) receive?',
      choices: [
        'Only a’s output',
        'An object keyed by step id: { a: …, b: … }',
        'An array in completion order',
        'The workflow input',
      ],
      correctIndex: 1,
      explanation: 'The join is keyed by step id, independent of finishing order.',
    },
    {
      id: 'q2',
      prompt: 'One parallel branch throws. What happens?',
      choices: [
        'It is ignored',
        'The workflow fails; the other branch’s result is still recorded; the merge does not run',
        'The merge runs with null',
        'Mastra retries forever',
      ],
      correctIndex: 1,
      explanation: 'A failed branch fails the join.',
    },
    {
      id: 'q3',
      prompt: 'How should a lab show parallel speed honestly?',
      choices: [
        'A fixed “3× faster” label',
        'From the recorded start and end times of each branch',
        'From the model’s answer',
        'By averaging guesses',
      ],
      correctIndex: 1,
      explanation: 'Measured timestamps, labelled as simulated when delays are scripted.',
    },
    {
      id: 'q4',
      prompt: 'Why keep the merge a pure function?',
      choices: [
        'It is shorter',
        'So the result is the same whichever branch finishes first',
        'Mastra requires it',
        'To save tokens',
      ],
      correctIndex: 1,
      explanation: 'Deterministic output despite nondeterministic completion order.',
    },
  ],
  sourceFiles: [
    { path: 'triage.ts', title: 'Parallel workflow', description: 'Branch steps, keyed join, pure merge and routing table.' },
    { path: 'run.ts', title: 'Lab run', description: 'Measured timings from step records, completion order and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, run two independent steps with .parallel() and a merge step, then write a test that swaps their delays and asserts the merged output is identical while the recorded completion order changes.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'both-completed', label: 'Both branches completed' },
    { id: 'joined', label: 'The merge step ran once with both branch outputs' },
    { id: 'ran-in-parallel', label: 'The branches overlapped in time (measured from Mastra’s step timestamps)' },
    { id: 'measured-speedup', label: 'Running in parallel took less time than the branches one after the other' },
    { id: 'deterministic-merge', label: 'The merged record equals the pure merge of the branch outputs' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Independent work', minutes: 1, talkingPoints: ['Classify and summarize do not depend on each other'] },
      { title: '.parallel() and the join', minutes: 1.5, talkingPoints: ['Keyed join object', 'Merge waits for both'] },
      { title: 'Measuring, not guessing', minutes: 1.5, talkingPoints: ['Step timestamps', 'Simulated vs real latency'] },
      { title: 'Order and failure', minutes: 1, talkingPoints: ['Swap latencies', 'A failing branch'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Pure merges', 'Next: conditional branching'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 2 },
    costNotice: 'Offline is free (latencies are simulated). Live mode makes two model calls at the same time.',
  },
  tags: ['workflows', 'parallel', 'join', 'timing'],
} satisfies LabDefinitionInput;
