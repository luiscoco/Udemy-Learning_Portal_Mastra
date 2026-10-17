import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const requests = [
  { refundId: 'R-1001', orderId: 'O-5521', customer: 'Ana Ruiz', amount: 49.9, reason: 'The mug arrived broken.', supervisorDecision: 'approve' },
  { refundId: 'R-1002', orderId: 'O-5530', customer: 'Sam Lee', amount: 900, reason: 'Changed my mind about the laptop.', supervisorDecision: 'reject' },
  { refundId: 'R-1003', orderId: 'O-5534', customer: 'Kim Novak', amount: 30, reason: 'The parcel never arrived.', supervisorDecision: 'none' },
];

const demoAndStart = { field: 'action', in: ['demo', 'start'] };
const demoAndDecide = { field: 'action', in: ['demo', 'decide'] };

export const lab33Definition = {
  id: 'lab-33',
  number: 33,
  title: 'Human approval',
  moduleId: 'module-07',
  summary:
    'Gate a simulated refund behind a supervisor’s decision that survives restarts: approve pays exactly once, reject and timeout never pay, and late or duplicate approvals change nothing.',
  concept:
    'Some actions must wait for a person: a refund, a contract, a production deploy. The approval can take hours, the server can restart meanwhile, and sometimes nobody answers at all. ' +
    'A workflow models this as a gate: the step before the payment calls suspend() with what the supervisor needs to see and a deadline, and the run is persisted, so nothing waits in memory. ' +
    'The supervisor’s decision arrives as resume data. The workflow itself checks the deadline from its own suspend payload, so an approval after the window closes counts as expired, and an expiry sweep closes requests nobody answered. ' +
    'Only an approved run reaches the payment step; reject and expiry end the run with no money moved, and a completed run cannot be resumed again, so duplicate or late approvals are rejected by Mastra. ' +
    'The approved path must be idempotent too. Payment providers sometimes record a refund and then lose the acknowledgement; Mastra retries the step (retries: 2), and without protection the retry pays a second time. ' +
    'An idempotency key that is unique per approval request makes the provider replay the first payment instead. ' +
    'Here an agent only summarises each request for the supervisor and never decides, and every payment is written to a ledger so the lab counts money instead of trusting the design.',
  objectives: [
    'Gate a side effect behind a persisted human decision',
    'Enforce an approval deadline inside the workflow',
    'Make reject, timeout, duplicate and late decisions pay nothing',
    'Make the approved payment idempotent under retries',
  ],
  prerequisites: ['lab-32'],
  inputs: [
    {
      kind: 'select',
      name: 'action',
      label: 'Action',
      options: [
        { value: 'demo', label: 'Demo: start → restart → decide → duplicate → sweep → late approval' },
        { value: 'start', label: 'Start only (returns workflow run ids)' },
        { value: 'decide', label: 'Decide a waiting refund' },
        { value: 'sweep', label: 'Expire overdue refunds (system clock)' },
      ],
      default: 'demo',
      required: true,
    },
    {
      kind: 'json',
      name: 'requests',
      label: 'Refund requests (1–4); supervisorDecision: approve | reject | none (nobody answers) | ask (you decide)',
      maxBytes: 6_000,
      default: requests,
      required: true,
      visibleWhen: demoAndStart,
    },
    { kind: 'number', name: 'ttlMinutes', label: 'Approval window (minutes)', min: 1, max: 1440, step: 1, default: 60, required: true, visibleWhen: demoAndStart },
    { kind: 'text', name: 'workflowRunId', label: 'Workflow run id (from a start run)', maxLength: 36, default: '', required: false, visibleWhen: { field: 'action', in: ['decide'] } },
    {
      kind: 'select',
      name: 'decision',
      label: 'Decision',
      options: [
        { value: 'approve', label: 'Approve' },
        { value: 'reject', label: 'Reject' },
      ],
      default: 'approve',
      required: true,
      visibleWhen: { field: 'action', in: ['decide'] },
    },
    { kind: 'text', name: 'supervisor', label: 'Supervisor name', minLength: 1, maxLength: 60, default: 'Maria (supervisor)', required: true, visibleWhen: demoAndDecide },
    {
      kind: 'number',
      name: 'ackFailures',
      label: 'Lost payment acknowledgements (forces Mastra retries)',
      min: 0,
      max: 2,
      step: 1,
      default: 1,
      required: true,
      visibleWhen: demoAndDecide,
    },
    {
      kind: 'select',
      name: 'idempotency',
      label: 'Payment idempotency',
      options: [
        { value: 'key', label: 'Idempotency key per approval request' },
        { value: 'none', label: 'No key (anti-pattern)' },
      ],
      default: 'key',
      required: true,
      visibleWhen: demoAndDecide,
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
      visibleWhen: demoAndStart,
    },
  ],
  exampleInput: {
    action: 'demo',
    requests,
    ttlMinutes: 60,
    workflowRunId: '',
    decision: 'approve',
    supervisor: 'Maria (supervisor)',
    ackFailures: 1,
    idempotency: 'key',
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'All three refunds wait at the gate with no payment and are listed from storage after the restart. R-1001 is approved: the first acknowledgement is lost, Mastra retries, the key replays the payment, and there is one payment. R-1002 is rejected and R-1003 expires in the sweep, neither paid. Approving R-1001 again and approving R-1003 late are both rejected.',
    example: {
      action: 'demo',
      idempotency: 'key',
      ackFailures: 1,
      requests: [
        { refundId: 'R-1001', status: 'refunded', payments: 1, final: { status: 'refunded', attempts: 2, replayed: true, decidedBy: 'Maria (supervisor)' } },
        { refundId: 'R-1002', status: 'rejected', payments: 0 },
        { refundId: 'R-1003', status: 'expired', payments: 0, decisionSource: 'nobody' },
      ],
      duplicateApproval: { refundId: 'R-1001', outcome: 'rejected-by-workflow', code: 'NOT_SUSPENDED', paymentsBefore: 1, paymentsAfter: 1 },
      lateApproval: { refundId: 'R-1003', outcome: 'rejected-by-workflow', code: 'NOT_SUSPENDED', paymentsBefore: 0, paymentsAfter: 0 },
      sweep: { checked: 1, expired: ['R-1003'] },
    },
  },
  guide: {
    procedure: [
      'Open refunds.ts in the Source tab: find the supervisorApproval gate (suspend with expiresAt), resolveDecision and the settle step with retries: 2.',
      'Run the demo. In the result, compare each request’s status and payment count, and the duplicateApproval and lateApproval entries.',
      'Look at R-1001’s outcome: attempts 2 and replayed true. What happened between the two attempts?',
      'Switch “Payment idempotency” to No key and run: how many payments does R-1001 get now?',
      'Set R-1003’s supervisorDecision to "ask" and run: approve it in the Run tab, then try declining it.',
      'Real restart: Start only, restart the API, then Decide with one of the run ids; later run Sweep.',
      'Optional (costs money): run live; only starting a request calls the model.',
    ],
    prediction: 'The provider records R-1001’s refund but the acknowledgement is lost, and Mastra retries settle. Without an idempotency key, how many payments will R-1001 get?',
    hints: [
      { level: 1, text: 'A retry runs the whole step again.' },
      { level: 2, text: 'The provider has no way to know the second call is the same refund.' },
      { level: 3, text: 'Two. With the key refund:<workflowRunId>, the provider replays the first payment and there is one.' },
    ],
    commonMistakes: [
      { mistake: 'Paying before the approval, “to be reversed if rejected”.', fix: 'Put the side effect after the gate; reject and expiry must move no money.' },
      { mistake: 'Checking the deadline only in the caller.', fix: 'Check it inside the workflow on every resume, from the suspend payload.' },
      { mistake: 'Retrying a payment without an idempotency key.', fix: 'Use a key unique per approval request, so the provider can replay.' },
      { mistake: 'Keeping the pending approval only in memory.', fix: 'Suspend the workflow with storage, so restarts and slow supervisors are fine.' },
    ],
    challenge: {
      prompt: 'Require two approvals for refunds above 500 (four-eyes rule), from two different supervisors. Where do you keep the first approval while waiting for the second?',
      successCriteria: ['The first approval is carried in the suspend payload', 'The same supervisor cannot approve twice'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'A supervisor approves after the approval window has closed. What should happen?',
      choices: ['The refund is paid', 'The workflow treats it as expired and pays nothing', 'The window is extended', 'The run fails'],
      correctIndex: 1,
      explanation: 'The workflow checks the deadline from its own suspend payload.',
    },
    {
      id: 'q2',
      prompt: 'Why can a retried payment step pay twice?',
      choices: ['Mastra runs steps twice', 'The provider recorded the first call but the acknowledgement was lost', 'The model approved twice', 'Storage is duplicated'],
      correctIndex: 1,
      explanation: 'Without an idempotency key the retry looks like a new refund.',
    },
    {
      id: 'q3',
      prompt: 'What does Mastra do when a completed refund run is approved again?',
      choices: ['Pays again', 'Rejects the resume: the run is not suspended', 'Restarts the run', 'Ignores the call silently'],
      correctIndex: 1,
      explanation: 'Verified: “This workflow run was not suspended”.',
    },
    {
      id: 'q4',
      prompt: 'What is a good idempotency key for this refund?',
      choices: ['The amount', 'A random value per attempt', 'One value per approval request, such as refund:<workflowRunId>', 'The customer name'],
      correctIndex: 2,
      explanation: 'Stable across retries of the same request, unique across requests.',
    },
  ],
  sourceFiles: [
    { path: 'refunds.ts', title: 'Refund workflow', description: 'Gate with deadline, settle with retries, payment provider with idempotency keys.' },
    { path: 'run.ts', title: 'Lab run', description: 'Demo sequence, simulated clock, sweep, duplicate and late approvals, and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, gate a side effect behind a suspended approval step with a deadline, retry the side effect with Mastra retries, and test that reject, expiry, duplicate approval and a lost acknowledgement each produce the right number of payments.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'approval-gated', label: 'Every refund stopped at the supervisor gate before any money moved' },
    { id: 'survives-restart', label: 'A fresh Mastra instance listed the waiting refunds from storage' },
    { id: 'approved-refunded-once', label: 'Each approved refund was paid exactly once (even after lost acknowledgements)' },
    { id: 'no-refund-on-reject-or-expiry', label: 'Rejected and expired refunds were never paid' },
    { id: 'expiry-enforced', label: 'Undecided refunds expired, and a late approval changed nothing' },
    { id: 'duplicate-approval-rejected', label: 'Approving a completed refund again was rejected and paid nothing' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Why a human gate', minutes: 1, talkingPoints: ['Refunds need a person', 'People are slow; servers restart'] },
      { title: 'The gate', minutes: 1.5, talkingPoints: ['suspend() with a deadline', 'Decision as resume data'] },
      { title: 'Reject, timeout, late', minutes: 1.5, talkingPoints: ['Expiry inside the workflow', 'Sweep', 'Late approval rejected'] },
      { title: 'Idempotent payment', minutes: 1.5, talkingPoints: ['Lost acknowledgement', 'retries: 2', 'Idempotency key'] },
      { title: 'Wrap-up', minutes: 1.5, talkingPoints: ['Ledger counts money', 'Next: long-running reliability'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 180_000,
    budget: { maxSteps: 4 },
    costNotice:
      'Offline is free. Live mode makes one model call per started refund request (the supervisor summary); decisions, sweeps and the simulated payments make none. Runs and the payment ledger are stored locally.',
  },
  tags: ['workflows', 'human-in-the-loop', 'approval', 'suspend', 'idempotency', 'retries'],
} satisfies LabDefinitionInput;
