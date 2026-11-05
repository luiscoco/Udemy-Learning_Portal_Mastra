import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab75Definition = {
  id: 'lab-75',
  number: 75,
  title: 'Enterprise AI Assistant capstone',
  moduleId: 'module-15',
  summary:
    'Coordinate research, review, tenant memory, RAG, MCP, approval, evaluation and tracing in a support assistant with safely simulated refunds.',
  concept:
    'An enterprise assistant connects several capabilities while keeping permission to act under server control. ' +
    'This capstone uses a typed Mastra workflow to research a support question, review its evidence, evaluate quality, request approval and record a simulated refund. ' +
    'The researcher searches a sample policy in your own document library and looks up your teaching case through a real authenticated MCP connection. ' +
    'A second agent reviews the draft, and a server guard verifies every citation against passages retrieved during this run. ' +
    'A deterministic Mastra scorer blocks action when the answer lacks verified evidence or the case is unavailable. ' +
    'Your conversation uses durable tenant-scoped Mastra memory, but old messages never count as fresh evidence. ' +
    'The refund gateway checks case ownership, the return window, the amount, quality and approval again before writing a receipt. ' +
    'Repeated requests cannot create a second refund for the same case, and real tracing plus streamed events show what actually happened. ' +
    'Customer cases and payments are always simulations, including in live mode, while the framework workflow, MCP, memory and observability are real.',
  objectives: [
    'Integrate two agents, memory, retrieval and MCP in a typed workflow',
    'Gate a simulated action on verified evidence, permissions and approval',
    'Inspect real workflow, tool and correlated trace evidence',
    'Prove tenant isolation, cancellation and idempotency with adversarial tests',
  ],
  prerequisites: ['lab-74'],
  inputs: [
    {
      kind: 'textarea',
      name: 'question',
      label: 'Support question',
      minLength: 5,
      maxLength: 500,
      rows: 3,
      default: 'How long do refunds take?',
      required: true,
    },
    {
      kind: 'text',
      name: 'threadId',
      label: 'Conversation thread',
      minLength: 3,
      maxLength: 41,
      default: 'enterprise-1',
      required: true,
      help: 'Lowercase letters, digits and dashes. Reuse this thread to inspect persisted memory.',
    },
    {
      kind: 'select',
      name: 'caseId',
      label: 'Support case',
      default: 'case-100',
      options: [
        { value: 'case-100', label: 'Owned case: unused item, delivered 10 days ago, 25000 cents' },
        { value: 'case-expired', label: 'Owned case: outside the 30-day return window' },
        { value: 'case-foreign', label: 'Unavailable case: another learner owns it' },
      ],
    },
    {
      kind: 'select',
      name: 'action',
      label: 'Requested action',
      default: 'refund',
      options: [
        { value: 'answer', label: 'Answer only' },
        { value: 'refund', label: 'Answer and simulate a refund' },
      ],
    },
    {
      kind: 'number',
      name: 'amountCents',
      label: 'Simulated refund amount (cents)',
      min: 1,
      max: 50000,
      step: 1,
      default: 12500,
      help: 'The owned case allows at most 25000 cents. No real payment is made.',
    },
    {
      kind: 'select',
      name: 'approver',
      label: 'Refund approval',
      default: 'approve',
      options: [
        { value: 'approve', label: 'Approve automatically (teaching fixture)' },
        { value: 'decline', label: 'Decline automatically (teaching fixture)' },
        { value: 'ask', label: 'Ask me in the Run tab' },
      ],
    },
    {
      kind: 'select',
      name: 'fault',
      label: 'Citation fault',
      default: 'none',
      options: [
        { value: 'none', label: 'No fault' },
        { value: 'bad-citation', label: 'Inject an invented citation after review' },
      ],
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model',
      default: 'openai/gpt-5-mini',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
    },
  ],
  exampleInput: {
    question: 'How long do refunds take?',
    threadId: 'enterprise-1',
    caseId: 'case-100',
    action: 'refund',
    amountCents: 12500,
    approver: 'approve',
    fault: 'none',
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'A verified policy answer, quality score 1, a simulated refund receipt (issued on the first run, already-issued on repeats), increasing memory counts and a correlated workflow trace.',
    example: {
      workflowStatus: 'success',
      quality: { score: 1, passed: true },
      action: { receipt: { caseId: 'case-100', amountCents: 12500 } },
      mcp: { closed: true, openSockets: 0 },
    },
  },
  guide: {
    procedure: [
      'Run the default offline example. Samples are seeded automatically, so no previous lab data is needed.',
      'Inspect the MCP case lookup and searchDocs tools, then open a citation to check the exact policy passage.',
      'Read the quality score and simulated receipt. Run again: the action becomes already-issued and the conversation message count increases.',
      'Choose Ask me in the Run tab, run, and approve or decline the pending simulated refund.',
      'Select the unavailable case, the expired case, or an amount above 25000 cents. Each must prevent a new refund.',
      'Inject an invented citation. The claim is blocked, the quality score becomes zero and no approval can authorize a refund.',
      'Inspect Trace spans: research and review must appear as agent calls inside the five-step workflow.',
      'For optional live mode, configure a provider on the server, read the cost notice and repeat with No fault. Payments remain simulated.',
    ],
    prediction:
      'Can an approving reviewer or an earlier good answer authorize a refund when the current run has no verified evidence?',
    hints: [
      { level: 1, text: 'Trace the request through research, review, evaluate, approve and execute.' },
      {
        level: 2,
        text: 'Approval is one condition. The action gateway also requires ownership, policy eligibility and fresh verified evidence.',
      },
      {
        level: 3,
        text: 'issueRefund repeats the checks and stores one receipt per case inside the tenant partition; a tenant lock serializes competing requests.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Letting the model choose its own permissions.',
        fix: 'Resolve the principal on the server and scope every case lookup and ledger to that tenant.',
      },
      {
        mistake: 'Treating an old thread citation as current evidence.',
        fix: 'Verify against a fresh retrieved-passages map for each run.',
      },
      {
        mistake: 'Counting a correctly denied unsafe request as a broken lab.',
        fix: 'Checks test the safety invariant; the quality result separately reports whether an answer passed.',
      },
      {
        mistake: 'Calling this demo a production payment integration.',
        fix: 'Cases and refunds are explicitly simulated; production approval durability and shared storage remain separate work.',
      },
    ],
    challenge: {
      prompt:
        'Add a second simulated case with a distinct return policy and prove that its receipt cannot be reused for the first case.',
      successCriteria: [
        'The policy is verified on the server',
        'Cases remain tenant-scoped',
        'Tests cover a valid request and a cross-case replay',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Who grants permission to execute a refund?',
      choices: ['The model', 'The server gateway after all controls pass', 'A retrieved document'],
      correctIndex: 1,
      explanation: 'Model text, citations and approval cannot replace the server permission check.',
    },
    {
      id: 'q2',
      prompt: 'What does live mode change here?',
      choices: [
        'It sends real payments',
        'It calls a real configured model; cases and refunds stay simulated',
        'It removes tool limits',
      ],
      correctIndex: 1,
      explanation: 'Only model generation changes; the same gateway and fixture cases remain.',
    },
    {
      id: 'q3',
      prompt: 'Why verify citations against this run rather than memory?',
      choices: ['Memory is always empty', 'Old evidence may be stale or unrelated to the present action', 'MCP forbids memory'],
      correctIndex: 1,
      explanation: 'Persistence supports conversation continuity, not authorization or fresh retrieval.',
    },
    {
      id: 'q4',
      prompt: 'What happens when the same approved refund is requested twice?',
      choices: ['Two payments', 'The existing receipt is returned with no new refund', 'The case owner changes'],
      correctIndex: 1,
      explanation: 'The tenant-local ledger enforces one simulated refund per case.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Integrated workflow and checks' },
    { path: 'policy.ts', title: 'Trusted permissions and simulated refund gateway' },
    { path: 'fixtures.ts', title: 'Offline safety scenarios' },
  ],
  exercise: {
    instructions: 'Run each safety scenario, explain its gate and implement the second-case challenge in your local project.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'integrated-workflow', label: 'Both agents ran inside the coordinated workflow' },
    { id: 'grounding-gate', label: 'Unsupported answers are withheld and cannot authorize a refund' },
    { id: 'safe-action', label: 'Only an eligible, approved request can create a simulated refund' },
    { id: 'permission-enforced', label: 'The case was looked up through MCP and foreign data stays unavailable' },
    { id: 'memory-persisted', label: 'The research conversation was persisted in your tenant thread' },
    { id: 'bounded-and-traced', label: 'Budgets, trace correlation and resource cleanup are verified' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      {
        title: 'Connect the course',
        minutes: 1,
        talkingPoints: ['Five workflow stages and two agents', 'Real framework execution and simulated business data'],
      },
      {
        title: 'Run and inspect',
        minutes: 2,
        talkingPoints: ['MCP case lookup and policy search', 'Exact citation, score, memory count and trace'],
      },
      {
        title: 'Approval and repeat',
        minutes: 1,
        talkingPoints: ['Ask for a human decision', 'Repeat returns the existing receipt'],
      },
      {
        title: 'Prove the boundaries',
        minutes: 2,
        talkingPoints: ['Foreign and expired cases', 'Invented citation blocks action', 'Cancel a pending approval'],
      },
      {
        title: 'Production discussion',
        minutes: 1,
        talkingPoints: [
          'Provider costs and bounded execution',
          'Single-process locks and in-memory approval limits',
          'Second-case challenge',
        ],
      },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90000,
    maxTimeoutMs: 180000,
    budget: { maxSteps: 7, maxToolCalls: 8, maxRetries: 0 },
    costNotice:
      'Offline is free. Live calls two agents with up to seven model steps and at most 2000 output tokens per step; provider charges apply and dollar cost is not capped. Cases and refunds are always simulated.',
  },
  tags: ['capstone', 'enterprise', 'workflow', 'rag', 'mcp', 'memory', 'approval', 'evaluation', 'tracing'],
} satisfies LabDefinitionInput;
