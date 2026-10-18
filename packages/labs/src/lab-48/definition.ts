import type { LabDefinitionInput } from '@mlp/contracts';

export const lab48Definition = {
  id: 'lab-48',
  number: 48,
  title: 'MCP resources and prompts',
  moduleId: 'module-10',
  summary:
    'Probe what an MCP server advertises with the MCP SDK, compare it with what Mastra’s adapter exposes, read resources and get prompts where they exist, and fall back gracefully, with a label, where they do not.',
  concept:
    'Besides tools, an MCP server can offer resources (data addressed by URI, plus URI templates and subscriptions) and prompts (reusable message templates with arguments). ' +
    'Whether you can use one of these depends on three different layers: what the protocol defines, what this particular server advertises in its capabilities, and what your client library actually exposes. ' +
    'This lab probes the protocol layer with the official MCP TypeScript SDK client, which reports the server’s advertised capabilities after the handshake, and then asks Mastra’s MCPClient the same questions. ' +
    'The layers can disagree: on a server without resources, Mastra’s resources.list() returns an empty list instead of an error, which looks exactly like a server that supports resources and has none. ' +
    'Some features are defined by the protocol but not exposed by Mastra (completions, roots and sampling), and some are exposed with limits, such as Mastra’s MCPServer reading only the URIs it lists, even when it advertises a URI template. ' +
    'So a robust client checks the advertised capabilities first and decides before sending anything. ' +
    'When a feature is missing it offers a fallback, such as a tool that returns similar data or a local prompt template, and it always labels where the content came from.',
  objectives: [
    'Probe a server’s advertised capabilities at the protocol level',
    'Separate protocol support, server support and Mastra adapter support',
    'List and read resources and get prompts with Mastra’s MCPClient',
    'Offer labelled fallbacks when a capability is missing or limited',
  ],
  prerequisites: ['lab-47'],
  inputs: [
    {
      kind: 'select',
      name: 'server',
      label: 'Example server',
      options: [
        { value: 'full', label: 'Tools, resources and prompts' },
        { value: 'tools-only', label: 'Tools only' },
      ],
      default: 'full',
      required: true,
    },
    {
      kind: 'select',
      name: 'operation',
      label: 'Operation',
      options: [
        { value: 'read-resource', label: 'Read a resource' },
        { value: 'get-prompt', label: 'Get a prompt' },
      ],
      default: 'read-resource',
      required: true,
    },
    {
      kind: 'text',
      name: 'resourceUri',
      label: 'Resource URI',
      maxLength: 200,
      default: 'course://syllabus',
      placeholder: 'course://syllabus',
      required: true,
      visibleWhen: { field: 'operation', in: ['read-resource'] },
    },
    {
      kind: 'text',
      name: 'promptName',
      label: 'Prompt name',
      maxLength: 64,
      default: 'explain-lab',
      required: true,
      visibleWhen: { field: 'operation', in: ['get-prompt'] },
    },
    {
      kind: 'json',
      name: 'promptArgs',
      label: 'Prompt arguments (string values)',
      maxBytes: 1_000,
      default: { number: '47' },
      required: true,
      visibleWhen: { field: 'operation', in: ['get-prompt'] },
    },
  ],
  exampleInput: {
    server: 'full',
    operation: 'read-resource',
    resourceUri: 'course://syllabus',
    promptName: 'explain-lab',
    promptArgs: { number: '47' },
  },
  expectedOutput: {
    description:
      'The probe negotiates protocol 2026-07-28 and the server advertises tools, logging, resources (with subscriptions) and prompts. Mastra lists 2 tools, 2 resources, 1 template and 2 prompts, and a subscribe/unsubscribe round trip succeeds. Completions are not advertised and not exposed by Mastra. The syllabus is read from the server via resources.read. With the tools-only server, resources and prompts are not advertised, Mastra’s lists come back empty, and the syllabus request falls back to the course_info tool, labelled as a fallback.',
    example: {
      mcpCapabilities: {
        server: { name: 'Course fixture server', version: '1.0.0', protocolVersion: '2026-07-28' },
        operation: {
          kind: 'read-resource',
          target: 'course://syllabus',
          status: 'server',
          via: 'resources.read',
          fallbackReason: null,
          error: null,
        },
      },
      teardown: { protocolClientClosed: true, clientDisconnected: true, fixtureClosed: true, openSockets: 0 },
    },
  },
  guide: {
    procedure: [
      'Run the example. In the capability matrix, compare the Server and Mastra columns for each feature.',
      'Read the Completions row: which layer is missing it?',
      'Switch the server to Tools only and run again: what does the Resources row say Mastra returned, and where did the syllabus come from?',
      'With the full server, read course://labs/47: why was the template URI rejected, and which tool answered instead?',
      'Choose Get a prompt with explain-lab and { "number": "23" }, then with {}: read the classified error.',
      'Get explain-lab from the tools-only server: how is the local fallback labelled?',
      'Open probe.ts in the Source tab: find getServerCapabilities() and observeAdapter().',
    ],
    prediction: 'On the tools-only server, will Mastra’s resources.list() throw an error or return something?',
    hints: [
      { level: 1, text: 'Look at the Observed column of the Resources row.' },
      { level: 2, text: 'The client checks the capability before sending.' },
      {
        level: 3,
        text: 'It returns an empty list, so only the advertised capabilities tell you that resources are unsupported.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Treating an empty resource list as “this server supports resources”.',
        fix: 'Check the advertised capabilities; a missing capability is also reported as empty.',
      },
      {
        mistake: 'Assuming every protocol feature is available in your client library.',
        fix: 'Probe and document the adapter layer separately (completions, roots and sampling are not exposed by MCPClient).',
      },
      {
        mistake: 'Reading template URIs from a Mastra MCPServer.',
        fix: 'It only reads listed URIs; list them, or use a tool for parameterised data.',
      },
      {
        mistake: 'Silently substituting fallback content.',
        fix: 'Label where the content came from and why the fallback was used.',
      },
      {
        mistake: 'Calling a method the server never advertised.',
        fix: 'Decide from the capabilities before sending; “Method not found” is avoidable.',
      },
    ],
    challenge: {
      prompt:
        'Make the fixture list course://labs/1 to course://labs/75 so template URIs become readable, and show in the matrix that the Resource templates row is now fully usable without the tool fallback.',
      successCriteria: [
        'course://labs/47 is read via resources.read',
        'The fallback is no longer used',
        'The syllabus still works',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Where does the lab read the server’s advertised capabilities from?',
      choices: [
        'Mastra’s resources.list()',
        'The MCP SDK client’s getServerCapabilities()',
        'The tool list',
        'The server instructions',
      ],
      correctIndex: 1,
      explanation: 'The protocol probe reports exactly what the server advertised.',
    },
    {
      id: 'q2',
      prompt: 'What does Mastra’s resources.list() return for a server that does not advertise resources?',
      choices: ['An error', 'An empty list', 'The tool list', 'A placeholder resource'],
      correctIndex: 1,
      explanation: 'That is why “empty” and “unsupported” must be told apart by the capabilities.',
    },
    {
      id: 'q3',
      prompt: 'Which feature is defined by the protocol but not exposed by Mastra’s MCPClient?',
      choices: ['Tools', 'Prompts', 'Completions', 'Resources'],
      correctIndex: 2,
      explanation: 'The SDK has complete(); MCPClient has no completion API.',
    },
    {
      id: 'q4',
      prompt: 'A fallback tool answered a resource request. What must the UI do?',
      choices: ['Show it as the resource', 'Label it as a fallback with the reason', 'Hide it', 'Retry the read forever'],
      correctIndex: 1,
      explanation: 'Never present substitute content as if the server had served it.',
    },
  ],
  sourceFiles: [
    {
      path: 'probe.ts',
      title: 'Capability probe',
      description: 'MCP SDK protocol probe, Mastra adapter observations and the matrix rows.',
    },
    { path: 'run.ts', title: 'Lab run', description: 'Operations, fallbacks, classified errors and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, connect with the MCP SDK client to read a server’s capabilities, then only call resources or prompts through Mastra’s MCPClient if they are advertised; otherwise use a labelled fallback.',
    solutionFile: 'solution.md',
  },
  checks: [
    {
      id: 'capabilities-probed',
      label: 'The advertised capabilities come from a protocol-level probe, and the matrix matches them',
    },
    {
      id: 'layers-distinguished',
      label: 'The matrix separates protocol, server, Mastra adapter and observation, including limited and not-exposed features',
    },
    {
      id: 'operation-handled',
      label: 'The operation returns content or a classified error, and nothing is requested that the server does not advertise',
    },
    { id: 'fallback-labelled', label: 'Fallback content is labelled with where it came from and why' },
    { id: 'resources-released', label: 'Both clients are closed and the fixture server is closed with no open sockets' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Resources and prompts', minutes: 1.5, talkingPoints: ['URIs and templates', 'Prompt arguments'] },
      { title: 'Three layers', minutes: 2, talkingPoints: ['Protocol, server, adapter', 'Empty vs unsupported'] },
      {
        title: 'The probe',
        minutes: 1.5,
        talkingPoints: ['SDK getServerCapabilities', 'Mastra observations', 'Completions and client features'],
      },
      { title: 'Fallbacks', minutes: 1.5, talkingPoints: ['Tool fallback', 'Local template', 'Always label'] },
      { title: 'Wrap-up', minutes: 0.5, talkingPoints: ['Next: expose Mastra over MCP'] },
    ],
  },
  execution: {
    modes: ['offline'],
    defaultTimeoutMs: 30_000,
    maxTimeoutMs: 60_000,
    budget: {},
    costNotice: 'No model is called: the example MCP server runs on 127.0.0.1 inside the run and nothing leaves your machine.',
  },
  tags: ['mcp', 'resources', 'prompts', 'capabilities', 'fallback'],
} satisfies LabDefinitionInput;
