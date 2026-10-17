import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const cart = {
  items: [
    { name: 'Notebook', unitPriceCents: 450, quantity: 3 },
    { name: 'Gel pen', unitPriceCents: 125, quantity: 4 },
  ],
  discountPct: 10,
  taxRatePct: 8,
};

export const lab11Definition = {
  id: 'lab-11',
  number: 11,
  title: 'First custom tool',
  moduleId: 'module-03',
  summary:
    'Build a deterministic order-total tool with createTool and Zod, register it, and let an agent call it instead of doing math itself.',
  concept:
    'Language models are poor at exact arithmetic and know nothing about your data, so agents call tools: ordinary functions the model can request by name. ' +
    'In Mastra you write one with `createTool({ id, description, inputSchema, outputSchema, execute })`, where the Zod schemas describe exactly which arguments the model must send and what comes back. ' +
    'The description is part of the prompt, so it should say clearly when to use the tool. ' +
    'You give tools to an agent with the tools option, and you can also register them on the Mastra instance so the rest of your app and Studio can find them. ' +
    'During a run the model sends a tool call with arguments, Mastra validates them, runs execute, and passes the result back to the model, which then writes its answer. ' +
    'Money is a classic case for a tool: this one works in integer cents and rounds at fixed points, so the total is always exact and reproducible. ' +
    'The Run tab shows each tool call with its arguments, result and duration in the trace.',
  objectives: [
    'Create a tool with createTool, Zod input and output schemas, and a pure execute function',
    'Give the tool to an agent and register it on the Mastra instance',
    'Follow a tool call from the model’s arguments to the tool result and the final answer',
    'Explain why money calculations belong in deterministic tools',
  ],
  prerequisites: ['lab-10'],
  inputs: [
    {
      kind: 'json',
      name: 'cart',
      label: 'Cart (JSON)',
      help: 'items[] with name, unitPriceCents (integer), quantity; discountPct; taxRatePct.',
      maxBytes: 4000,
      default: cart,
      required: true,
    },
    {
      kind: 'text',
      name: 'question',
      label: 'Question',
      minLength: 1,
      maxLength: 500,
      default: 'What is the total for this order?',
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
  exampleInput: { cart, question: 'What is the total for this order?', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'One calculateOrderTotal tool call with the cart as arguments; subtotal $18.50, discount $1.85, tax $1.33, total $17.98; the answer quotes $17.98.',
    example: {
      answer: 'The total is $17.98 (subtotal $18.50, discount $1.85, tax $1.33).',
      expected: { subtotalCents: 1850, discountCents: 185, taxCents: 133, totalCents: 1798 },
      registered: {
        agentTools: ['calculateOrderTotal'],
        mastraTools: ['calculateOrderTotal', 'calculate-order-total'],
        lookupById: 'calculate-order-total',
      },
    },
  },
  guide: {
    procedure: [
      'Open the Source tab and read tool.ts: the schemas, the description and the pure calculateOrderTotal function.',
      'Run the example. In the trace, open the calculateOrderTotal call: compare its arguments with your cart.',
      'Check the result: subtotal, discount, tax and total in cents.',
      'Read the final answer: the model only reports what the tool returned.',
      'Change a quantity or the discount and run again. Recalculate by hand to confirm.',
      'Optional (costs money): run in live mode and see a real model choose to call the tool.',
    ],
    prediction: 'Before running: what are the subtotal and the total in cents for the example cart?',
    hints: [
      { level: 1, text: 'Subtotal = Σ unit price × quantity.' },
      { level: 2, text: '3 × 450 + 4 × 125 = 1850 cents. Discount 10% = 185, then tax 8% of 1665.' },
      { level: 3, text: 'Tax = round(1665 × 0.08) = 133, so total = 1850 − 185 + 133 = 1798 cents ($17.98).' },
    ],
    commonMistakes: [
      { mistake: 'Letting the model do the arithmetic.', fix: 'Put calculations in a tool and tell the model to always use it.' },
      { mistake: 'Using floating-point dollars for money.', fix: 'Use integer cents and round at defined points.' },
      {
        mistake: 'A vague tool description.',
        fix: 'Say exactly what the tool does and when to call it; it is part of the prompt.',
      },
      { mistake: 'Side effects inside a "calculator" tool.', fix: 'Keep execute pure so it can be retried and tested.' },
    ],
    challenge: {
      prompt:
        'Add an optional "shippingCents" field that is added after tax, plus a free-shipping rule when the discounted subtotal is at least $50. Update the schema and the function.',
      successCriteria: ['Schema change typechecks', 'Unit test covers both sides of the free-shipping threshold'],
    },
    diagram: {
      kind: 'ascii',
      caption: 'One tool round trip',
      source:
        'user question + cart ─▶ model ─tool call {items,discountPct,taxRatePct}─▶ Mastra validates (Zod)\n                                                                         └─▶ execute() → { totalCents… }\nmodel ◀─tool result─ Mastra            model ─▶ "The total is $17.98"',
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Which part of a Mastra tool tells the model when to use it?',
      choices: ['id', 'description', 'outputSchema', 'execute'],
      correctIndex: 1,
      explanation: 'The description is sent to the model as part of the tool definition.',
    },
    {
      id: 'q2',
      prompt: 'Why use integer cents in the tool?',
      choices: [
        'Models prefer integers',
        'Floating-point dollars cause rounding errors',
        'Zod cannot validate decimals',
        'It is faster',
      ],
      correctIndex: 1,
      explanation: '0.1 + 0.2 ≠ 0.3 in floating point; integer cents keep money exact.',
    },
    {
      id: 'q3',
      prompt: 'What happens between the model’s tool call and execute()?',
      choices: [
        'Nothing',
        'Mastra validates the arguments against inputSchema',
        'The user approves it',
        'The model runs execute itself',
      ],
      correctIndex: 1,
      explanation: 'Mastra checks the arguments with the Zod input schema before running the tool.',
    },
    {
      id: 'q4',
      prompt: 'How can the rest of your app find the tool by id?',
      choices: [
        'agent.getTool()',
        'mastra.getToolById("calculate-order-total") after registering it on Mastra',
        'It cannot',
        'From .env',
      ],
      correctIndex: 1,
      explanation: 'Registering tools on the Mastra instance makes them discoverable by key or id (mastra.listTools() lists both).',
    },
  ],
  sourceFiles: [
    { path: 'tool.ts', title: 'The tool', description: 'createTool with Zod schemas and pure money logic.' },
    { path: 'run.ts', title: 'Lab run', description: 'Agent + Mastra registration, streamed tool trace, checks.' },
    { path: 'shared/tool-stream.ts', title: 'Tool event bridge', description: 'Maps Mastra tool chunks to timeline events.' },
  ],
  exercise: {
    instructions:
      'In your project, create src/mastra/tools/order-total.ts with createTool (integer cents, discount then tax), add it to an agent’s tools, register it in src/mastra/index.ts, and call the agent with a cart. Write one unit test for the pure function.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'tool-registered', label: 'The tool is registered on the agent and on the Mastra instance' },
    { id: 'tool-called', label: 'The agent called calculateOrderTotal' },
    { id: 'totals-correct', label: 'The tool returned the correct totals' },
    { id: 'answer-uses-total', label: 'The final answer states the tool’s total' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Why tools', minutes: 1, talkingPoints: ['Models are bad at exact math', 'Tools = functions the model can call'] },
      {
        title: 'createTool anatomy',
        minutes: 1.5,
        talkingPoints: ['id, description', 'inputSchema/outputSchema', 'pure execute in cents'],
      },
      { title: 'Run and trace', minutes: 1.5, talkingPoints: ['tool-start args', 'tool-finish result', 'answer quotes total'] },
      { title: 'Registration', minutes: 1, talkingPoints: ['agent tools', 'new Mastra({ tools })', 'getToolById'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Next: validation with Zod'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 45_000,
    maxTimeoutMs: 90_000,
    budget: { maxSteps: 3, maxToolCalls: 2 },
    costNotice: 'Offline is free. Live mode makes two model calls (tool call + answer) with your provider key.',
  },
  tags: ['tools', 'createTool', 'zod'],
} satisfies LabDefinitionInput;
