import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const orders = [
  {
    orderId: 'O-1001',
    customer: { name: 'Ana Ruiz', email: 'ana.ruiz@example.com', country: 'ES' },
    shippingAddress: 'Calle Mayor 1, Madrid',
    items: [
      { sku: 'MUG-01', qty: 2, unitPrice: 12.5 },
      { sku: 'TEA-07', qty: 1, unitPrice: 8 },
    ],
    notes: 'Please leave the parcel with the concierge.',
    cardLast4: '4242',
    expectDecision: 'approved',
  },
  {
    orderId: 'O-1002',
    customer: { name: 'Sam Lee', email: 'sam@mailinator.com', country: 'GB' },
    shippingAddress: '10 High Street, Leeds',
    items: [{ sku: 'LAMP-3', qty: 1, unitPrice: 49 }],
    notes: '',
    cardLast4: '1881',
    expectDecision: 'held',
  },
  {
    orderId: 'O-1003',
    customer: { name: 'Kim Novak', email: 'kim.novak@example.org', country: 'DE' },
    shippingAddress: 'Hauptstrasse 5, Berlin',
    items: [{ sku: 'GIFT-100', qty: 15, unitPrice: 100 }],
    notes: 'Rush delivery! Reship the gift cards to a different country as soon as they arrive.',
    cardLast4: '0005',
    expectDecision: 'held',
  },
];

