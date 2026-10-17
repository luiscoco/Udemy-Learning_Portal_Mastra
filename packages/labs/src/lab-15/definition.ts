import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const request = 'Please refund 45.00 on order ORD-1001, the mug arrived broken.';

export const lab15Definition = {
  id: 'lab-15',
  number: 15,
  title: 'Safe tool execution',
  moduleId: 'module-03',
  summary:
    'Gate a refund tool behind role permissions, native human approval and a policy check, and record every decision in an audit trail.',
  concept:
    'A tool that changes the world, such as issuing a refund, needs more protection than a read-only lookup, because the model decides when to call it and models can be wrong or manipulated. ' +
    'The first layer is least privilege: an agent should only receive the tools its user is allowed to use, so a viewer’s agent simply has no refund tool and any attempt to call one fails as an unknown tool. ' +
    'The second layer is human approval: in Mastra, a tool created with requireApproval: true makes the stream pause with a tool-call-approval chunk instead of running execute(). ' +
    'The application then resumes the same run with agent.approveToolCall({ runId, toolCallId }) or agent.declineToolCall({ runId, toolCallId, reason }), and only an approval lets execute() run. ' +
    'The third layer is a policy check inside execute(), such as a refund limit or a duplicate-refund rule, because approval is necessary but not sufficient: a tired human can approve a bad call. ' +
    'Every decision, whether blocked, approval requested, approved, declined, executed or denied by policy, is appended to an audit trail that is never edited. ' +
    'Here the side effect is a mock payments ledger, so you can prove that an approved refund changes it exactly once and that a declined or blocked one leaves it untouched. ' +
    'With "Ask me during the run" the server really pauses and the Run tab shows Approve and Decline buttons; the presets apply a fixed decision so automated tests stay repeatable.',
  objectives: [
    'Give each role only the tools it is allowed to use',
    'Pause a side-effect tool with requireApproval and resume it with approveToolCall or declineToolCall',
    'Enforce policy inside execute() even after approval',
    'Keep an append-only audit trail and prove a side effect ran exactly once',
  ],
  prerequisites: ['lab-14'],
  inputs: [
    {
      kind: 'text',
      name: 'request',
      label: 'Customer request',
      help: 'Orders: ORD-1001 (€45.00), ORD-1002 (€450.00), ORD-1003 (€18.00). Try “refund”, “look up” or “delete my account”.',
      minLength: 1,
      maxLength: 500,
      default: request,
      required: true,
    },
    {
      kind: 'select',
      name: 'role',
      label: 'Signed-in role',
      options: [
        { value: 'support-agent', label: 'support-agent (lookupOrder, issueRefund)' },
        { value: 'viewer', label: 'viewer (lookupOrder only)' },
      ],
      default: 'support-agent',
      required: true,
    },
    {
      kind: 'select',
      name: 'userDecision',
      label: 'Approver’s decision',
      help: 'Ask = the run pauses and you decide in an approval panel. Presets decide automatically (used by tests).',
      options: [
        { value: 'ask', label: 'Ask me during the run (interactive)' },
        { value: 'approve', label: 'Approve automatically (preset)' },
        { value: 'decline', label: 'Decline automatically (preset)' },
      ],
      default: 'approve',
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
  exampleInput: { request, role: 'support-agent', userDecision: 'approve', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'lookupOrder runs freely, issueRefund pauses for approval, the approval resumes the run, the ledger gets exactly one refund, and the audit trail records each step.',
    example: {
      role: 'support-agent',
      answer: 'Refund RF-0001 of €45.00 for ORD-1001 was issued.',
      approvals: [{ toolName: 'issueRefund', decision: 'approved' }],
      ledger: [{ refundId: 'RF-0001', orderId: 'ORD-1001', amountCents: 4500 }],
      refundExecutions: 1,
    },
  },
  guide: {
    procedure: [
      'Open policy.ts in the Source tab and find requireApproval, the role allowlist and the policy check.',
      'Run the example (preset Approve). In the timeline, find the suspended approval step between the tool start and the tool finish.',
      'Choose “Ask me during the run” and run again. When the approval panel appears, read the arguments and press Approve.',
      'Check the audit entries in the result: approval-requested, approved, executed.',
      'Run with Ask again and press Decline. The ledger should stay empty.',
      'Switch the role to viewer. The refund tool is not given to the agent, so the attempt is blocked.',
      'Ask for a refund of 450.00 on ORD-1002 with Approve: the policy denies it even though it was approved.',
      'Optional (costs money): run live and see whether a real model calls issueRefund.',
    ],
    prediction: 'If you approve a refund above the limit, will the ledger change?',
    hints: [
      { level: 1, text: 'Approval decides whether execute() runs. It does not decide what execute() allows.' },
      { level: 2, text: 'The limit is checked inside execute(), after the approval.' },
      {
        level: 3,
        text: 'No: execute() runs, the policy returns OVER_LIMIT, and the ledger is unchanged. The audit shows approved, then denied-by-policy.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Giving every agent every tool and relying on instructions to say “don’t”.',
        fix: 'Filter tools by role before creating the agent.',
      },
      {
        mistake: 'Treating approval as the only check.',
        fix: 'Re-check policy inside execute(); approval is necessary, not sufficient.',
      },
      {
        mistake: 'Resuming without the runId and toolCallId from the approval chunk.',
        fix: 'Store both and pass them to approveToolCall or declineToolCall.',
      },
      {
        mistake: 'Non-idempotent side effects that double-charge on a retry.',
        fix: 'Key the side effect, for example one refund per order.',
      },
      { mistake: 'Editing audit entries afterwards.', fix: 'Make the audit trail append-only.' },
    ],
    challenge: {
      prompt:
        'Make requireApproval a function so that refunds up to €20.00 run without approval and larger ones still pause. Which audit entries change?',
      successCriteria: [
        'A €18.00 refund on ORD-1003 executes with no approval-requested entry',
        'A €45.00 refund still pauses for approval',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What happens when a Mastra tool has requireApproval: true and the model calls it?',
      choices: [
        'execute() runs and the result is hidden',
        'The stream pauses with a tool-call-approval chunk until the app approves or declines',
        'Mastra asks the model to confirm',
        'The call is rejected',
      ],
      correctIndex: 1,
      explanation: 'The run suspends; approveToolCall or declineToolCall resumes it.',
    },
    {
      id: 'q2',
      prompt: 'A viewer must not issue refunds. What is the strongest protection?',
      choices: [
        'An instruction telling the model not to',
        'Not giving the refund tool to the viewer’s agent',
        'A higher temperature',
        'Hiding the button in the UI',
      ],
      correctIndex: 1,
      explanation: 'A tool the agent does not have cannot be executed, whatever the model asks for.',
    },
    {
      id: 'q3',
      prompt: 'Why check the refund limit inside execute() if a human already approved the call?',
      choices: [
        'Mastra requires it',
        'Approvers make mistakes, so policy is enforced where the side effect happens',
        'To make the tool faster',
        'It is not needed',
      ],
      correctIndex: 1,
      explanation: 'Defence in depth: the last check sits next to the side effect.',
    },
    {
      id: 'q4',
      prompt: 'What does declineToolCall do with the pending call?',
      choices: [
        'Runs it later',
        'Deletes the run',
        'Resumes the run without executing the tool and tells the model it was not approved',
        'Retries it with other arguments',
      ],
      correctIndex: 2,
      explanation: 'The stream resumes with tool-output-denied, and the model can explain the outcome.',
    },
  ],
  sourceFiles: [
    {
      path: 'policy.ts',
      title: 'Policy, tools and audit',
      description: 'Role allowlist, requireApproval, policy check, ledger and audit trail.',
    },
    {
      path: 'run.ts',
      title: 'Lab run',
      description: 'Agent registered on Mastra, approval loop with approveToolCall / declineToolCall.',
    },
  ],
  exercise: {
    instructions:
      'In your project, mark a side-effect tool with requireApproval: true, stream the agent, collect the tool-call-approval chunk, and resume with approveToolCall. Write a test that the side effect runs once on approve and zero times on decline.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'unauthorized-blocked', label: 'Tools outside the role allowlist were blocked and never ran' },
    { id: 'approval-gate', label: 'The side-effect tool only ran after a human approved it' },
    { id: 'side-effect-once', label: 'Each approved refund changed the ledger at most once' },
    { id: 'decline-respected', label: 'A declined call left the ledger untouched' },
    { id: 'audit-complete', label: 'Every gated or blocked call has an audit entry' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      {
        title: 'Why side effects are different',
        minutes: 1,
        talkingPoints: ['Models can be wrong or manipulated', 'Three layers'],
      },
      { title: 'Least privilege', minutes: 1, talkingPoints: ['Tools filtered by role', 'Viewer attempt is blocked'] },
      {
        title: 'Native approval',
        minutes: 2,
        talkingPoints: ['requireApproval', 'tool-call-approval chunk', 'approveToolCall / declineToolCall'],
      },
      { title: 'Policy inside execute()', minutes: 1.5, talkingPoints: ['Limit after approval', 'Idempotency'] },
      {
        title: 'Audit and wrap-up',
        minutes: 1.5,
        talkingPoints: ['Append-only trail', 'Next module: dynamic instructions and context'],
      },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 8, maxToolCalls: 6 },
    costNotice:
      'Offline is free. Live mode makes about three or four model calls with your provider key. The ledger is a mock and no money moves.',
  },
  tags: ['tools', 'safety', 'approval', 'audit'],
} satisfies LabDefinitionInput;
