import type { LabDefinitionInput } from '@mlp/contracts';

const allowlist = ['course_info', 'lab_title', 'search_labs'];

export const lab47Definition = {
  id: 'lab-47',
  number: 47,
  title: 'Discover MCP tools',
  moduleId: 'module-10',
  summary:
    'List an MCP server’s tools at runtime with their JSON Schemas and annotations, apply a client-side permission policy, call a permitted read-only tool, and reject unknown or unsafe tools and invalid arguments before anything reaches the server.',
  concept:
    'An MCP client does not know a server’s tools in advance: it asks for them at runtime, and the server answers with each tool’s name, title, description, a JSON Schema for its input, an optional schema for its output and behaviour annotations. ' +
    'Mastra’s MCPClient gives you that metadata as plain definitions (listToolDefinitions) or as ready-to-call Mastra tools keyed server_tool (listTools). ' +
    'The input schema is a contract: Mastra validates arguments against it on the client, so a call with a missing or out-of-range field is answered with field errors and never sent. ' +
    'Annotations such as readOnlyHint and destructiveHint describe what a tool claims to do; the MCP specification says they are hints and must be treated as untrusted unless the server is trusted. ' +
    'So a client applies its own policy before calling: the tool must have been discovered, must be on an allowlist you control, and here must also be annotated read-only, which we accept because the fixture is our own server. ' +
    'An unknown name is rejected with close suggestions instead of being guessed, which is also what protects you from a model that invents tool names. ' +
    'The fixture counts every execution on the server side, so the lab can prove that a rejected call never reached it.',
  objectives: [
    'Discover MCP tools at runtime and read their schemas and annotations',
    'Derive a parameter table from a JSON Schema',
    'Enforce a client-side policy: discovered, allowlisted and read-only',
    'Reject unknown tools and invalid arguments before they reach the server',
  ],
  prerequisites: ['lab-46'],
  inputs: [
    {
      kind: 'text',
      name: 'toolName',
      label: 'Tool to call (name or namespaced key)',
      minLength: 1,
      maxLength: 64,
      default: 'search_labs',
      placeholder: 'search_labs',
      required: true,
    },
    {
      kind: 'json',
      name: 'args',
      label: 'Arguments (JSON object, checked against the tool’s input schema)',
      maxBytes: 2_000,
      default: { query: 'mcp', limit: 3 },
      required: true,
    },
    {
      kind: 'json',
      name: 'allowlist',
      label: 'Allowlist (tool names the client may call)',
      maxBytes: 1_000,
      default: allowlist,
      required: true,
    },
  ],
  exampleInput: { toolName: 'search_labs', args: { query: 'mcp', limit: 3 }, allowlist },
  expectedOutput: {
    description:
      'Four tools are discovered: course_info, lab_title and search_labs (read-only, allowlisted) and reset_progress (destructive, not allowlisted). Each shows its schema and parameters; search_labs has query (required, minLength 2) and limit (default 3). The call to search_labs returns labs 46, 47 and 48, and the server recorded exactly one execution.',
    example: {
      mcpCatalog: {
        server: { key: 'course', name: 'Course fixture server', version: '1.0.0', protocolVersion: '2026-07-28' },
        call: {
          toolName: 'search_labs',
          status: 'success',
          reason: null,
          result: {
            matches: [
              { number: 46, title: 'Connect MCP server' },
              { number: 47, title: 'Discover MCP tools' },
              { number: 48, title: 'MCP resources and prompts' },
            ],
          },
        },
      },
      serverCalls: { search_labs: 1 },
      teardown: { clientDisconnected: true, fixtureClosed: true, openSockets: 0 },
    },
  },
  guide: {
    procedure: [
      'Run the example. In “MCP tools”, read each tool’s badges and parameter table, then open the raw JSON Schema of search_labs.',
      'Look at the call result and at serverCalls in the result: how many times did the server execute a tool?',
      'Set the tool to delete_everything and run: what is the rejection reason, and what did serverCalls record?',
      'Set the tool to serch_labs (a typo): which suggestion do you get?',
      'Set the tool to reset_progress: why is it rejected? Add it to the allowlist and run again: what is the reason now?',
      'Call search_labs with { "query": "m" }, then with { "limit": 2 }: read the field errors.',
      'Call lab_title with { "number": 23 } and course_info with {}.',
      'Open run.ts and policy.ts in the Source tab: find listToolDefinitionsWithErrors, decide() and toolFromDefinition.',
    ],
    prediction: 'If you add reset_progress to the allowlist, will the lab call it?',
    hints: [
      { level: 1, text: 'The policy has more than one condition.' },
      { level: 2, text: 'Look at the tool’s annotations.' },
      { level: 3, text: 'No: it is not annotated read-only (it is destructive), so it is rejected as not-read-only.' },
    ],
    commonMistakes: [
      {
        mistake: 'Hardcoding the tool list on the client.',
        fix: 'Discover it at runtime: servers add, remove and change tools.',
      },
      {
        mistake: 'Trusting readOnlyHint from any server.',
        fix: 'Annotations are hints; trust them only for servers you control, and keep your own allowlist.',
      },
      {
        mistake: 'Guessing the closest tool when a name is unknown.',
        fix: 'Reject it and show suggestions; never call something the user or model did not name.',
      },
      {
        mistake: 'Sending arguments without checking the schema.',
        fix: 'Validate against the advertised input schema first; Mastra does this on the client.',
      },
      {
        mistake: 'Confusing the namespaced key with the tool name.',
        fix: 'Mastra keys tools server_tool; the server knows them by their own name.',
      },
    ],
    challenge: {
      prompt:
        'Add a per-tool argument policy: lab_title may only be called for labs 1–50, enforced on the client before the call, with its own rejection reason and a test that the server counter stays at 0.',
      successCriteria: [
        'lab_title with 60 is rejected before sending',
        'lab_title with 23 still succeeds',
        'The server counter proves it',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Which MCPClient method returns tool metadata as plain, serializable definitions?',
      choices: ['listTools()', 'listToolDefinitions()', 'getServerInfo()', 'resources.list()'],
      correctIndex: 1,
      explanation: 'listToolDefinitions (and its WithErrors variant) returns name, schemas and annotations without functions.',
    },
    {
      id: 'q2',
      prompt: 'A server marks a tool readOnlyHint: true. What does the MCP specification say about that?',
      choices: [
        'It is a guarantee',
        'It is a hint, untrusted unless the server is trusted',
        'Clients must call it without asking',
        'It disables validation',
      ],
      correctIndex: 1,
      explanation: 'Annotations describe intent; they are not a security boundary.',
    },
    {
      id: 'q3',
      prompt: 'The arguments are missing a required field. What reaches the server?',
      choices: [
        'The call, which the server rejects',
        'Nothing: the client validates against the input schema first',
        'A partial call',
        'A retry',
      ],
      correctIndex: 1,
      explanation: 'Mastra validates arguments on the client and returns field errors.',
    },
    {
      id: 'q4',
      prompt: 'What should happen when a tool name is not in the discovered list?',
      choices: ['Call the closest match', 'Reject it and offer suggestions', 'Ask the server to create it', 'Retry later'],
      correctIndex: 1,
      explanation: 'Never call a tool nobody named.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'Discovery, catalog building, the call and checks.' },
    { path: 'policy.ts', title: 'Permission policy', description: 'decide(), name resolution, suggestions and field errors.' },
  ],
  exercise: {
    instructions:
      'In your project, list an MCP server’s tool definitions, print each tool’s parameters from its input schema, and call one tool only if it is on your allowlist; reject any other name with a clear message.',
    solutionFile: 'solution.md',
  },
  checks: [
    {
      id: 'catalog-discovered',
      label: 'The tool list comes from the server at runtime, and every tool has an object input schema',
    },
    { id: 'schema-shown', label: 'Every tool shows its title, description, annotations and parameter table in the UI' },
    {
      id: 'policy-enforced',
      label: 'Only discovered, allowlisted, read-only tools are called; rejected calls never reach the server',
    },
    { id: 'call-reported', label: 'The call shows its arguments and either the result or the reason it was rejected' },
    { id: 'resources-released', label: 'The client is disconnected and the fixture server is closed with no open sockets' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Discovery', minutes: 1.5, talkingPoints: ['listToolDefinitions vs listTools', 'Namespaced keys'] },
      { title: 'Schemas', minutes: 1.5, talkingPoints: ['JSON Schema 2020-12', 'Parameter table', 'Client-side validation'] },
      { title: 'Policy', minutes: 2, talkingPoints: ['Annotations are hints', 'Allowlist', 'Unknown tools and suggestions'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Server counter as evidence', 'Next: resources and prompts'] },
    ],
  },
  execution: {
    modes: ['offline'],
    defaultTimeoutMs: 30_000,
    maxTimeoutMs: 60_000,
    budget: {},
    costNotice: 'No model is called: the example MCP server runs on 127.0.0.1 inside the run and nothing leaves your machine.',
  },
  tags: ['mcp', 'tools', 'json-schema', 'permissions'],
} satisfies LabDefinitionInput;