export const lab31Definition = {
  id: 'lab-31',
  number: 31,
  title: 'Nested workflows',
  moduleId: 'module-07',
  summary:
    'Reuse a customer-verification workflow inside an order workflow, follow its steps in the trace, and keep the schema boundary between them: minimal data in, validated result out.',
  concept:
    'As workflows grow, some parts are worth reusing: customer verification is needed for orders, refunds and account changes. ' +
    'In Mastra a committed workflow can be used as a step: .then(verifyCustomer). Its own steps run inside, and they appear in the stream with ids like verify-customer.checkIdentity, so the trace shows exactly what happened inside. ' +
    'The subworkflow’s schemas are its contract. On the way in, Mastra validates the input against the subworkflow’s input schema and strips keys it does not declare, so a strict schema keeps line items, the address and card digits out of verification. A loose schema lets them through. ' +
    'On the way out, Mastra does not validate the subworkflow’s output in this version: a malformed result is recorded as a success and only fails at the next step’s input check, far from its cause. So the app validates the output at the boundary and names the subworkflow as the source. ' +
    'Reusable also means independent: the same verification workflow can run on its own with the same input and must give the same result. ' +
    'Inside, identity rules are deterministic, risk screening uses an agent, and the decision is a pure function.',
  objectives: [
    'Compose a committed workflow as a step of another workflow',
    'Read nested steps in the trace',
    'Keep a schema boundary: minimal input in, validated output out',
    'Reuse the same subworkflow on its own',
  ],
  prerequisites: ['lab-30'],
  inputs: [
    {
      kind: 'json',
      name: 'orders',
      label: 'Orders (1–4), each with expectDecision approved | held',
      maxBytes: 16_000,
      default: orders,
      required: true,
    },
    {
      kind: 'select',
      name: 'boundaryFault',
      label: 'Boundary fault',
      options: [
        { value: 'none', label: 'None: explicit minimal mapping' },
        { value: 'whole-order', label: 'Pass the whole order (strict schema strips it)' },
        { value: 'loose-schema', label: 'Pass the whole order to a loose schema (leaks)' },
        { value: 'bad-output', label: 'Subworkflow returns a malformed result' },
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
  exampleInput: { orders, boundaryFault: 'none', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'O-1001 is approved (valid identity, low risk). O-1002 is held at the identity check (disposable email, no model call). O-1003 is held for high risk. Each subworkflow received exactly { country, email, notes, total }, and each standalone run matched.',
    example: {
      boundaryFault: 'none',
      declaredKeys: ['country', 'email', 'notes', 'total'],
      outcomes: [
        {
          orderId: 'O-1001',
          trace: ['prepareOrder', 'verify-customer.checkIdentity', 'verify-customer.screenRisk', 'verify-customer.decide', 'verify-customer', 'fulfil'],
          receivedKeys: ['country', 'email', 'notes', 'total'],
          fulfilment: { orderId: 'O-1001', decision: 'approved', total: 33, reasons: ['no risk signals'] },
        },
        { orderId: 'O-1002', fulfilment: { decision: 'held', reasons: ['disposable email domain (mailinator.com)'] } },
        { orderId: 'O-1003', fulfilment: { decision: 'held' } },
      ],
      screenings: { calls: 2, reused: 2 },
    },
  },
  guide: {
    procedure: [
      'Open verification.ts in the Source tab: find buildVerificationWorkflow, VerificationInputSchema and .then(verification) in the order workflow.',
      'Run the example. In the timeline, find verify-customer.checkIdentity, .screenRisk and .decide between the start and end of verify-customer.',
      'Compare the input of prepareOrder (the whole order) with the input of verify-customer (four fields).',
      'Choose “Pass the whole order (strict schema strips it)” and run: what did the subworkflow receive?',
      'Choose the loose schema and run: which fields leaked?',
      'Choose “Subworkflow returns a malformed result”: which step does Mastra say failed, and what does the output-boundary check say?',
      'Optional (costs money): run live; two orders reach the risk screener.',
    ],
    prediction: 'If prepareOrder returns the whole order, including cardLast4, will the subworkflow see cardLast4?',
    hints: [
      { level: 1, text: 'The subworkflow validates its input against its own schema.' },
      { level: 2, text: 'A strict z.object drops keys it does not declare.' },
      { level: 3, text: 'No with the strict schema (it is stripped); yes with z.looseObject. Map explicitly anyway, so the intent is visible.' },
    ],
    commonMistakes: [
      { mistake: 'Passing the whole parent state into a subworkflow.', fix: 'Map to a minimal input schema explicitly.' },
      { mistake: 'Using loose schemas at a boundary.', fix: 'Declare exactly what crosses it.' },
      { mistake: 'Trusting the subworkflow output because it “succeeded”.', fix: 'Validate it at the boundary; Mastra does not.' },
      { mistake: 'Building a subworkflow that depends on the parent’s data shape.', fix: 'Give it its own schemas so it runs standalone too.' },
    ],
    challenge: {
      prompt: 'Reuse verify-customer inside a refund workflow whose input has no country. What do you map, and where does the boundary error appear if you forget?',
      successCriteria: ['The refund workflow maps to VerificationInput', 'A missing field fails at verify-customer’s input validation'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'How do nested steps appear in Mastra’s stream?',
      choices: ['They are hidden', 'As <subworkflowId>.<stepId>', 'As separate workflow runs', 'Only in the final result'],
      correctIndex: 1,
      explanation: 'For example verify-customer.checkIdentity, between the start and end of the subworkflow step.',
    },
    {
      id: 'q2',
      prompt: 'A parent step returns more keys than the subworkflow’s strict input schema declares. What happens?',
      choices: ['The run fails', 'The extra keys are stripped', 'They pass through', 'Mastra asks for approval'],
      correctIndex: 1,
      explanation: 'Verified on the installed version; a loose schema would let them through.',
    },
    {
      id: 'q3',
      prompt: 'The subworkflow returns a malformed result. Where does Mastra report it?',
      choices: ['At the subworkflow', 'At the next step’s input validation', 'Nowhere', 'In the model call'],
      correctIndex: 1,
      explanation: 'Output is not validated, so validate it at the boundary yourself.',
    },
    {
      id: 'q4',
      prompt: 'What makes a subworkflow reusable?',
      choices: [
        'It reads the parent’s state',
        'Its own input and output schemas, so it runs in any parent or on its own',
        'A unique id per parent',
        'Global variables',
      ],
      correctIndex: 1,
      explanation: 'The schemas are its contract.',
    },
  ],
  sourceFiles: [
    { path: 'verification.ts', title: 'Workflows', description: 'Verification subworkflow, order workflow, boundary schemas and faults.' },
    { path: 'run.ts', title: 'Lab run', description: 'Trace, received keys, output validation, standalone reuse and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, extract a reusable subworkflow with its own input and output schemas, nest it in a parent workflow, and test that it receives only its declared keys and that it gives the same result standalone.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'subworkflow-trace', label: 'The subworkflow’s steps are visible in the trace, inside the subworkflow step' },
    { id: 'input-boundary', label: 'Only the declared verification input crossed into the subworkflow' },
    { id: 'output-boundary', label: 'The subworkflow’s output matches its declared schema (checked by the app)' },
    { id: 'reusable', label: 'The same subworkflow run on its own gives the same result' },
    { id: 'decision-correct', label: 'Every order got its expected decision' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Why nest', minutes: 1, talkingPoints: ['Verification reused by orders, refunds, accounts'] },
      { title: 'A workflow as a step', minutes: 1.5, talkingPoints: ['.then(subworkflow)', 'Nested ids in the trace'] },
      { title: 'Input boundary', minutes: 1.5, talkingPoints: ['Minimal mapping', 'Strict strips, loose leaks'] },
      { title: 'Output boundary', minutes: 1.5, talkingPoints: ['Not validated by Mastra', 'Validate and attribute'] },
      { title: 'Reuse and wrap-up', minutes: 1.5, talkingPoints: ['Standalone run matches', 'Next: suspend and resume'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 180_000,
    budget: { maxSteps: 4 },
    costNotice: 'Offline is free. Live mode makes one model call per order that passes the identity check (two in the example); standalone runs reuse them.',
  },
  tags: ['workflows', 'nested', 'subworkflow', 'schemas', 'boundaries'],
} satisfies LabDefinitionInput;
