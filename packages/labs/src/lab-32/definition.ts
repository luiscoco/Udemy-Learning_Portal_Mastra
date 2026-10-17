import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const applicant = { applicationId: 'A-2048', name: 'Ana Ruiz', email: 'ana.ruiz@example.com', plan: 'personal' };
const documents = [
  { type: 'id-document', fileName: 'passport.pdf' },
  { type: 'proof-of-address', fileName: 'utility-bill-september.pdf' },
];

export const lab32Definition = {
  id: 'lab-32',
  number: 32,
  title: 'Suspend and resume',
  moduleId: 'module-07',
  summary:
    'Pause an onboarding workflow until the customer’s documents arrive, persist the checkpoint in libSQL, and resume it after a restart without creating the account, charging the fee or calling the model a second time.',
  concept:
    'Some workflows have to wait for the outside world: a customer uploading documents, a signature, a payment. Holding a process open for days is not an option, and a server may restart in between. ' +
    'In Mastra, a step that declares suspendSchema and resumeSchema can call suspend(payload). The run ends with status “suspended”, and when the workflow is registered on a Mastra instance with storage, a snapshot of the run (every completed step’s output, the suspended step and its payload) is saved. ' +
    'Later, possibly in a new process, mastra.getWorkflow(id).createRun({ runId }) and resume({ step, resumeData }) load that snapshot and continue: the suspended step runs again with resumeData (and its earlier suspendData), then the following steps. The steps before the checkpoint do not run again. ' +
    'Here those earlier steps have side effects (creating an account, charging a fee, a paid model call that drafts the request), and resuming must not repeat them. ' +
    'Mastra also guards the resume: invalid resume data is rejected and the run stays suspended, a run that is not suspended cannot be resumed, and of two simultaneous resumes only one wins. ' +
    'The common mistake is to fake a resume by starting the workflow again with the new data: everything before the checkpoint runs twice, and the original run stays suspended forever. ' +
    'This lab records every side effect in a ledger so you can count them instead of trusting the design.',
  objectives: [
    'Suspend a workflow step with a typed payload',
    'Persist workflow snapshots with storage on the Mastra instance',
    'Resume a run by id after a restart, from the checkpoint',
    'Prove that side effects before the checkpoint are not repeated',
  ],
  prerequisites: ['lab-31'],
  inputs: [
    {
      kind: 'select',
      name: 'action',
      label: 'Action',
      options: [
        { value: 'demo', label: 'Demo: start → restart → resume → resume again' },
        { value: 'start', label: 'Start only (returns a workflow run id)' },
        { value: 'inspect', label: 'Inspect a persisted run' },
        { value: 'resume', label: 'Resume a persisted run' },
      ],
      default: 'demo',
      required: true,
    },
    {
      kind: 'json',
      name: 'applicant',
      label: 'Applicant: applicationId, name, email, plan (personal | business)',
      maxBytes: 2_000,
      default: applicant,
      required: true,
      visibleWhen: { field: 'action', in: ['demo', 'start'] },
    },
    {
      kind: 'json',
      name: 'documents',
      label: 'Documents sent on resume: type (id-document | proof-of-address | company-registration), fileName',
      maxBytes: 4_000,
      default: documents,
      required: true,
      visibleWhen: { field: 'action', in: ['demo', 'resume'] },
    },
    {
      kind: 'text',
      name: 'workflowRunId',
      label: 'Workflow run id (from a start run)',
      maxLength: 36,
      default: '',
      required: false,
      visibleWhen: { field: 'action', in: ['inspect', 'resume'] },
    },
    {
      kind: 'select',
      name: 'checkpointStyle',
      label: 'How to continue',
      options: [
        { value: 'suspend', label: 'Resume the suspended run' },
        { value: 'rerun', label: 'Start again with the documents (anti-pattern)' },
      ],
      default: 'suspend',
      required: true,
      visibleWhen: { field: 'action', in: ['demo'] },
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
      visibleWhen: { field: 'action', in: ['demo', 'start'] },
    },
  ],
  exampleInput: { action: 'demo', applicant, documents, workflowRunId: '', checkpointStyle: 'suspend', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'The start phase runs createAccount, chargeFee and draftRequest, then suspends at awaitDocuments. After the restart, a fresh instance reads the snapshot as suspended. The resume runs only awaitDocuments and activate. Resuming again is rejected. The ledger has each side effect once.',
    example: {
      action: 'demo',
      checkpointStyle: 'suspend',
      restart: 'in-process (new Mastra instance and storage client on the same file)',
      phases: [
        {
          name: 'start',
          status: 'suspended',
          steps: ['createAccount', 'chargeFee', 'draftRequest', 'awaitDocuments'],
          suspendPayload: {
            required: ['id-document', 'proof-of-address'],
            message: 'Hello Ana Ruiz, to finish opening your account please upload: id-document, proof-of-address.',
            received: [],
          },
        },
        { name: 'inspect', status: 'suspended' },
        {
          name: 'resume',
          status: 'success',
          steps: ['awaitDocuments', 'activate'],
          activation: { accountId: 'ACC-2048', status: 'active', feeCharged: 25, documents: ['id-document', 'proof-of-address'] },
        },
        { name: 'duplicate-resume', status: 'rejected', error: { code: 'NOT_SUSPENDED', message: 'This workflow run was not suspended' } },
      ],
      sideEffectCounts: { 'account-created': 1, 'fee-charged': 1, 'request-drafted': 1, 'account-activated': 1 },
    },
  },
  guide: {
    procedure: [
      'Open onboarding.ts in the Source tab: find suspendSchema, resumeSchema, suspend(...) in awaitDocuments, and new Mastra({ workflows, storage }).',
      'Run the demo. In the timeline, compare the steps of the start phase with the steps of the resume phase.',
      'Check the ledger in the result: how many times did each side effect happen?',
      'Switch “How to continue” to “Start again with the documents” and run: what does the ledger show now?',
      'Real restart: choose Start only, copy the workflow run id, stop and start the API (npm run dev), then choose Resume with that id.',
      'Resume with only the id-document: what does the run do? Then resume again with the proof of address.',
      'Optional (costs money): run live; only the start phase calls the model.',
    ],
    prediction: 'When the run is resumed after the restart, which steps will execute?',
    hints: [
      { level: 1, text: 'The snapshot holds the output of every step that already completed.' },
      { level: 2, text: 'Resume re-enters the suspended step with resumeData.' },
      { level: 3, text: 'Only awaitDocuments and activate. createAccount, chargeFee and draftRequest are not repeated, and the ledger proves it.' },
    ],
    commonMistakes: [
      { mistake: '“Resuming” by starting a new run with the new data.', fix: 'Resume the suspended run by id; otherwise every earlier side effect repeats.' },
      { mistake: 'No storage on the Mastra instance.', fix: 'Without storage the snapshot lives in memory and a restart loses the run.' },
      { mistake: 'Putting side effects after suspend() in the same step.', fix: 'The suspended step runs again on resume; keep side effects in steps that run once, or make them idempotent.' },
      { mistake: 'Losing earlier input across several resumes.', fix: 'Carry what was received in the suspend payload; suspendData returns it on resume.' },
    ],
    challenge: {
      prompt: 'Make the run expire: if no documents arrive within seven days, cancel the account and refund the fee. Where does the deadline live, and what runs the expiry?',
      successCriteria: ['The deadline is part of the persisted state', 'A refund happens once even if the expiry job runs twice'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What makes a suspended run survive a restart?',
      choices: ['Keeping the process alive', 'Storage on the Mastra instance the workflow is registered on', 'A global variable', 'The browser'],
      correctIndex: 1,
      explanation: 'The snapshot is written to storage (libSQL here) and loaded on resume.',
    },
    {
      id: 'q2',
      prompt: 'Which steps run when a run suspended at step 4 of 5 is resumed?',
      choices: ['All five', 'Steps 4 and 5', 'Only step 5', 'Steps 1–3'],
      correctIndex: 1,
      explanation: 'The suspended step re-enters with resumeData, then the rest; earlier steps come from the snapshot.',
    },
    {
      id: 'q3',
      prompt: 'Two requests resume the same suspended run at the same moment. What happens?',
      choices: ['Both continue', 'One continues; the other is rejected as already resumed', 'Both fail', 'The run restarts'],
      correctIndex: 1,
      explanation: 'Verified on the installed version.',
    },
    {
      id: 'q4',
      prompt: 'Why is “start again with the new data” wrong?',
      choices: ['It is slower', 'Every side effect before the checkpoint runs again, and the old run stays suspended', 'Mastra forbids it', 'It costs nothing'],
      correctIndex: 1,
      explanation: 'The ledger shows the duplicate account, fee and model call.',
    },
  ],
  sourceFiles: [
    { path: 'onboarding.ts', title: 'Onboarding workflow', description: 'Steps with side effects, the suspend checkpoint, storage and the ledger.' },
    { path: 'run.ts', title: 'Lab run', description: 'Start, in-process restart, inspect, resume, duplicate resume and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, register a workflow with a suspend step on a Mastra instance with libSQL storage, start it in one process and resume it by run id in another, and assert that the steps before the checkpoint ran once.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'suspended-at-checkpoint', label: 'The workflow suspended at the documents checkpoint' },
    { id: 'snapshot-persisted', label: 'A fresh Mastra instance read the run back from storage as suspended' },
    { id: 'resumed-from-checkpoint', label: 'The run continued from the checkpoint (no earlier step ran again)' },
    { id: 'no-duplicate-side-effects', label: 'Every side effect happened at most once for this application' },
    { id: 'duplicate-resume-rejected', label: 'Resuming the completed run again was rejected' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Waiting for the world', minutes: 1, talkingPoints: ['Documents take days', 'Servers restart'] },
      { title: 'suspend() and snapshots', minutes: 1.5, talkingPoints: ['suspendSchema / resumeSchema', 'Storage on the Mastra instance'] },
      { title: 'Resume after a restart', minutes: 1.5, talkingPoints: ['createRun({ runId }) + resume', 'Only steps 4–5 run'] },
      { title: 'Counting side effects', minutes: 1.5, talkingPoints: ['Ledger', 'The rerun anti-pattern', 'Duplicate resume rejected'] },
      { title: 'Wrap-up', minutes: 1.5, talkingPoints: ['Real restart exercise', 'Next: human approval'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 2 },
    costNotice:
      'Offline is free. Live mode makes one model call when a run starts (draftRequest); resumes make none. The anti-pattern makes a second call. Runs and the ledger are stored locally under the data directory.',
  },
  tags: ['workflows', 'suspend', 'resume', 'persistence', 'libsql', 'idempotency'],
} satisfies LabDefinitionInput;
