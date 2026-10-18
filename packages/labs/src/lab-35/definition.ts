import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const cases = [
  {
    caseId: 'C-101',
    vendor: { name: 'Northwind Supplies', country: 'ES', registrationId: 'REG-1001' },
    requestedBy: 'ana',
    spendPerYear: 20_000,
    notes: 'Office supplies; contract renewal.',
    reviewAttempts: [],
    expectBranch: 'auto-approved',
  },
  {
    caseId: 'C-102',
    vendor: { name: 'Blue Harbor Logistics', country: 'QZ', registrationId: 'REG-2002' },
    requestedBy: 'leo',
    spendPerYear: 60_000,
    notes: 'Regional freight forwarding.',
    reviewAttempts: [
      { reviewer: 'leo', role: 'manager', decision: 'approve', rationale: 'I know this vendor well, please approve.' },
      { reviewer: 'maria', role: 'manager', decision: 'approve', rationale: 'References checked; logistics capacity confirmed by site visit.' },
    ],
    expectBranch: 'approved',
  },
  {
    caseId: 'C-103',
    vendor: { name: 'Atlas Components', country: 'DE', registrationId: 'REG-9999' },
    requestedBy: 'ana',
    spendPerYear: 150_000,
    notes: 'Recent lawsuit over late deliveries to another customer.',
    reviewAttempts: [
      { reviewer: 'maria', role: 'manager', decision: 'reject', rationale: 'Unregistered entity with active litigation.' },
      { reviewer: 'sofia', role: 'senior', decision: 'reject', rationale: 'Not in the registry and under active litigation; do not onboard.' },
    ],
    expectBranch: 'rejected',
  },
  {
    caseId: 'C-104',
    vendor: { name: 'Orion Export Group', country: 'NL', registrationId: 'REG-4004' },
    requestedBy: 'leo',
    spendPerYear: 5_000,
    notes: 'One-off shipment.',
    reviewAttempts: [],
    expectBranch: 'blocked',
  },
];

