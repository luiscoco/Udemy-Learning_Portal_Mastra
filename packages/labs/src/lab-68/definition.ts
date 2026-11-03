import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab68Definition = {
  id: 'lab-68',
  number: 68,
  title: 'Workflow visualizer',
  moduleId: 'module-14',
  summary:
    'Draw a Mastra workflow as a read-only graph from its own step graph, colour each node live from the run’s events, and hide workflows a learner may not see.',
  concept:
    'A workflow has a shape: steps in sequence, steps in parallel, branches, loops over items and nested workflows. ' +
    'Mastra keeps that shape in workflow.serializedStepGraph, so the visualizer reads it from the committed workflow instead of drawing a picture by hand that can drift from the code. ' +
    'The server turns the graph into layers and lanes and sends it as a workflow-graph event before the first step starts, so the browser can draw it immediately. ' +
    'While the run streams, every workflow-step event carries the step id Mastra reports, the same id as a node in the graph, so the node changes from waiting to running to done or failed as it really happens. ' +
    'A branch that is not taken never starts, so it is shown as skipped, and steps after a failure are shown as not reached rather than pretending to be pending. ' +
    'The graph is read-only: it shows the run and cannot change it. ' +
    'Visibility is checked on the server: a workflow your role may not see is not listed, and asking for it gets exactly the same answer as a workflow that does not exist, so its name and steps never leak. ' +
    'One step is a real model: the nested shipping workflow runs a Mastra agent as a native step, createStep(agent), to draft the customer email, and its tokens stream into Live output while its node is running. ' +
    'The other steps simulate business logic, so you can slow them down and make any of them fail; offline, a scripted model drafts the email.',
  objectives: [
    'Build a workflow graph from Mastra’s serialized step graph instead of by hand',
    'Map live workflow-step events onto graph nodes by step id',
    'Show skipped branches and unreached steps honestly',
    'Hide inaccessible workflows without revealing that they exist',
  ],
  prerequisites: ['lab-67'],
  inputs: [
    {
      kind: 'select',
      name: 'role',
      label: 'Your role',
      default: 'learner',
      options: [
        { value: 'learner', label: 'Learner' },
        { value: 'supervisor', label: 'Supervisor' },
      ],
    },
    {
      kind: 'text',
      name: 'workflowId',
      label: 'Workflow id',
      minLength: 1,
      maxLength: 60,
      default: 'order-fulfilment',
      required: true,
      help: 'The workflows your role may see are listed in the output. Try one you may not see.',
    },
    {
      kind: 'number',
      name: 'orderValue',
      label: 'Order value (€)',
      min: 0,
      max: 100_000,
      step: 10,
      default: 120,
      required: true,
      help: 'Above €500 a manager reviews the order.',
    },
    { kind: 'number', name: 'items', label: 'Items to pack', min: 1, max: 8, step: 1, default: 3, required: true },
    {
      kind: 'select',
      name: 'failStep',
      label: 'Make a step fail',
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'checkFraud', label: 'checkFraud' },
        { value: 'packItem', label: 'packItem' },
        { value: 'bookCourier', label: 'bookCourier (nested)' },
        { value: 'emailWriter', label: 'emailWriter (the model step)' },
      ],
    },
    {
      kind: 'number',
      name: 'stepDelayMs',
      label: 'Delay per step (ms)',
      min: 0,
      max: 2_000,
      step: 50,
      default: 150,
      required: true,
      help: 'Slow the run down to watch the graph change.',
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model for the email step',
      default: 'openai/gpt-5-mini',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      help: 'Used in live mode. Offline, a scripted model drafts the email.',
    },
  ],
  exampleInput: {
    role: 'learner',
    workflowId: 'order-fulfilment',
    orderValue: 120,
    items: 3,
    failStep: 'none',
    stepDelayMs: 150,
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'The graph has 13 nodes: validation, two parallel checks, a decision, two branch alternatives, item listing, packing per item, and the nested shipping workflow (header, bookCourier, prepareEmail, the emailWriter model step, notifyCustomer). autoApprove succeeds and managerReview is skipped; everything else succeeds, and the drafted email streams into Live output and mentions TRK-5521. Only order-fulfilment is listed for a learner.',
    example: {
      role: 'learner',
      visible: [{ id: 'order-fulfilment', title: 'Order fulfilment' }],
      found: true,
      workflowStatus: 'success',
      statuses: { autoApprove: 'success', managerReview: 'skipped', 'shipping.bookCourier': 'success' },
    },
  },
  guide: {
    procedure: [
      'Run the example and watch the graph: the parallel checks run together, then one branch, then packing per item, then the nested shipping workflow.',
      'Set the order value to 900 and rerun: now managerReview runs and autoApprove is skipped.',
      'Make checkFraud fail: it turns red, and everything after it shows as not reached.',
      'Set the workflow id to refund-override as a learner: the answer is the same as for “no-such-workflow”. Switch the role to supervisor and try again.',
      'Try payroll-export with both roles: nobody in this lab may see it.',
      'Switch to live mode: watch the emailWriter node run while the real model’s draft streams into Live output; then make emailWriter fail and see notifyCustomer not reached.',
      'Open workflow-graph.ts in Source and find how each serializedStepGraph entry type becomes nodes and edges.',
    ],
    prediction: 'If you drew the graph by hand in the UI, what would happen the day someone adds a step to the workflow?',
    hints: [
      { level: 1, text: 'The workflow already knows its own shape after commit().' },
      { level: 2, text: 'Give every node the exact id the run stream reports, including the prefix of nested steps.' },
      {
        level: 3,
        text: 'toWorkflowGraph walks serializedStepGraph: step → next layer; parallel/conditional → one layer, a lane per child; workflow → a header node and its serializedStepFlow with the prefix "<id>.". Statuses come from workflow-step events keyed by stepId.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Hard-coding the diagram in the frontend.',
        fix: 'Derive it from the committed workflow on the server and send it with the run.',
      },
      {
        mistake: 'Showing an untaken branch as “pending” forever.',
        fix: 'When the run ends, a branch alternative whose sibling ran is skipped.',
      },
      {
        mistake: 'Answering 403 for a hidden workflow.',
        fix: 'Answer exactly as for an unknown id, so its existence does not leak.',
      },
      {
        mistake: 'Shipping step code or condition source to the browser.',
        fix: 'Send ids, labels and descriptions only; Mastra’s serialized fn fields stay on the server.',
      },
    ],
    challenge: {
      prompt:
        'Show suspended steps from Lab 32 in the graph: emit workflow-graph there too, and give a suspended node its own colour and a “waiting for input” label.',
      successCriteria: [
        'The suspended node is distinct from running and failed',
        'Resuming turns it green',
        'No other workflow lab changes behaviour',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Where does the visualizer get the shape of the workflow?',
      choices: [
        'A diagram drawn in the UI',
        'Mastra’s serializedStepGraph of the committed workflow',
        'The step source code',
        'The browser’s cache',
      ],
      correctIndex: 1,
      explanation: 'The graph always matches the code because it is derived from it.',
    },
    {
      id: 'q2',
      prompt: 'How does a live event find its node?',
      choices: ['By position', 'By the step id Mastra reports, including nested prefixes', 'By label text', 'By timestamp'],
      correctIndex: 1,
      explanation: 'Nested steps are reported as "shipping.bookCourier", and the graph uses the same ids.',
    },
    {
      id: 'q3',
      prompt: 'What should a learner see when asking for a workflow their role may not see?',
      choices: [
        '403 Forbidden with its title',
        'The graph without statuses',
        'The same answer as for a workflow that does not exist',
        'An admin login',
      ],
      correctIndex: 2,
      explanation: 'Anything else reveals that the workflow exists.',
    },
    {
      id: 'q4',
      prompt: 'Which status does a branch alternative get when its sibling ran?',
      choices: ['Running', 'Skipped', 'Failed', 'Not reached'],
      correctIndex: 1,
      explanation: 'It was decided against, not left unfinished.',
    },
  ],
  sourceFiles: [
    {
      path: 'run.ts',
      title: 'Graph event, live statuses and visibility',
      description: 'Real statuses from Mastra; hidden = unknown.',
    },
    {
      path: 'workflows.ts',
      title: 'The workflows and who may see them',
      description: 'Sequence, parallel, branch, foreach, nested.',
    },
  ],
  exercise: {
    instructions: 'Explain why the graph must come from the server, then implement the challenge in Lab 32 locally.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'graph-complete', label: 'Every step that ran has a node in the graph, and node ids are unique' },
    { id: 'statuses-real', label: 'Every node shows the status Mastra reported for its step' },
    { id: 'branch-reflected', label: 'Exactly one branch ran; the other is shown as skipped' },
    { id: 'failure-reflected', label: 'A failing step shows as failed, and the steps after it as not reached' },
    { id: 'live-order', label: 'Each step was shown running before its result' },
    { id: 'agent-step-reflected', label: 'The model step shows its real status, and its streamed draft is what it produced' },
    { id: 'hidden-indistinguishable', label: 'Only the workflows your role may see are listed' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'A workflow has a shape', minutes: 1, talkingPoints: ['Sequence, parallel, branch, foreach, nested'] },
      { title: 'From serializedStepGraph to a DAG', minutes: 2, talkingPoints: ['Layers and lanes', 'Nested ids'] },
      { title: 'Live statuses', minutes: 1, talkingPoints: ['workflow-step events by id', 'Skipped and not reached'] },
      {
        title: 'Hidden workflows',
        minutes: 1,
        talkingPoints: ['Same answer as unknown', 'Nothing executable leaves the server'],
      },
      { title: 'Try it', minutes: 1, talkingPoints: ['Change the branch', 'Inject a failure'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 30_000,
    maxTimeoutMs: 60_000,
    budget: {},
    costNotice:
      'Offline is free. In live mode one step calls your configured model once to draft a short email, usually well under a cent; the emailWriter fault fails before the provider is called.',
  },
  tags: ['workflows', 'visualization', 'dag', 'authorization'],
} satisfies LabDefinitionInput;
