import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const tickets = [
  { ticketId: 'T-101', text: 'The whole site is down for all customers since 9:00, checkout returns 503 errors.', expectRoute: 'page-oncall' },
  { ticketId: 'T-102', text: 'I am locked out of my account and cannot work.', severity: 3, expectRoute: 'priority-queue' },
  {
    ticketId: 'T-103',
    text: 'The PDF export shows an error, but downloading the CSV works as a workaround.',
    expectRoute: 'standard-queue',
  },
  { ticketId: 'T-104', text: 'Thanks for the newsletter!', severity: 0, expectRoute: 'manual-review' },
];

export const lab29Definition = {
  id: 'lab-29',
  number: 29,
  title: 'Conditional branching',
  moduleId: 'module-06',
  summary:
    'Route support tickets by severity with .branch(), keep the predicates mutually exclusive, and give tickets that match nothing an explicit manual-review path.',
  concept:
    'A workflow often has to choose what to do next: page the on-call engineer for an outage, queue a minor bug, or ask a human when nobody can tell. ' +
    'In Mastra, .branch([[predicate, step], …]) evaluates every predicate against the previous step’s output and runs each step whose predicate is true. ' +
    'That last part matters: Mastra does not stop at the first match. If two predicates are true, both branches run, and the next step receives an object keyed by every step that ran. ' +
    'If no predicate is true, nothing runs and the workflow still succeeds, with an empty result: the ticket silently goes nowhere. ' +
    'So routing correctness is your job. Keep the predicates in one table with explicit, non-overlapping ranges, and test that exactly one route matches each possible value. ' +
    'Add a fallback whose predicate is “no other route matched”, so it can never overlap, and a final step that turns zero or several branches into an explicit UNROUTED or AMBIGUOUS_ROUTE outcome. ' +
    'Here an agent rates each ticket 0–4 (0 means it cannot tell); tickets can also arrive pre-assessed, which skips the model.',
  objectives: [
    'Route a workflow with .branch() predicates',
    'Keep branch predicates mutually exclusive and test them over the whole input domain',
    'Give unmatched input an explicit fallback branch',
    'Detect zero or several executed branches instead of trusting them',
  ],
  prerequisites: ['lab-28'],
  inputs: [
    {
      kind: 'json',
      name: 'tickets',
      label: 'Tickets (1–8): ticketId, text, optional severity 0–4, expectRoute',
      maxBytes: 8_000,
      default: tickets,
      required: true,
    },
    {
      kind: 'select',
      name: 'predicateStyle',
      label: 'Predicates',
      options: [
        { value: 'exclusive', label: 'Exclusive ranges (min ≤ severity ≤ max)' },
        { value: 'overlapping', label: 'Overlapping thresholds (severity ≥ min) — anti-pattern' },
      ],
      default: 'exclusive',
      required: true,
    },
    { kind: 'boolean', name: 'fallback', label: 'Include the manual-review fallback branch', default: true, required: true },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: { tickets, predicateStyle: 'exclusive', fallback: true, modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'Each ticket runs exactly one branch: T-101 (severity 4) pages on-call, T-102 (3) goes to the priority queue, T-103 (2) to the standard queue, and T-104 (0, cannot assess) to manual review.',
    example: {
      predicateStyle: 'exclusive',
      fallback: true,
      outcomes: [
        { ticketId: 'T-101', severity: 4, branchesRun: ['page-oncall'], routing: { outcome: 'routed', route: 'page-oncall' } },
        { ticketId: 'T-102', severity: 3, branchesRun: ['priority-queue'], routing: { outcome: 'routed', route: 'priority-queue' } },
        { ticketId: 'T-103', severity: 2, branchesRun: ['standard-queue'], routing: { outcome: 'routed', route: 'standard-queue' } },
        { ticketId: 'T-104', severity: 0, branchesRun: ['manual-review'], routing: { outcome: 'routed', route: 'manual-review' } },
      ],
    },
  },
  guide: {
    procedure: [
      'Open routing.ts in the Source tab: find the ROUTES table, matches(), unmatched() and the .branch() call.',
      'Run the example. In the timeline, each ticket runs assess, one route step and finalize.',
      'Switch Predicates to “Overlapping thresholds” and run: how many branches run for T-101, and what does finalize report?',
      'Back to exclusive, untick the fallback and run: what happens to T-104?',
      'Add a ticket with severity 1 and expectRoute standard-queue; then one with a severity outside every range you can imagine adding later.',
      'Optional (costs money): run live; T-101 and T-103 are rated by the model, so watch whether its rating matches the expected route.',
    ],
    prediction: 'With overlapping thresholds (≥ 4, ≥ 3, ≥ 1), how many branches will run for a severity-4 ticket?',
    hints: [
      { level: 1, text: 'Mastra evaluates every predicate, not just until the first match.' },
      { level: 2, text: 'A severity of 4 is ≥ 4, ≥ 3 and ≥ 1.' },
      { level: 3, text: 'Three: page-oncall, priority-queue and standard-queue all run, and finalize reports AMBIGUOUS_ROUTE.' },
    ],
    commonMistakes: [
      { mistake: 'Assuming .branch() stops at the first true predicate.', fix: 'Every true predicate runs its step; make the ranges exclusive.' },
      { mistake: 'No fallback branch.', fix: 'Unmatched input succeeds with an empty result; add a “no other route matched” branch.' },
      { mistake: 'Writing the fallback predicate by hand (e.g. severity === 0).', fix: 'Derive it from the route table so it can never overlap or leave gaps.' },
      { mistake: 'Trusting the branch output shape.', fix: 'Count the keys after the branch and make zero or several an explicit outcome.' },
    ],
    challenge: {
      prompt: 'Add a “security” route for tickets that mention a breach, regardless of severity. How do you keep every ticket on exactly one route?',
      successCriteria: ['The exclusivity unit test still passes for every input', 'A breach ticket runs only the security branch'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Two predicates in .branch() are true. What does Mastra do?',
      choices: ['Runs the first one', 'Runs both; the next step receives both outputs keyed by step id', 'Throws an error', 'Runs neither'],
      correctIndex: 1,
      explanation: 'Every matching branch runs (verified on the installed version).',
    },
    {
      id: 'q2',
      prompt: 'No predicate is true. What is the workflow status?',
      choices: ['failed', 'suspended', 'success, with an empty result', 'It waits forever'],
      correctIndex: 2,
      explanation: 'Nothing runs and the workflow succeeds silently, so unmatched input must be handled explicitly.',
    },
    {
      id: 'q3',
      prompt: 'How should the fallback predicate be written?',
      choices: [
        'As “severity === 0”',
        'As “no route in the table matched”',
        'As “always true”',
        'It is not needed',
      ],
      correctIndex: 1,
      explanation: 'Derived from the table, it covers every gap and never overlaps.',
    },
    {
      id: 'q4',
      prompt: 'How do you prove the predicates are mutually exclusive?',
      choices: ['Read them carefully', 'A unit test that counts matching routes for every possible severity', 'Run one example', 'Ask the model'],
      correctIndex: 1,
      explanation: 'The severity domain is small (0–4), so test all of it.',
    },
  ],
  sourceFiles: [
    { path: 'routing.ts', title: 'Branching workflow', description: 'Route table, predicates, fallback, branch steps and finalize.' },
    { path: 'run.ts', title: 'Lab run', description: 'Batch execution, branches read from step records, and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, route an input with .branch() from a table of exclusive ranges plus a derived fallback, and write a unit test that asserts exactly one route matches every possible value.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'correct-branch', label: 'Every ticket followed its expected branch' },
    { id: 'exactly-one-branch', label: 'Exactly one branch ran for every ticket (predicates are mutually exclusive)' },
    { id: 'unmatched-handled', label: 'Tickets that match no severity route went to manual review, not nowhere' },
    { id: 'explicit-outcome', label: 'Every ticket ended with an explicit routing outcome' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Choosing a path', minutes: 1, talkingPoints: ['Severity decides the queue'] },
      { title: '.branch() semantics', minutes: 1.5, talkingPoints: ['Every true predicate runs', 'Keyed output', 'No match = empty success'] },
      { title: 'Exclusive ranges', minutes: 1.5, talkingPoints: ['One route table', 'Test the whole domain', 'Overlap demo'] },
      { title: 'The fallback', minutes: 1, talkingPoints: ['Derived predicate', 'UNROUTED demo'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Explicit outcomes', 'Next: foreach processing'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 8 },
    costNotice: 'Offline is free. Live mode makes one model call per ticket without a pre-assessed severity (two in the example).',
  },
  tags: ['workflows', 'branch', 'routing', 'predicates'],
} satisfies LabDefinitionInput;