export const lab35Definition = {
  id: 'lab-35',
  number: 35,
  title: 'Business process capstone',
  moduleId: 'module-07',
  summary:
    'Build a vendor due-diligence process end to end: intake, parallel research, risk review, a routed decision with a controlled human review, and a report, with every branch traced and tested.',
  concept:
    'This capstone combines the workflow patterns of the module into one business process: onboarding a new vendor. ' +
    'Intake normalises the request; three research steps run in parallel against a company registry, a sanctions list and an adverse-media scan (simulated, fictional data); a risk review joins their findings into a deterministic score. ' +
    'A branch then routes the case: low risk is approved by policy, a sanctions match is blocked outright, and medium or high risk suspends for a human reviewer, persisted so the review can happen hours later or after a restart. ' +
    'The reviewer is subject to controls enforced inside the workflow, not in the UI: segregation of duties (the requester cannot approve their own case), authority (high risk needs a senior reviewer), and a documented rationale. ' +
    'A refused attempt does not end the case; the step suspends again, records the violation in the audit trail, and waits for a valid reviewer, up to three attempts. ' +
    'Finally a report step writes a typed record (findings, risk factors, decision, audit) and an agent adds a short summary for the file; the agent never decides anything. ' +
    'The routing and controls are pure rules, so every branch can be tested deterministically, and the trace shows exactly which path each case took.',
  objectives: [
    'Compose parallel research, a join, a branch and a suspend step in one process',
    'Enforce reviewer controls inside the workflow',
    'Keep an audit trail of refused and accepted decisions',
    'Test every branch and produce a traceable report',
  ],
  prerequisites: ['lab-34'],
  inputs: [
    {
      kind: 'json',
      name: 'cases',
      label: 'Cases (1–4): vendor, requestedBy, spendPerYear, notes, reviewAttempts (in order), expectBranch',
      maxBytes: 16_000,
      default: cases,
      required: true,
    },
    {
      kind: 'select',
      name: 'controls',
      label: 'Reviewer controls',
      options: [
        { value: 'enforced', label: 'Enforced (segregation of duties, authority, rationale)' },
        { value: 'disabled', label: 'Disabled (anti-pattern)' },
      ],
      default: 'enforced',
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
  exampleInput: { cases, controls: 'enforced', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'C-101 (low) is auto-approved. C-102 (medium): Leo’s self-approval is refused (SOD), then Maria approves. C-103 (high): Maria is refused (AUTHORITY), then Sofia rejects. C-104 matches the sanctions list and is blocked without review. Each case has a complete trace and report.',
    example: {
      controls: 'enforced',
      cases: [
        { caseId: 'C-101', branch: 'auto-approved', report: { level: 'low', score: 0 } },
        {
          caseId: 'C-102',
          branch: 'approved',
          report: { level: 'medium', score: 2, decision: { reviewer: 'maria', role: 'manager' } },
          audit: [
            { attempt: 1, reviewer: 'leo', accepted: false, violations: ['SOD'] },
            { attempt: 2, reviewer: 'maria', accepted: true, violations: [] },
          ],
        },
        {
          caseId: 'C-103',
          branch: 'rejected',
          report: { level: 'high', score: 5 },
          audit: [
            { attempt: 1, reviewer: 'maria', accepted: false, violations: ['AUTHORITY'] },
            { attempt: 2, reviewer: 'sofia', accepted: true, violations: [] },
          ],
        },
        { caseId: 'C-104', branch: 'blocked', report: { level: 'blocked' } },
      ],
    },
  },
  guide: {
    procedure: [
      'Open process.ts in the Source tab: follow intake → .parallel([...]) → riskReview → .branch([...]) → report, and read humanReview.',
      'Open rules.ts: find scoreRisk and checkControls.',
      'Run the example. In the timeline, compare the paths of the four cases; in the result, read each case’s audit.',
      'Switch Reviewer controls to Disabled and run: which decision is accepted now that should not be?',
      'Give C-103 only the manager’s attempt: what is the case’s branch, and why is nothing approved?',
      'Give C-102 three refused attempts: what happens after the third?',
      'Optional (costs money): run live; the agent only writes the report summaries.',
    ],
    prediction: 'Leo requested C-102 and then tries to approve it himself as a manager. What happens to the case?',
    hints: [
      { level: 1, text: 'The control check runs inside the workflow, on every resume.' },
      { level: 2, text: 'A refused attempt suspends the step again; it does not end the case.' },
      { level: 3, text: 'The attempt is refused with SOD, recorded in the audit, and the case waits; Maria’s approval is then accepted.' },
    ],
    commonMistakes: [
      { mistake: 'Enforcing reviewer rules only in the UI.', fix: 'Check them inside the workflow step that accepts the decision.' },
      { mistake: 'Ending the case when an attempt is invalid.', fix: 'Suspend again and record the violation; let a valid reviewer act.' },
      { mistake: 'Letting the agent decide the risk or the outcome.', fix: 'Keep routing as rules; use the agent for narrative only.' },
      { mistake: 'Testing only the happy path.', fix: 'Cover every branch and every control with fixtures.' },
    ],
    challenge: {
      prompt: 'Add an “escalate” decision: a manager reviewing a medium case can escalate it to a senior instead of deciding. How do the branch, the controls and the audit change?',
      successCriteria: ['Escalation re-suspends with a raised required role', 'The audit shows the escalation as its own entry'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Where must segregation of duties be enforced?',
      choices: ['In the browser form', 'Inside the workflow step that accepts the decision', 'In the report', 'In the agent prompt'],
      correctIndex: 1,
      explanation: 'Only the step that applies the decision can guarantee the rule for every caller.',
    },
    {
      id: 'q2',
      prompt: 'A manager tries to decide a high-risk case. What happens?',
      choices: ['The decision is accepted', 'It is refused with AUTHORITY and the case keeps waiting', 'The case is rejected', 'The run fails'],
      correctIndex: 1,
      explanation: 'High risk requires a senior reviewer.',
    },
    {
      id: 'q3',
      prompt: 'What does the step after .branch() receive in this Mastra version?',
      choices: ['Only the executed step’s output', 'A key for every branch step; the ones that did not run are undefined', 'An array', 'The branch predicate results'],
      correctIndex: 1,
      explanation: 'Verified here: pick the defined key.',
    },
    {
      id: 'q4',
      prompt: 'Why is the risk score a rule rather than a model judgment here?',
      choices: ['Models cannot count', 'Routing must be reproducible and testable for every branch', 'It is cheaper', 'Mastra requires it'],
      correctIndex: 1,
      explanation: 'The agent writes the narrative; rules decide the path.',
    },
  ],
  sourceFiles: [
    { path: 'process.ts', title: 'Due-diligence workflow', description: 'Intake, parallel research, risk review, branch with controlled review, report.' },
    { path: 'rules.ts', title: 'Rules', description: 'Simulated sources, risk scoring and reviewer controls (pure functions).' },
    { path: 'run.ts', title: 'Lab run', description: 'Start and review phases, audit trail, trace and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, build a process with parallel research, a routed decision and a suspended human review whose controls are checked inside the step, and write one fixture per branch and per control.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'correct-branch', label: 'Every case ended on its expected branch' },
    { id: 'reviewer-controls-enforced', label: 'No decision was accepted in breach of the reviewer controls' },
    { id: 'no-unreviewed-decision', label: 'Only low risk was approved without a reviewer; reviewed cases have exactly one accepted decision' },
    { id: 'trace-complete', label: 'Each case’s trace shows intake, research, risk review, its branch and the report, in order' },
    { id: 'report-complete', label: 'Every case has a report with findings, decision and a summary' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'The process', minutes: 1, talkingPoints: ['Vendor onboarding end to end'] },
      { title: 'Research and risk', minutes: 1.5, talkingPoints: ['Parallel sources', 'Deterministic score'] },
      { title: 'Routing', minutes: 1, talkingPoints: ['Exclusive branches', 'Undefined branch keys'] },
      { title: 'Reviewer controls', minutes: 2, talkingPoints: ['SOD, authority, rationale', 'Refuse and re-suspend', 'Audit trail'] },
      { title: 'Report and wrap-up', minutes: 1.5, talkingPoints: ['Trace per case', 'Every branch tested', 'Next module'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 180_000,
    budget: { maxSteps: 4 },
    costNotice: 'Offline is free. Live mode makes one model call per completed case (the report summary; four in the example). Research sources are simulated.',
  },
  tags: ['workflows', 'capstone', 'parallel', 'branch', 'human-in-the-loop', 'controls', 'audit'],
} satisfies LabDefinitionInput;
