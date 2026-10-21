import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import { DEFAULT_POLICY } from './policy.js';

const request =
  'Refund ORD-3001 €30 and ORD-3002 €180, change the email of CUS-1042 to new.address@customer.example, and close account CUS-1042.';

export const lab64Definition = {
  id: 'lab-64',
  number: 64,
  title: 'Tool approval policies',
  moduleId: 'module-13',
  summary:
    'Write a role-based policy for write-capable tools, enforce it with Mastra’s approval hooks, require separated human confirmation, and keep a tamper-evident audit of every decision.',
  concept:
    'A tool approval policy says, as data that people can review, which role may call which tool, under which conditions, and who must confirm it. ' +
    'Here the policy is JSON you can edit: the first matching rule decides allow, confirm or deny, and anything no rule matches is denied, because a policy must fail closed. ' +
    'The policy runs on the server through Mastra’s native hooks: requireApproval sends every non-allowed call to the approval gate, beforeApproval rejects denied calls there so they never execute and no human ever sees them, and confirmed calls suspend the run until approveToolCall or declineToolCall. ' +
    'Because beforeApproval does not run again on resume, execute() evaluates the policy once more and only runs a confirmed call whose arguments match the approval exactly. ' +
    'Confirmation is explicit and separated: the approver must hold a role the rule names, and nobody can approve their own action. ' +
    'Every policy decision, approval and outcome is appended to an audit log in which each entry includes the hash of the one before it, so an edited, removed or reordered line is detected. ' +
    'The log masks personal data and persists in your own storage partition across runs. ' +
    'All side effects happen in a sandbox, so you can try any policy safely.',
  objectives: [
    'Express tool permissions as a validated, fail-closed policy',
    'Enforce allow, confirm and deny with Mastra’s requireApproval and beforeApproval hooks',
    'Apply separation of duties and bind each approval to the exact call it approves',
    'Keep and verify a tamper-evident audit of every decision',
  ],
  prerequisites: ['lab-63'],
  inputs: [
    {
      kind: 'textarea',
      name: 'request',
      label: 'Operator request',
      minLength: 3,
      maxLength: 500,
      rows: 3,
      default: request,
      required: true,
      help: 'Refund ORD-xxxx €N, change the email of CUS-xxxx to …, close account CUS-xxxx, look up CUS-xxxx.',
    },
    {
      kind: 'select',
      name: 'role',
      label: 'Operator role (from the session)',
      default: 'support-agent',
      options: [
        { value: 'viewer', label: 'viewer' },
        { value: 'support-agent', label: 'support-agent' },
        { value: 'supervisor', label: 'supervisor' },
      ],
    },
    {
      kind: 'select',
      name: 'approver',
      label: 'Who confirms',
      default: 'team-lead',
      options: [
        { value: 'team-lead', label: 'A team lead' },
        { value: 'manager', label: 'A manager' },
        { value: 'self', label: 'The operator themself' },
      ],
      help: 'Separation of duties: the operator can never approve their own action.',
    },
    {
      kind: 'select',
      name: 'userDecision',
      label: 'Approver decision',
      default: 'approve',
      options: [
        { value: 'approve', label: 'Approve (preset)' },
        { value: 'decline', label: 'Decline (preset)' },
        { value: 'ask', label: 'Ask me during the run' },
      ],
    },
    {
      kind: 'json',
      name: 'policy',
      label: 'Approval policy',
      maxBytes: 8_000,
      default: DEFAULT_POLICY,
      required: true,
      help: 'First matching rule wins. "default" must be "deny". Effects: allow, confirm (needs approverRoles), deny.',
    },
    {
      kind: 'boolean',
      name: 'resetAudit',
      label: 'Start a new audit log',
      default: false,
      help: 'Keeps the old log next to the new one. Use it after you tampered with the log on purpose.',
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
    request,
    role: 'support-agent',
    approver: 'team-lead',
    userDecision: 'approve',
    policy: DEFAULT_POLICY,
    resetAudit: false,
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'The €30 refund is allowed by small-refund. The €180 refund and the email change need confirmation and run after the team lead approves them. Closing the account matches no rule for a support agent and is denied by default without ever running. The audit chain verifies.',
    example: {
      role: 'support-agent',
      approver: 'team-lead',
      counters: { lookupAccount: 0, issueRefund: 2, changeEmail: 1, closeAccount: 0 },
      sideEffects: {
        refunds: [
          { orderId: 'ORD-3001', amountCents: 3000 },
          { orderId: 'ORD-3002', amountCents: 18000 },
        ],
        closed: [],
      },
      policyDefault: 'deny',
    },
  },
  guide: {
    procedure: [
      'Read the default policy. Predict the outcome of each of the four actions for a support agent.',
      'Run the example. Compare decisions[] (rule, effect, approval, outcome) with your prediction.',
      'Check counters: closeAccount stayed at 0, because the denied call never reached execute().',
      'Set “Who confirms” to “The operator themself” and rerun: both confirmations are refused without asking anyone.',
      'Switch the role to supervisor and the approver to manager: now the account can be closed, after confirmation.',
      'Edit the policy: change "default" to "allow" and run. The policy is rejected before anything happens.',
      'Choose “Ask me during the run” and approve or decline each action yourself; then read audit.thisRun.',
    ],
    prediction: 'What happens to a refund of €600 for a support agent with the default policy, and why?',
    hints: [
      { level: 1, text: 'Rules are checked in order. What happens when none of them matches?' },
      {
        level: 2,
        text: 'A denied call must stop before execute(); a confirmed call must not run until a separate, eligible person approved it.',
      },
      {
        level: 3,
        text: 'requireApproval returns true for confirm and deny; beforeApproval returns { proceed: false } for deny; execute() re-checks the policy and the approval bound to the toolCallId and argument hash.',
      },
    ],
    commonMistakes: [
      { mistake: 'Making allow the default “for now”.', fix: 'Fail closed: deny by default and add explicit rules.' },
      {
        mistake: 'Showing every gated call to a human, including ones policy forbids.',
        fix: 'Deny in beforeApproval so approvers only judge allowed-with-confirmation calls.',
      },
      {
        mistake: 'Approving a call and then executing whatever arguments arrive.',
        fix: 'Bind the approval to the call id and an argument hash, and check both in execute().',
      },
      {
        mistake: 'Writing audit entries that can be silently edited.',
        fix: 'Chain entries by hash and verify the chain; anchor it externally in production.',
      },
    ],
    challenge: {
      prompt:
        'Add a daily refund cap per operator to the policy (for example, €300 of refunds per day across runs) using the stored audit log, and a rule condition that uses it.',
      successCriteria: [
        'A refund that would exceed the cap is denied with a clear rule id',
        'The cap counts only executed refunds from the audit log',
        'Tampering with the log makes the run refuse to trust the total',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'A call matches no rule in the policy. What happens?',
      choices: ['It runs', 'It is denied by the default rule', 'A human is asked', 'The model decides'],
      correctIndex: 1,
      explanation: 'The policy fails closed: no matching rule means deny.',
    },
    {
      id: 'q2',
      prompt: 'Why are denied calls rejected in beforeApproval instead of being shown to an approver?',
      choices: [
        'Mastra requires it',
        'It is faster',
        'Approvers should only judge actions the policy could allow; showing forbidden ones invites mistakes',
        'Denied calls cannot be logged otherwise',
      ],
      correctIndex: 2,
      explanation: 'Policy decides what is possible; humans confirm within that space.',
    },
    {
      id: 'q3',
      prompt: 'Why does execute() evaluate the policy again?',
      choices: [
        'To double the audit entries',
        'beforeApproval does not run on resume, and state or arguments could change while the call waits',
        'Because requireApproval is optional',
        'It does not need to',
      ],
      correctIndex: 1,
      explanation: 'Enforce at the last moment before the side effect, and check the approval matches the exact call.',
    },
    {
      id: 'q4',
      prompt: 'What does the hash chain in the audit log give you?',
      choices: [
        'Encryption of the log',
        'Detection of edited, removed or reordered entries',
        'Protection against someone who rewrites the whole file',
        'Faster queries',
      ],
      correctIndex: 1,
      explanation:
        'It is tamper-evident. Rebuilding the whole chain is still possible, so production logs need an external anchor.',
    },
  ],
  sourceFiles: [
    { path: 'policy.ts', title: 'Policy schema and evaluation', description: 'Fail-closed rules and separation of duties.' },
    {
      path: 'tools.ts',
      title: 'Tools with Mastra approval hooks',
      description: 'requireApproval, beforeApproval and execute re-checks.',
    },
    { path: 'audit.ts', title: 'Hash-chained audit log', description: 'Append, mask and verify.' },
    {
      path: 'run.ts',
      title: 'Approval rounds and checks',
      description: 'Presets, ask mode, ineligible approvers and the decision table.',
    },
  ],
  exercise: {
    instructions:
      'Explain why the policy, not the approver, decides what is possible. Then implement the challenge in a local test.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'denied-never-invoked', label: 'Denied and declined actions were never invoked' },
    {
      id: 'confirmed-before-execute',
      label: 'Every action that needed confirmation ran only after an approval of the exact same call',
    },
    { id: 'separation-of-duties', label: 'No one approved their own action or a rule they are not allowed to approve' },
    { id: 'policy-fail-closed', label: 'Every call got a policy decision; calls matching no rule were denied' },
    { id: 'audit-complete', label: 'The audit log has a decision and an outcome for every tool call' },
    { id: 'audit-chain-intact', label: 'The stored audit log verifies: no entry was changed, removed or reordered' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Policies as data', minutes: 1, talkingPoints: ['Roles, tools, conditions', 'First match wins, deny by default'] },
      {
        title: 'Mastra approval hooks',
        minutes: 2,
        talkingPoints: ['requireApproval per call', 'beforeApproval rejects denied calls', 'Suspend and resume'],
      },
      {
        title: 'Separated confirmation',
        minutes: 1,
        talkingPoints: ['No self-approval', 'Approver roles per rule', 'Argument binding'],
      },
      { title: 'Audit you can verify', minutes: 2, talkingPoints: ['Hash chain', 'Masking', 'Tamper and detect'] },
      { title: 'Limits and next steps', minutes: 1, talkingPoints: ['External anchoring', 'Policy engines like OPA or Cedar'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 8, maxToolCalls: 8 },
    costNotice:
      'Offline is free. Live mode calls your configured model for one short agent run plus a resume per approval, usually a few cents or less. Side effects stay in a sandbox.',
  },
  tags: ['security', 'approval', 'policy', 'audit', 'tools'],
} satisfies LabDefinitionInput;
