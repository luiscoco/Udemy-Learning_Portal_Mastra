import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const MODEL_OPTIONS = DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id }));

export const lab03Definition = {
  id: 'lab-03',
  number: 3,
  title: 'Create and register a first agent',
  moduleId: 'module-01',
  summary: 'Define a named Mastra Agent, register it on a Mastra instance, look it up by key and by id, and call generate().',
  concept:
    'An agent in Mastra is an object created with `new Agent({ id, name, instructions, model })`. ' +
    'The id is a stable machine identifier, the name is what humans see, the instructions become the system prompt, and the model says which LLM answers. ' +
    'A model is written as a "provider/model" string such as openai/gpt-5-mini, which Mastra\'s model router resolves using the matching API key from your environment. ' +
    'An agent works on its own, but you register it on the Mastra instance with `new Mastra({ agents: { supportAgent } })` so the rest of your app, the API server and Studio can find it. ' +
    'Registered agents are retrieved with `mastra.getAgent(key)`, using the object key you registered, or `mastra.getAgentById(id)`, using the agent\'s own id. ' +
    'Calling `agent.generate(prompt)` sends your instructions and the prompt to the model and returns a result whose text property holds the answer. ' +
    'In offline mode this lab plugs a deterministic simulated model into the same Agent class, so the real Mastra code runs without an API key and the result shows exactly what system prompt the model received.',
  objectives: [
    'Create an Agent with an id, name, instructions and model',
    'Register the agent on a Mastra instance and explain key versus id',
    'Retrieve an agent with getAgent and getAgentById',
    'Call agent.generate and read the text and usage in the result',
  ],
  prerequisites: ['lab-02'],
  inputs: [
    { kind: 'text', name: 'agentKey', label: 'Registration key (camelCase)', minLength: 2, maxLength: 40, default: 'supportAgent', required: true, help: 'The object key in new Mastra({ agents: { … } }).' },
    { kind: 'text', name: 'agentId', label: 'Agent id (kebab-case)', minLength: 2, maxLength: 40, default: 'support-agent', required: true, help: 'Stable identifier stored on the agent.' },
    { kind: 'text', name: 'agentName', label: 'Display name', minLength: 2, maxLength: 40, default: 'Support Agent', required: true },
    {
      kind: 'textarea',
      name: 'instructions',
      label: 'Instructions (system prompt)',
      minLength: 10,
      maxLength: 2000,
      rows: 4,
      default: 'You are a friendly support agent for an online bookstore. Answer in two sentences or fewer.',
      required: true,
    },
    { kind: 'select', name: 'modelId', label: 'Model', options: MODEL_OPTIONS, default: 'openai/gpt-5-mini', required: true, help: 'Offline mode simulates this model; live mode calls it (needs its API key).' },
    { kind: 'text', name: 'prompt', label: 'Prompt', minLength: 1, maxLength: 500, default: 'Do you ship to Canada?', required: true },
  ],
  exampleInput: {
    agentKey: 'supportAgent',
    agentId: 'support-agent',
    agentName: 'Support Agent',
    instructions: 'You are a friendly support agent for an online bookstore. Answer in two sentences or fewer.',
    modelId: 'openai/gpt-5-mini',
    prompt: 'Do you ship to Canada?',
  },
  expectedOutput: {
    description: 'Four workflow steps (define, register, lookup, generate), two lookup tool calls, the registered keys and the agent text.',
    example: {
      registeredKeys: ['supportAgent'],
      lookup: { byKey: { id: 'support-agent', name: 'Support Agent' }, byId: { id: 'support-agent', name: 'Support Agent' }, sameInstance: true },
      model: { id: 'openai/gpt-5-mini', simulated: true },
      text: 'Hi, I\'m Support Agent. You asked: "Do you ship to Canada?". Following my instructions ("You are a friendly support agent for an online bookstore."), this is a deterministic offline answer from the simulated model.',
    },
  },
  guide: {
    procedure: [
      'Read the four fields that define an agent: id, name, instructions and model.',
      'Run the example in offline mode and follow the define → register → lookup → generate steps.',
      'Open the trace: mastra.getAgent used your key, mastra.getAgentById used the agent id.',
      'Read systemPromptSeen in the result: this is exactly what Mastra sent the model as instructions.',
      'Change the key to "helper" but keep the id. Run again and compare which lookup uses which value.',
      'Optional (costs money): set MASTRA_MODE=live and a provider key in .env, restart, and run with live mode.',
    ],
    prediction: 'If you register the agent as { helper: agent } with id "support-agent", what does mastra.getAgent("helper").id return?',
    hints: [
      { level: 1, text: 'Registration key and agent id are two different strings.' },
      { level: 2, text: 'getAgent takes the registration key; getAgentById takes the id passed to new Agent().' },
      { level: 3, text: 'It returns "support-agent": the key only names the registry slot, the id belongs to the agent.' },
    ],
    commonMistakes: [
      { mistake: 'Calling mastra.getAgent with the agent id.', fix: 'Use getAgentById(id), or getAgent(key) with the registration key.' },
      { mistake: 'Writing the model without the provider prefix.', fix: 'Use "provider/model", e.g. "openai/gpt-5-mini".' },
      { mistake: 'Expecting an agent to be reachable from Studio without registering it.', fix: 'Add it to the agents object of the Mastra instance.' },
      { mistake: 'Hard-coding the API key in the agent file.', fix: 'Mastra reads OPENAI_API_KEY (etc.) from the environment.' },
    ],
    challenge: {
      prompt: 'Register two agents in your head: a "billingAgent" with id "billing" and a "supportAgent" with id "support-agent". Write the two lookup calls that return the billing agent.',
      successCriteria: ['mastra.getAgent("billingAgent")', 'mastra.getAgentById("billing")'],
    },
    diagram: {
      kind: 'ascii',
      caption: 'Key vs id',
      source:
        "const supportAgent = new Agent({ id: 'support-agent', … })\nconst mastra = new Mastra({ agents: { supportAgent } })\n                                       └─ key: 'supportAgent'\nmastra.getAgent('supportAgent')      → same instance\nmastra.getAgentById('support-agent') → same instance",
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What becomes the system prompt of a Mastra agent?',
      choices: ['Its name', 'Its instructions', 'Its id', 'The registration key'],
      correctIndex: 1,
      explanation: 'Instructions are sent to the model as the system message.',
    },
    {
      id: 'q2',
      prompt: 'Which call uses the agent\'s own id?',
      choices: ['mastra.getAgent(id)', 'mastra.getAgentById(id)', 'agent.generate(id)', 'new Mastra(id)'],
      correctIndex: 1,
      explanation: 'getAgentById looks agents up by the id passed to new Agent().',
    },
    {
      id: 'q3',
      prompt: 'Where does the text of a generate() call live?',
      choices: ['result.output', 'result.text', 'result.message', 'result.content[0]'],
      correctIndex: 1,
      explanation: 'agent.generate() resolves to a result with a text property.',
    },
    {
      id: 'q4',
      prompt: 'Why register an agent on the Mastra instance?',
      choices: ['It is required to call generate()', 'So the app, API server and Studio can find it by key or id', 'To make it run faster', 'To store its API key'],
      correctIndex: 1,
      explanation: 'An Agent can generate on its own; registration makes it discoverable across the app and tools.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'Agent definition, Mastra registration, lookups and generate.' },
    { path: 'definition.ts', title: 'Lesson definition' },
  ],
  exercise: {
    instructions:
      'In the project from Lab 01, add a second agent "faqAgent" with id "faq-agent" and instructions that limit answers to shipping questions. Register it next to the first agent and write a small script that calls mastra.getAgentById("faq-agent").generate("…") and prints result.text.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'registered', label: 'Agent registered on the Mastra instance under your key' },
    { id: 'lookup-by-id', label: 'mastra.getAgentById() finds the agent' },
    { id: 'same-instance', label: 'Lookup by key and by id return the same Agent instance' },
    { id: 'text-returned', label: 'agent.generate() returned non-empty text' },
    { id: 'instructions-delivered', label: 'Your instructions reached the model as the system prompt' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Anatomy of an Agent', minutes: 1.5, talkingPoints: ['id, name, instructions, model', '"provider/model" strings'] },
      { title: 'Register and look up', minutes: 1.5, talkingPoints: ['new Mastra({ agents })', 'getAgent(key) vs getAgentById(id)'] },
      { title: 'Generate', minutes: 1.5, talkingPoints: ['agent.generate(prompt)', 'result.text and usage', 'systemPromptSeen proves instructions'] },
      { title: 'Live mode and costs', minutes: 1, talkingPoints: ['MASTRA_MODE=live + key in .env', 'Costs are per token'] },
      { title: 'Wrap-up', minutes: 0.5, talkingPoints: ['Next: choosing models and instructions'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 30_000,
    maxTimeoutMs: 60_000,
    budget: { maxSteps: 1, maxTokens: 500 },
    costNotice: 'Offline is free. Live mode makes one model call with your provider key (typically well under $0.01).',
  },
  tags: ['agent', 'registration', 'generate'],
} satisfies LabDefinitionInput;
