import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const question = 'What is 18% of 240, and what is the title of lab 47?';

export const lab50Definition = {
  id: 'lab-50',
  number: 50,
  title: 'Multi-server MCP agent',
  moduleId: 'module-10',
  summary:
    'Give one agent the tools of a local calculator MCP server and a local course data server, resolve tool-name collisions with a namespace, first-wins or reject policy, prove that every call runs on the server that owns the tool, and keep working when one server is down.',
  concept:
    'An agent often needs tools from several MCP servers at once, and Mastra’s MCPClient can connect to all of them through one servers map. ' +
    'Two servers can offer a tool with the same name; in this lab both offer info. ' +
    'Mastra’s listTools() avoids the clash by namespacing every tool as server_tool, while listToolsets() returns each server’s tools under their own names, which you must merge yourself. ' +
    'If you merge them into flat names you need a collision policy: first-wins keeps one server’s tool and silently hides the other, and reject drops the shared name entirely. ' +
    'Namespacing is the safest default, but even namespaced keys can clash (a server named a_b with tool c and a server a with tool b_c), so the lab checks that too. ' +
    'Each tool object stays bound to its own server connection, and the servers count their own executions, so the lab can prove where every call really ran. ' +
    'Discovery with listToolsetsWithErrors reports a server that is down per server instead of failing, so the agent continues with the remaining tools and tells the user which capability is missing.',
  objectives: [
    'Connect one MCPClient to several MCP servers',
    'Expose their tools with a namespace, first-wins or reject collision policy',
    'Verify routing with server-side execution counters',
    'Keep the agent working when one server is offline',
  ],
  prerequisites: ['lab-49'],
  inputs: [
    {
      kind: 'textarea',
      name: 'question',
      label: 'Question',
      minLength: 3,
      maxLength: 500,
      rows: 2,
      default: question,
      required: true,
    },
    {
      kind: 'select',
      name: 'collisionPolicy',
      label: 'Collision policy',
      options: [
        { value: 'namespace', label: 'Namespace (server_tool)' },
        { value: 'first-wins', label: 'Flat names, first server wins' },
        { value: 'reject', label: 'Flat names, reject shared names' },
      ],
      default: 'namespace',
      required: true,
    },
    {
      kind: 'select',
      name: 'downServer',
      label: 'Take a server offline',
      options: [
        { value: 'none', label: 'None' },
        { value: 'calc', label: 'Calculator server' },
        { value: 'data', label: 'Course data server' },
      ],
      default: 'none',
      required: true,
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model (live)',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: { question, collisionPolicy: 'namespace', downServer: 'none', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'Both servers connect. With the namespace policy the agent sees seven tools (calc_add, calc_multiply, calc_percent_of, calc_info, data_lab_title, data_search_labs, data_info), and the shared name info is namespaced. calc_percent_of runs on the calculator server and data_lab_title on the data server, as their own counters confirm, and the answer is “18% of 240 is 43.2. Lab 47 is “Discover MCP tools”.”',
    example: {
      policy: 'namespace',
      collisions: [{ name: 'info', servers: ['calc', 'data'], resolution: 'namespaced as calc_info and data_info' }],
      keyCollisions: [],
      serverExecutions: { calc: { percent_of: 1 }, data: { lab_title: 1 } },
      answer: '18% of 240 is 43.2. Lab 47 is “Discover MCP tools”.',
      teardown: { clientDisconnected: true, serversClosed: true, openSockets: 0 },
    },
  },
  guide: {
    procedure: [
      'Open servers.ts and policy.ts in the Source tab: find the two info tools and exposeTools().',
      'Run the example. Compare the exposed names with each tool call’s server, then read serverExecutions.',
      'Ask “Which servers are available?” with each collision policy in turn: how many info results appear in the answer each time?',
      'Take the calculator server offline and run the example question: what is reported for calc, and what does the answer say?',
      'Take the course data server offline instead: which part of the question still works?',
      'In live mode, ask your own question that needs both servers and check the routing in the trace.',
    ],
    prediction: 'With the first-wins policy, which server answers “Which servers are available?”',
    hints: [
      { level: 1, text: 'The policy keeps only one tool named info.' },
      { level: 2, text: 'The servers are merged in a fixed order: calc, then data.' },
      { level: 3, text: 'Only the calculator server: data.info is shadowed, so the answer silently misses the data server.' },
    ],
    commonMistakes: [
      {
        mistake: 'Merging tools from several servers into flat names without a policy.',
        fix: 'Namespace them, or choose and report a collision policy.',
      },
      { mistake: 'Assuming first-wins is harmless.', fix: 'It silently hides a tool; the agent cannot know what it lost.' },
      {
        mistake: 'Failing the whole agent when one server is down.',
        fix: 'Discover with listToolsetsWithErrors and continue with the healthy servers.',
      },
      {
        mistake: 'Letting the model guess when a tool is missing.',
        fix: 'Instruct it to name the unavailable capability instead.',
      },
      {
        mistake: 'Trusting the client’s idea of where a call went.',
        fix: 'Verify with server-side evidence, such as execution counters or logs.',
      },
    ],
    challenge: {
      prompt:
        'Add a third server whose key collides after namespacing (for example a server data_search with a tool labs, next to data.search_labs), and make the lab refuse to start until the clash is resolved.',
      successCriteria: ['keyCollisions reports data_search_labs', 'The agent is not started', 'Renaming the server fixes it'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'How does Mastra’s listTools() name a tool info from server calc?',
      choices: ['info', 'calc.info', 'calc_info', 'info@calc'],
      correctIndex: 2,
      explanation: 'listTools namespaces keys as server_tool.',
    },
    {
      id: 'q2',
      prompt: 'What is the risk of the first-wins policy?',
      choices: ['It crashes', 'It silently hides the other server’s tool', 'It calls both tools', 'It renames tools'],
      correctIndex: 1,
      explanation: 'The shadowed tool simply disappears from the agent’s view.',
    },
    {
      id: 'q3',
      prompt: 'One server is down. What does listToolsetsWithErrors return?',
      choices: [
        'An exception',
        'The healthy servers’ tools plus an error for the down server',
        'Nothing',
        'Tools from the down server, cached',
      ],
      correctIndex: 1,
      explanation: 'Failures are reported per server.',
    },
    {
      id: 'q4',
      prompt: 'How does this lab prove a call ran on the right server?',
      choices: ['From the tool name', 'From the model’s answer', 'From each server’s own execution counter', 'It cannot'],
      correctIndex: 2,
      explanation: 'Server-side evidence is independent of the client.',
    },
  ],
  sourceFiles: [
    {
      path: 'servers.ts',
      title: 'Calculator and data servers',
      description: 'Two MCPServers with execution counters and a shared tool name.',
    },
    {
      path: 'policy.ts',
      title: 'Collision policies',
      description: 'exposeTools (namespace, first-wins, reject) and the namespaced-key check.',
    },
    { path: 'run.ts', title: 'Lab run', description: 'Discovery with a down server, the agent, the offline script and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, connect one MCPClient to two MCP servers, pass the namespaced tools to an agent, stop one server and show that the agent still answers with the other server’s tools and names what is missing.',
    solutionFile: 'solution.md',
  },
  checks: [
    {
      id: 'servers-connected',
      label: 'Each server is connected, except a server that is down, which is reported with a known category',
    },
    { id: 'collisions-resolved', label: 'Exposed tool names are unique, and every shared name is resolved as the policy says' },
    { id: 'calls-routed', label: 'Every successful call ran on the server that owns the tool (server-side counters match)' },
    {
      id: 'partial-failure-isolated',
      label: 'A server that is down does not stop the agent: healthy tools still run and the gap is reported',
    },
    { id: 'answer-grounded', label: 'The answer contains each tool result it relies on' },
    { id: 'resources-released', label: 'The client is disconnected and both servers are closed with no open sockets' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Several servers, one client', minutes: 1, talkingPoints: ['servers map', 'listTools vs listToolsets'] },
      {
        title: 'Collisions',
        minutes: 2,
        talkingPoints: ['Namespace', 'First-wins hides tools', 'Reject', 'Namespaced keys can clash too'],
      },
      { title: 'Routing', minutes: 1.5, talkingPoints: ['Tools bound to their server', 'Server-side counters'] },
      { title: 'Partial failure', minutes: 2, talkingPoints: ['listToolsetsWithErrors', 'Name the missing capability'] },
      { title: 'Wrap-up', minutes: 0.5, talkingPoints: ['Next module: multi-agent architectures'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 4 },
    costNotice:
      'Offline is free (scripted model; both MCP servers run on 127.0.0.1). Live makes one agent run with up to 4 model steps on your provider key.',
  },
  tags: ['mcp', 'multi-server', 'namespaces', 'resilience', 'agents'],
} satisfies LabDefinitionInput;
