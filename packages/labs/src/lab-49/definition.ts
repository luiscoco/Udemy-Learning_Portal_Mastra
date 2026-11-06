import { liveCheckpointDefinition } from '../shared/live-checkpoint-definition.js';
import type { LabDefinitionInput } from '@mlp/contracts';

const expose = ['calculate_order_total', 'inventory_lookup', 'format_currency'];

export const lab49Definition = liveCheckpointDefinition({
  id: 'lab-49',
  number: 49,
  title: 'Expose Mastra over MCP',
  moduleId: 'module-10',
  summary:
    'Publish a narrow, read-only selection of Mastra tools from earlier labs as an MCP server façade with a bearer token, input and output limits and an audit trail, and prove that an external MCP client can discover and call only what is published.',
  concept:
    'Mastra’s MCPServer turns Mastra tools, agents and workflows into an MCP server that any MCP client can use, not just Mastra. ' +
    'Publishing a tool is a security decision: whoever reaches the server can call it, so the safest server exposes a small, deliberate selection instead of everything you have. ' +
    'This lab classifies five real tools from earlier labs by risk: three are read-only calculations or catalog lookups, one returns a customer’s personal data and one moves money. ' +
    'Only tools that are both on your allowlist and read-only are published; the others are refused with a reason and are never registered, so the server cannot run them even if a client asks. ' +
    'Each published tool is a thin wrapper that keeps the original schemas and adds MCP annotations, a timeout, a result size cap and an audit entry that records sizes, not values. ' +
    'The server listens on loopback only, requires a bearer token generated for this run and rejects oversized requests and foreign Host headers. ' +
    'To prove interoperability, the external client is the official MCP TypeScript SDK, not Mastra: it is rejected without the token, then discovers and calls the published tools with it.',
  objectives: [
    'Expose selected Mastra tools with MCPServer',
    'Classify tools by risk and publish only allowlisted, read-only ones',
    'Protect the server with a bearer token, limits and an audit trail',
    'Verify with an external MCP client that only published tools can be discovered and called',
  ],
  prerequisites: ['lab-48'],
  inputs: [
    { kind: 'json', name: 'expose', label: 'Allowlist: tools to publish', maxBytes: 1_000, default: expose, required: true },
    {
      kind: 'text',
      name: 'toolName',
      label: 'Tool the external client calls',
      minLength: 1,
      maxLength: 64,
      default: 'format_currency',
      placeholder: 'format_currency',
      required: true,
    },
    {
      kind: 'json',
      name: 'args',
      label: 'Arguments (JSON object)',
      maxBytes: 2_000,
      default: { amountCents: 1999, currency: 'EUR' },
      required: true,
    },
  ],
  exampleInput: { expose, toolName: 'format_currency', args: { amountCents: 1999, currency: 'EUR' } },
  expectedOutput: {
    description:
      'calculate_order_total, inventory_lookup and format_currency are published; lookup_order (personal data) and issue_refund (side effect) are refused. A client without the token is rejected with HTTP 401. The external MCP SDK client discovers exactly the three published tools and format_currency returns €18.39; the audit has one successful entry and the refund tool never executed.',
    example: {
      facade: {
        exposed: [
          { id: 'calculate_order_total', source: 'lab-11', risk: 'read-only' },
          { id: 'inventory_lookup', source: 'lab-13', risk: 'read-only' },
          { id: 'format_currency', source: 'lab-13', risk: 'read-only' },
        ],
        unknownIds: [],
      },
      external: { protocolVersion: '2026-07-28', unauthenticated: { rejected: true, httpStatus: 401 } },
      mcpCatalog: {
        call: {
          toolName: 'format_currency',
          status: 'success',
          result: { currency: 'EUR', rate: 0.92, amount: 18.39, formatted: '€18.39' },
        },
      },
      refundExecutions: 0,
      teardown: { externalClientClosed: true, facadeClosed: true, openSockets: 0 },
    },
  },
  guide: {
    procedure: [
      'Open registry.ts and facade.ts in the Source tab: find the risk classes, planExposure() and wrapTool().',
      'Run the example. Read facade.exposed, facade.refused and the guards, then the tools the external client discovered in “MCP tools”.',
      'Look at external.unauthenticated: what happened to the client without a token?',
      'Set the tool to issue_refund with { "orderId": "ORD-1001", "amountCents": 100, "reason": "test" }: what does the server answer, and what are audit and refundExecutions?',
      'Add "issue_refund" to the allowlist and run again: is it published now?',
      'Remove format_currency from the allowlist and call it: what changes?',
      'Call calculate_order_total with { "items": [{ "name": "Mug", "unitPriceCents": 1250, "quantity": 2 }], "taxRatePct": 10 }, then call format_currency with { "amountCents": -5, "currency": "EUR" }.',
    ],
    prediction: 'If you add issue_refund to the allowlist, can the external client call it?',
    hints: [
      { level: 1, text: 'The allowlist is one of two conditions.' },
      { level: 2, text: 'Look at the risk class of issue_refund in registry.ts.' },
      {
        level: 3,
        text: 'No: it is a side effect, so the façade refuses it and never registers it; the server answers “Unknown tool”.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Publishing every tool the app has.',
        fix: 'Start from an empty server and add only what outside clients need.',
      },
      {
        mistake: 'Relying on annotations to protect a dangerous tool.',
        fix: 'Annotations are hints for clients; the safe choice is not to register the tool at all.',
      },
      {
        mistake: 'Serving MCP without authentication.',
        fix: 'Require a credential (here a bearer token; in production OAuth) before startHTTP handles the request.',
      },
      {
        mistake: 'Logging tool arguments in the audit.',
        fix: 'Arguments can hold personal data; record sizes, status and timing instead.',
      },
      {
        mistake: 'Testing only with your own client library.',
        fix: 'Verify with an independent MCP client, as this lab does with the SDK.',
      },
    ],
    challenge: {
      prompt:
        'Add a per-token call budget (for example 5 calls per run): the façade answers further calls with a clear error, the audit records them as rejected, and a test proves the sixth call never reaches the tool.',
      successCriteria: ['Calls 1–5 succeed', 'Call 6 is refused before execute runs', 'The audit shows the refusal'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Which tools does the façade publish?',
      choices: [
        'Every tool in the registry',
        'Allowlisted tools only',
        'Allowlisted tools that are read-only',
        'Tools with annotations',
      ],
      correctIndex: 2,
      explanation: 'Both conditions must hold; personal-data and side-effect tools are always refused.',
    },
    {
      id: 'q2',
      prompt: 'The external client calls a tool that is not published. What happens?',
      choices: [
        'The server runs it with a warning',
        'The server answers “Unknown tool” and nothing runs',
        'The client crashes',
        'The tool is published on demand',
      ],
      correctIndex: 1,
      explanation: 'An unregistered tool cannot be executed by the server.',
    },
    {
      id: 'q3',
      prompt: 'Why is the external client the MCP SDK and not Mastra?',
      choices: ['Mastra cannot connect', 'To prove any MCP client can use the server', 'It is faster', 'It skips authentication'],
      correctIndex: 1,
      explanation: 'An independent client tests interoperability, not just your own library.',
    },
    {
      id: 'q4',
      prompt: 'What does the façade audit record for each call?',
      choices: ['The full arguments', 'Tool, status, duration and argument size', 'The bearer token', 'Nothing'],
      correctIndex: 1,
      explanation: 'Values can hold personal data; sizes and timing are enough to investigate.',
    },
  ],
  sourceFiles: [
    {
      path: 'registry.ts',
      title: 'Tool registry',
      description: 'The five candidate tools from labs 11, 13 and 15 with their risk class.',
    },
    {
      path: 'facade.ts',
      title: 'MCP façade',
      description: 'planExposure, wrapTool and the loopback MCPServer with token, limits and audit.',
    },
    {
      path: 'external.ts',
      title: 'External client',
      description: 'The MCP SDK client: no-token attempt, discovery and the call.',
    },
    { path: 'run.ts', title: 'Lab run', description: 'Events, output and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, publish two read-only Mastra tools with MCPServer behind a bearer token on 127.0.0.1, then use an MCP client that is not Mastra to list and call them, and show that a client without the token is rejected.',
    solutionFile: 'solution.md',
  },
  checks: [
    {
      id: 'facade-scoped',
      label: 'Only allowlisted, read-only tools are published; every other candidate is refused with a reason',
    },
    { id: 'auth-enforced', label: 'A client without the bearer token is rejected with HTTP 401' },
    { id: 'external-discovery', label: 'The external MCP client discovers exactly the published tools, with their schemas' },
    {
      id: 'allowlisted-call',
      label: 'A published tool is called and audited; anything else is refused by the server and never executes',
    },
    { id: 'resources-released', label: 'The external client and the façade are closed with no open sockets' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'MCPServer', minutes: 1, talkingPoints: ['Tools, agents and workflows over MCP'] },
      {
        title: 'Choosing what to publish',
        minutes: 2,
        talkingPoints: ['Risk classes', 'Allowlist and read-only', 'Refused means not registered'],
      },
      {
        title: 'Hardening',
        minutes: 2,
        talkingPoints: ['Bearer token and loopback', 'Limits and timeouts', 'Audit without values'],
      },
      { title: 'External client', minutes: 1.5, talkingPoints: ['MCP SDK as the consumer', '401 without token', 'Unknown tool'] },
      { title: 'Wrap-up', minutes: 0.5, talkingPoints: ['Next: an agent that uses several MCP servers'] },
    ],
  },
  execution: {
    modes: ['offline'],
    defaultTimeoutMs: 30_000,
    maxTimeoutMs: 60_000,
    budget: {},
    costNotice: 'No model is called: the façade runs on 127.0.0.1 inside the run and nothing leaves your machine.',
  },
  tags: ['mcp', 'mcp-server', 'security', 'interoperability'],
} satisfies LabDefinitionInput);
