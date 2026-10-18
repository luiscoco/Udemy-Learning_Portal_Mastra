import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const task = 'Should our team adopt Mastra workflows for the customer onboarding pipeline?';

export const lab53Definition = {
  id: 'lab-53',
  number: 53,
  title: 'Supervisor pattern',
  moduleId: 'module-11',
  summary:
    'Build a supervisor agent that delegates research, planning and analysis to three worker agents with Mastra’s native sub-agents, enforce a delegation cap, a per-worker cap, a token budget and an iteration cap in the delegation hooks, and audit every decision.',
  concept:
    'A supervisor is an agent whose job is to split the work, hand each part to a specialised worker and combine the results. ' +
    'Mastra supports this natively: give an Agent an agents map, and each worker becomes a delegation tool for the supervisor model (agent-researcher, agent-planner, agent-analyst), with the prompt as its input. ' +
    'Unlike the handoff in lab 52, the supervisor stays in charge: it gets every result back and decides what to do next. ' +
    'That freedom needs limits. The delegation option of stream() lets you run code before and after every delegation: onDelegationStart can refuse it or cap the worker’s steps, and onDelegationComplete reports the worker’s token usage and can change the text the supervisor sees. ' +
    'This lab refuses a delegation that repeats an earlier one (a cycle), that would exceed the total or per-worker cap, or that starts after the token budget is spent, and tells the supervisor its remaining budget after each result. ' +
    'Mastra starts the delegations of one step before any of them finishes, so the budget is reserved when a delegation starts. ' +
    'The supervisor’s own loop is capped with maxSteps; if it hits the cap without answering, the run is reported as stopped with its partial results. ' +
    'Every decision, accepted or refused, is written to an audit with the reason and the budget at that moment, and a messageFilter keeps the supervisor’s conversation away from the workers.',
  objectives: [
    'Build a supervisor with Mastra’s native sub-agents',
    'Enforce delegation, per-worker and token budgets in the delegation hooks',
    'Stop repeated delegations and runaway supervisors',
    'Audit every agent decision with its reason and budget',
  ],
  prerequisites: ['lab-52'],
  inputs: [
    {
      kind: 'textarea',
      name: 'task',
      label: 'Task for the supervisor',
      minLength: 10,
      maxLength: 1000,
      rows: 2,
      default: task,
      required: true,
    },
    { kind: 'number', name: 'maxDelegations', label: 'Maximum delegations', min: 1, max: 8, step: 1, default: 4, required: true },
    {
      kind: 'number',
      name: 'perWorkerLimit',
      label: 'Maximum delegations per worker',
      min: 1,
      max: 3,
      step: 1,
      default: 1,
      required: true,
    },
    {
      kind: 'number',
      name: 'tokenBudget',
      label: 'Worker token budget',
      min: 10,
      max: 100000,
      step: 10,
      default: 20000,
      required: true,
    },
    {
      kind: 'number',
      name: 'maxIterations',
      label: 'Supervisor iteration cap (steps)',
      min: 2,
      max: 10,
      step: 1,
      default: 6,
      required: true,
    },
    {
      kind: 'select',
      name: 'fault',
      label: 'Supervisor fault',
      options: [
        { value: 'none', label: 'None' },
        { value: 'repeat-delegation', label: 'Repeat: resend the research task verbatim' },
        { value: 'runaway', label: 'Runaway: never answer, keep delegating' },
      ],
      default: 'none',
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
  exampleInput: {
    task,
    maxDelegations: 4,
    perWorkerLimit: 1,
    tokenBudget: 20000,
    maxIterations: 6,
    fault: 'none',
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'The supervisor delegates to the researcher, then the planner, then the analyst; each delegation is accepted and audited with its budget snapshot and token usage. The researcher calls search_sources. The final answer has three sections: Research, Plan and Analysis.',
    example: {
      audit: [
        {
          worker: 'researcher',
          decision: 'accepted',
          workerMaxSteps: 3,
          completion: { success: true, workerTools: ['search_sources'] },
        },
        { worker: 'planner', decision: 'accepted' },
        { worker: 'analyst', decision: 'accepted' },
      ],
      outcome: { status: 'finished' },
    },
  },
  guide: {
    procedure: [
      'Open run.ts in the Source tab and find the delegation option: messageFilter, onDelegationStart and onDelegationComplete.',
      'Run the example. In the conversation, follow each delegation: what does the guard report before it, and what does the result cost?',
      'Open budget.ts: in which order are the rules checked, and why is the slot reserved at start?',
      'Choose “Repeat” and run: which delegation is refused, and for what reason?',
      'Choose “Runaway” and run: which rules refuse the follow-ups, and what stops the supervisor?',
      'Set the worker token budget to 10 and run: which workers still run?',
    ],
    prediction: 'With “Runaway” and the default limits, how many delegations are accepted?',
    hints: [
      { level: 1, text: 'Each worker may run only once.' },
      { level: 2, text: 'The follow-ups go to workers that already ran.' },
      { level: 3, text: 'Three: every follow-up is refused by the per-worker cap, and the supervisor stops at its 6-step cap.' },
    ],
    commonMistakes: [
      {
        mistake: 'Counting delegations when they finish.',
        fix: 'Reserve the slot when the delegation starts; Mastra starts parallel delegations together.',
      },
      {
        mistake: 'Letting a throwing hook continue silently.',
        fix: 'Use hookErrorStrategy: "throw" so a broken guard fails closed.',
      },
      { mistake: 'Hiding a supervisor that never finished.', fix: 'Report it as stopped at the cap, with the partial results.' },
      {
        mistake: 'Passing the whole conversation to every worker.',
        fix: 'Filter it out with messageFilter and write a complete delegation prompt.',
      },
      {
        mistake: 'Not telling the supervisor about its budget.',
        fix: 'Append the remaining budget to each result with resultText.',
      },
    ],
    challenge: {
      prompt:
        'Add a cost budget in cents next to the token budget (use a price per 1,000 tokens per worker) and refuse delegations once it is spent.',
      successCriteria: [
        'A new refusal reason cost-budget',
        'The audit shows cents before and after',
        'A tight budget refuses the analyst',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'How does a Mastra supervisor call a worker defined in its agents map?',
      choices: ['Through memory', 'Through a delegation tool such as agent-researcher', 'With agent.network()', 'Over MCP'],
      correctIndex: 1,
      explanation: 'Each sub-agent becomes a tool whose input is the delegation prompt.',
    },
    {
      id: 'q2',
      prompt: 'What does the supervisor see when onDelegationStart refuses a delegation?',
      choices: ['An exception', 'A tool result starting with [Delegation Rejected]', 'Nothing', 'The worker’s last answer'],
      correctIndex: 1,
      explanation: 'The rejection reason comes back as an ordinary tool result.',
    },
    {
      id: 'q3',
      prompt: 'Why is the budget reserved when a delegation starts?',
      choices: [
        'It is faster',
        'Delegations in one step start before any of them completes',
        'Mastra requires it',
        'Usage is only known at start',
      ],
      correctIndex: 1,
      explanation: 'Counting at completion would let parallel delegations exceed the cap.',
    },
    {
      id: 'q4',
      prompt: 'What stops a supervisor that never gives a final answer?',
      choices: ['The token budget only', 'Its maxSteps iteration cap', 'The workers', 'Nothing'],
      correctIndex: 1,
      explanation: 'maxSteps ends the loop; the run is then reported as stopped.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Supervisor and hooks', description: 'Native sub-agents, delegation hooks, audit and checks.' },
    { path: 'budget.ts', title: 'Budget guard', description: 'Ledger and decideDelegation: duplicate, caps and token budget.' },
    {
      path: 'agents.ts',
      title: 'Workers and instructions',
      description: 'Research, planning and analysis workers; faults; offline scripts.',
    },
  ],
  exercise: {
    instructions:
      'In your project, give a supervisor Agent three workers through the agents option, refuse duplicate and over-budget delegations in onDelegationStart, record usage in onDelegationComplete, and cap the supervisor with maxSteps.',
    solutionFile: 'solution.md',
  },
  checks: [
    {
      id: 'decisions-audited',
      label: 'Every delegation decision is audited once, with its reason, budget snapshot and, when accepted, its usage',
    },
    { id: 'budget-respected', label: 'Delegations stay within the total cap, the per-worker cap and the token budget' },
    { id: 'cycle-limits', label: 'No delegation runs twice and the supervisor stays within its iteration cap' },
    { id: 'tasks-dispatched', label: 'Research, planning and analysis are dispatched in order, or refused for budget' },
    {
      id: 'final-answer',
      label: 'The supervisor answers, or the run is reported as stopped at the cap with its partial results',
    },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Supervisor vs handoff', minutes: 1, talkingPoints: ['The supervisor stays in charge', 'Native agents map'] },
      {
        title: 'Delegation hooks',
        minutes: 2,
        talkingPoints: ['onDelegationStart', 'onDelegationComplete and resultText', 'messageFilter'],
      },
      { title: 'Budgets', minutes: 1.5, talkingPoints: ['Total and per-worker caps', 'Token budget', 'Reserve at start'] },
      { title: 'Cycles and runaways', minutes: 1.5, talkingPoints: ['Duplicate detection', 'maxSteps', 'Stopped, not hidden'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['The audit as evidence', 'Next: coordinated agent workflows'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 240_000,
    maxTimeoutMs: 300_000,
    budget: { maxSteps: 10 },
    costNotice:
      'Offline is free (scripted models; token counts are simulated). Live makes up to the iteration cap of supervisor steps and up to Maximum delegations worker runs of at most 3 steps each on your provider key.',
  },
  tags: ['multi-agent', 'supervisor', 'sub-agents', 'budgets', 'audit'],
} satisfies LabDefinitionInput;
