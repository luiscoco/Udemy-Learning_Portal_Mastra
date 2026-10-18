import type { LabDefinitionInput } from '@mlp/contracts';

export const lab46Definition = {
  id: 'lab-46',
  number: 46,
  title: 'Connect MCP server',
  moduleId: 'module-10',
  summary:
    'Connect a Mastra MCPClient to a local example MCP server, read the negotiated protocol, server identity, instructions and tools, and handle failed connections with classified, sanitized errors, a retry policy and a clean teardown.',
  concept:
    'The Model Context Protocol (MCP) lets an agent use tools, resources and prompts that live in a separate server instead of in your own code. ' +
    'Mastra’s MCPClient connects to servers declared in a servers map: a command starts a local process over stdio, and a url connects over Streamable HTTP. ' +
    'On connect, the client asks the server which protocol revisions it offers (server/discover) and falls back to the older initialize handshake for servers that have not upgraded; the server answers with its name, version and optional instructions. ' +
    'In this lab the example server is a Mastra MCPServer with two read-only course tools, served on 127.0.0.1 for the length of the run, so the handshake is real but nothing leaves your machine. ' +
    'A server is another process, so connections fail: nothing listening, a wrong path, a server that never answers, a protocol revision it does not speak, or a host your policy does not allow. ' +
    'listToolsWithErrors reports those failures per server instead of throwing, and the lab turns each one into a category with a learner-facing message and a hint. ' +
    'Only transient failures (timeout, unreachable) are worth retrying; a 404 or a protocol mismatch will fail again, so it is reported at once. ' +
    'Raw errors contain stack traces and local paths, so they are sanitized before they reach the browser, and every client is disconnected when it is no longer needed.',
  objectives: [
    'Configure Mastra’s MCPClient for a Streamable HTTP server with allowedHosts and a timeout',
    'Read the negotiated protocol revision, server identity and instructions after the handshake',
    'Classify connection failures and retry only the transient ones',
    'Keep raw errors out of the UI and release every client and socket',
  ],
  prerequisites: ['lab-45'],
  inputs: [
    {
      kind: 'select',
      name: 'scenario',
      label: 'Scenario',
      options: [
        { value: 'healthy', label: 'Healthy server' },
        { value: 'wrong-path', label: 'Wrong endpoint path (HTTP 404)' },
        { value: 'refused', label: 'Nothing listening on the port' },
        { value: 'timeout', label: 'Server accepts but never answers' },
        { value: 'protocol-mismatch', label: 'Client pins the legacy protocol' },
        { value: 'blocked-host', label: 'Host not in allowedHosts' },
      ],
      default: 'healthy',
      required: true,
    },
    {
      kind: 'number',
      name: 'timeoutMs',
      label: 'Timeout per attempt (ms)',
      min: 300,
      max: 5000,
      step: 100,
      default: 1500,
      required: true,
    },
    { kind: 'number', name: 'maxAttempts', label: 'Maximum attempts', min: 1, max: 3, step: 1, default: 2, required: true },
  ],
  exampleInput: { scenario: 'healthy', timeoutMs: 1500, maxAttempts: 2 },
  expectedOutput: {
    description:
      'The client connects on the first attempt with protocol 2026-07-28 and receives the server identity (Course fixture server 1.0.0), its instructions and two tools, keyed course_course_info and course_lab_title. The client is disconnected and the fixture server is closed with no open sockets. With refused or timeout, two attempts fail with the same category; with wrong-path, protocol-mismatch or blocked-host, one attempt fails and is not retried.',
    example: {
      scenario: 'healthy',
      clientConfig: { transport: 'streamable-http', protocolVersion: 'auto (server/discover probe)', timeoutMs: 1500 },
      connection: {
        status: 'connected',
        protocolVersion: '2026-07-28',
        serverInfo: { name: 'Course fixture server', version: '1.0.0' },
        tools: [
          { key: 'course_course_info', name: 'course_info' },
          { key: 'course_lab_title', name: 'lab_title' },
        ],
      },
      teardown: { clientsDisconnected: true, fixtureClosed: true, openSockets: 0 },
    },
  },
  guide: {
    procedure: [
      'Open connect.ts in the Source tab: find new MCPClient({ servers: { course: { url, allowedHosts, timeout } } }) and listToolsWithErrors({ perServerTimeoutMs }).',
      'Run the healthy scenario. Read protocolVersion, serverInfo and instructions in the connection, and the tool keys: why is each tool prefixed with course_?',
      'Run refused, then wrong-path. Compare the number of attempts: which one was retried, and why?',
      'Run timeout with a timeout of 500 ms, then 2000 ms, and compare the attempt durations.',
      'Run protocol-mismatch and read the sanitized detail: which revision did the client ask for, and which does the server support?',
      'Run blocked-host: was any request sent to the server? Look at the attempt duration.',
      'Open fixture-server.ts to see how the example MCPServer is served with startHTTP on 127.0.0.1.',
    ],
    prediction: 'With maxAttempts 3, how many attempts will the wrong-path scenario make?',
    hints: [
      { level: 1, text: 'Think about whether a second try could give a different answer.' },
      { level: 2, text: 'A 404 means the server is up and has nothing at that path.' },
      { level: 3, text: 'One: not-found is not retriable, so the client reports it at once.' },
    ],
    commonMistakes: [
      {
        mistake: 'Retrying every failure.',
        fix: 'Retry only transient failures (timeout, unreachable); configuration errors fail again.',
      },
      {
        mistake: 'Showing the raw error in the UI.',
        fix: 'Raw MCP errors contain stack traces and local paths; show a category, a message and a sanitized first line.',
      },
      {
        mistake: 'Creating a new MCPClient with the same configuration on every request.',
        fix: 'Give each instance a unique id, or reuse one client, and disconnect it when done.',
      },
      {
        mistake: 'Leaving allowedHosts unset for configurable URLs.',
        fix: 'Restrict the hosts the client may contact, so a configured URL cannot reach internal services.',
      },
      {
        mistake: 'Forwarding server instructions into the agent prompt by default.',
        fix: 'Review them with getServerInstructions(); forwardInstructions is opt-in for trusted servers.',
      },
    ],
    challenge: {
      prompt:
        'Make the backoff exponential with jitter (for example 100 ms × 2^n ± 20 %), cap the total wait at the run deadline, and show the planned and actual waits in each attempt.',
      successCriteria: [
        'Waits grow between attempts',
        'The total stays within the deadline',
        'Non-retriable failures still make exactly one attempt',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Which MCPClient server definition uses Streamable HTTP?',
      choices: ['One with command and args', 'One with url', 'One with a toolset', 'One with protocolVersion'],
      correctIndex: 1,
      explanation: 'A url selects Streamable HTTP; a command starts a stdio subprocess.',
    },
    {
      id: 'q2',
      prompt: 'What does listToolsWithErrors do when a server is down?',
      choices: [
        'Throws and stops all servers',
        'Returns the other servers’ tools and reports the error for that server',
        'Retries forever',
        'Returns an empty object with no error',
      ],
      correctIndex: 1,
      explanation: 'Failures are reported per server in errors and errorDetails.',
    },
    {
      id: 'q3',
      prompt: 'Which failure is worth retrying?',
      choices: ['HTTP 404', 'Protocol version mismatch', 'Host blocked by allowedHosts', 'A timeout'],
      correctIndex: 3,
      explanation: 'A timeout can be transient; the others are configuration errors.',
    },
    {
      id: 'q4',
      prompt: 'With allowedHosts excluding the server, what reaches the server?',
      choices: [
        'The discover probe only',
        'Nothing: the request is blocked before it is sent',
        'Everything, with a warning',
        'Only tool calls',
      ],
      correctIndex: 1,
      explanation: 'The client checks the host before sending any request.',
    },
  ],
  sourceFiles: [
    {
      path: 'connect.ts',
      title: 'MCP client connection',
      description: 'MCPClient configuration, failure classification, sanitizing, retries and disconnect.',
    },
    {
      path: 'fixture-server.ts',
      title: 'Example MCP server',
      description: 'A Mastra MCPServer with two read-only tools, served on loopback with startHTTP.',
    },
    { path: 'run.ts', title: 'Lab run', description: 'Scenarios, events, teardown and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, connect an MCPClient to an MCP server over HTTP with allowedHosts and a timeout, print the negotiated protocol and server identity, and handle a stopped server with a classified error instead of a crash.',
    solutionFile: 'solution.md',
  },
  checks: [
    {
      id: 'outcome-expected',
      label: 'The connection outcome matches the scenario (handshake details when healthy, the expected category otherwise)',
    },
    { id: 'failure-classified', label: 'Every failed attempt has a known category, a learner-facing message and a hint' },
    { id: 'retry-policy', label: 'Only retriable failures (timeout, unreachable) are retried, up to maxAttempts' },
    { id: 'errors-sanitized', label: 'No stack traces or local file paths reach the output' },
    { id: 'resources-released', label: 'Every client is disconnected and the fixture server is closed with no open sockets' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      {
        title: 'What MCP is',
        minutes: 1,
        talkingPoints: ['Tools, resources and prompts from another process', 'stdio vs Streamable HTTP'],
      },
      {
        title: 'The handshake',
        minutes: 1.5,
        talkingPoints: ['server/discover and the legacy fallback', 'Server identity and instructions'],
      },
      { title: 'Failures', minutes: 2, talkingPoints: ['Five ways to fail', 'Retriable or not', 'Sanitized errors'] },
      {
        title: 'Safety and cleanup',
        minutes: 1,
        talkingPoints: ['allowedHosts', 'Disconnect and sockets', 'Instructions are not forwarded by default'],
      },
      { title: 'Wrap-up', minutes: 0.5, talkingPoints: ['Next: discover and call MCP tools'] },
    ],
  },
  execution: {
    modes: ['offline'],
    defaultTimeoutMs: 30_000,
    maxTimeoutMs: 60_000,
    budget: {},
    costNotice: 'No model is called: the example MCP server runs on 127.0.0.1 inside the run and nothing leaves your machine.',
  },
  tags: ['mcp', 'mcp-client', 'connections', 'error-handling'],
} satisfies LabDefinitionInput;
