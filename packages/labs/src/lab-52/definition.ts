import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const message =
  'Hi, I am customer C-1042. I was charged twice for order ORD-7781 and my card 4111 1111 1111 1111 shows both charges. Please refund one.';

export const lab52Definition = {
  id: 'lab-52',
  number: 52,
  title: 'Agent handoffs',
  moduleId: 'module-11',
  summary:
    'Route a customer request from a triage agent to the right specialist through an orchestrator that accepts or refuses every handoff, gives each specialist only the fields it needs, and stops cycles and endless transfers.',
  concept:
    'In a handoff, one agent decides that another agent owns a request and passes it on. ' +
    'Here a triage agent reads the customer message and calls one transfer tool, transfer_to_billing, transfer_to_technical or transfer_to_account, whose arguments are the case record: customer id, order id, product, error code, account issue and a summary. ' +
    'A transfer tool does not run the next agent. It only queues a request, and the orchestrating workflow decides whether to accept it, so routing stays explicit and testable. ' +
    'Mastra can also expose sub-agents to a supervisor (the agents option) or route with agent.network(), but there the model chooses the route; this lab keeps the decision in code. ' +
    'The orchestrator keeps the full case record and builds each specialist’s packet by projection: billing gets customerId, orderId and summary, never the raw message, the card number or a password. ' +
    'Because the orchestrator holds the record, the context survives every hop: a misrouted specialist can transfer the case and the next one still gets the order id. ' +
    'Handoffs are bounded: a specialist may not hand back to triage, an agent that already handled the case may not get it again (cycle), the number of handoffs is capped, and a case without a customer id is refused. ' +
    'A refused handoff goes to a human with the reason instead of looping.',
  objectives: [
    'Implement a handoff as a transfer tool plus an orchestrator decision',
    'Pass the minimum required context with a per-target packet projection',
    'Keep context across hops without passing the conversation',
    'Stop cycles and endless routing with a handoff graph, cycle detection and a hop limit',
  ],
  prerequisites: ['lab-51'],
  inputs: [
    {
      kind: 'textarea',
      name: 'message',
      label: 'Customer message',
      minLength: 10,
      maxLength: 1000,
      rows: 3,
      default: message,
      required: true,
    },
    {
      kind: 'select',
      name: 'routingFault',
      label: 'Routing fault',
      options: [
        { value: 'none', label: 'None' },
        { value: 'misroute', label: 'Misroute: send the first handoff to the wrong specialist' },
        { value: 'ping-pong', label: 'Ping-pong: specialists never resolve, they always transfer' },
      ],
      default: 'none',
      required: true,
    },
    { kind: 'number', name: 'maxHops', label: 'Maximum handoffs', min: 1, max: 4, step: 1, default: 3, required: true },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model (live)',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: { message, routingFault: 'none', maxHops: 3, modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'Triage transfers to billing. The orchestrator accepts handoff 1/3 and gives billing a packet with only customerId, orderId and summary, with the card number redacted. Billing calls lookup_invoice for ORD-7781, finds two charges and answers that a refund for the duplicate was requested.',
    example: {
      triageChoice: 'billing',
      visited: ['billing'],
      packets: [
        {
          to: 'billing',
          packet: {
            customerId: 'C-1042',
            orderId: 'ORD-7781',
            summary:
              'I am customer C-1042. I was charged twice for order ORD-7781 and my card [card] shows both charges. Please refund one.',
          },
        },
      ],
      outcome: {
        status: 'resolved',
        resolver: 'billing',
        reply: 'Order ORD-7781 was charged 2 times (49.00 each). A refund of 49.00 for the duplicate charge has been requested.',
        escalation: null,
      },
    },
  },
  guide: {
    procedure: [
      'Open routing.ts in the Source tab and read PACKET_FIELDS, ALLOWED and decideHandoff().',
      'Run the example. Open the handoff message to billing in the conversation: which fields does billing see, and where did the card number go?',
      'Choose Misroute and run: who receives the case first, what does that specialist do, and does the order id reach billing?',
      'Choose Ping-pong and run: which handoff is refused, and why?',
      'Keep Ping-pong and set Maximum handoffs to 1: which guard stops the routing now?',
      'Remove the customer id from the message and run: what does the orchestrator do?',
    ],
    prediction: 'With Ping-pong and Maximum handoffs 3, how many handoffs are accepted before the case is escalated?',
    hints: [
      { level: 1, text: 'Triage → billing is the first handoff.' },
      { level: 2, text: 'Billing transfers to technical, and technical transfers back to billing.' },
      {
        level: 3,
        text: 'Two: the third handoff (technical → billing) is refused as a cycle because billing already handled the case.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Forwarding the whole conversation to the specialist.',
        fix: 'Project the case onto the fields that specialist needs.',
      },
      {
        mistake: 'Letting the transfer tool run the next agent directly.',
        fix: 'Queue the request and let the orchestrator decide.',
      },
      { mistake: 'Relying on the model to avoid loops.', fix: 'Detect cycles and cap the number of handoffs in code.' },
      {
        mistake: 'Letting specialists rewrite the case record.',
        fix: 'Specialists add a reason and a note; the orchestrator owns the record.',
      },
      { mistake: 'Dropping a refused case.', fix: 'Escalate it to a human with the refusal reason.' },
    ],
    challenge: {
      prompt:
        'Add a "sales" specialist that needs a new field, plan, and make triage extract it. Prove with a check that billing still never sees the plan.',
      successCriteria: ['PACKET_FIELDS has sales with plan', 'A sales message reaches sales', 'No billing packet contains plan'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What does transfer_to_billing do when triage calls it?',
      choices: ['Runs the billing agent', 'Queues a handoff request for the orchestrator', 'Sends an email', 'Ends the workflow'],
      correctIndex: 1,
      explanation: 'The orchestrator accepts or refuses the request; tools never run other agents.',
    },
    {
      id: 'q2',
      prompt: 'Which fields does the billing specialist receive?',
      choices: ['The whole message', 'customerId, orderId and summary', 'Every field triage extracted', 'Only the summary'],
      correctIndex: 1,
      explanation: 'Its packet is a projection of the case record onto PACKET_FIELDS.billing.',
    },
    {
      id: 'q3',
      prompt: 'Technical hands the case back to billing, who already handled it. What happens?',
      choices: [
        'Billing runs again',
        'The handoff is refused as a cycle and the case is escalated',
        'Triage reroutes it',
        'The workflow crashes',
      ],
      correctIndex: 1,
      explanation: 'Cycle detection refuses a handoff to an agent that already handled the case.',
    },
    {
      id: 'q4',
      prompt: 'How does the order id reach billing after a misroute to technical?',
      choices: [
        'Technical forwards it',
        'The orchestrator projects it from the case record it keeps',
        'Billing asks the customer',
        'It does not',
      ],
      correctIndex: 1,
      explanation: 'Specialists never carry context; the orchestrator rebuilds each packet.',
    },
  ],
  sourceFiles: [
    {
      path: 'routing.ts',
      title: 'Packets and the handoff guard',
      description: 'Case record, packet projection, redaction, graph, cycle and hop checks.',
    },
    {
      path: 'agents.ts',
      title: 'Triage and specialists',
      description: 'Transfer tools that queue requests, domain tools and instructions.',
    },
    { path: 'workflow.ts', title: 'Orchestrating workflow', description: 'triage → dountil(handle) → finish.' },
    { path: 'run.ts', title: 'Lab run', description: 'Agents, faults, transcript and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, give a triage agent transfer tools that only queue a request, let a workflow accept or refuse each handoff with a hop limit and cycle detection, and pass each specialist a packet with only the fields it needs.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'correct-target', label: 'The case reaches the correct specialist, or is escalated for the right reason' },
    {
      id: 'minimal-context',
      label: 'Each specialist receives only its packet fields: no raw message, card numbers or passwords',
    },
    { id: 'context-preserved', label: 'The required context survives every hop (customer id, and the resolver’s domain field)' },
    { id: 'routing-bounded', label: 'No agent handles the case twice and handoffs stay within the hop limit' },
    { id: 'resolved-with-tool', label: 'A resolving specialist looks the case up with the packet value' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      {
        title: 'What a handoff is',
        minutes: 1,
        talkingPoints: ['Triage and specialists', 'Native sub-agents and network() vs explicit routing'],
      },
      { title: 'Transfer tools', minutes: 1.5, talkingPoints: ['Queue, do not run', 'stopWhen after a transfer'] },
      {
        title: 'Minimum context',
        minutes: 1.5,
        talkingPoints: ['Packet projection', 'Redaction', 'The orchestrator keeps the record'],
      },
      { title: 'Bounded routing', minutes: 2, talkingPoints: ['Handoff graph', 'Cycle detection', 'Hop limit', 'Escalation'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Next: a supervisor with budgets'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 180_000,
    budget: { maxSteps: 3 },
    costNotice:
      'Offline is free (scripted models). Live makes one triage call and up to Maximum handoffs specialist turns of at most 3 model steps each on your provider key.',
  },
  tags: ['multi-agent', 'handoffs', 'routing', 'context', 'guardrails'],
} satisfies LabDefinitionInput;
