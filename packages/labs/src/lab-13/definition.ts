import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const question = 'Are TSH-0042 and MUG-0007 in stock, and what do they cost?';

export const lab13Definition = {
  id: 'lab-13',
  number: 13,
  title: 'Multiple tools',
  moduleId: 'module-03',
  summary: 'Give an agent an inventory lookup and a currency formatter, and watch it choose, parallelise and chain tool calls.',
  concept:
    'Real agents usually have several tools and must decide which to call, in what order, and with which arguments. ' +
    'Mastra runs this as a loop: the model can request one or more tool calls in a step, Mastra executes them, feeds the results back, and the model takes another step until it can answer. ' +
    'Independent calls, such as looking up two SKUs, can happen in the same step, while dependent calls form a chain, such as formatting a price that the lookup returned. ' +
    'maxSteps limits how many of these steps an agent may take, which bounds cost and prevents endless loops. ' +
    'Each call has its own toolCallId, so logs and traces can show every call separately with its arguments, result and duration. ' +
    'Clear, non-overlapping tool descriptions are what let the model pick the right tool, and instructions such as "never invent stock or prices" keep it grounded in tool results. ' +
    'Both tools here are mocks with fixed data and fixed exchange rates, so results are identical on every run.',
  objectives: [
    'Give an agent several tools with distinct, clear descriptions',
    'Recognise parallel versus chained tool calls in a trace',
    'Bound the agent loop with maxSteps',
    'Verify that the final answer is grounded in tool results',
  ],
  prerequisites: ['lab-12'],
  inputs: [
    {
      kind: 'text',
      name: 'question',
      label: 'Customer question',
      help: 'Mention SKUs like TSH-0042, MUG-0007, CAP-0100 (or an unknown one).',
      minLength: 1,
      maxLength: 500,
      default: question,
      required: true,
    },
    {
      kind: 'select',
      name: 'currency',
      label: 'Show prices in',
      options: [
        { value: 'USD', label: 'USD' },
        { value: 'EUR', label: 'EUR (rate 0.92)' },
        { value: 'GBP', label: 'GBP (rate 0.79)' },
        { value: 'JPY', label: 'JPY (rate 151.2)' },
      ],
      default: 'EUR',
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
  exampleInput: { question, currency: 'EUR', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'Two parallel inventoryLookup calls, then one formatCurrency call for the in-catalog prices, then an answer grounded in the results (prices in EUR).',
    example: {
      skus: ['TSH-0042', 'MUG-0007'],
      answer: 'TSH-0042 (Organic cotton T-shirt): 12 in stock, €18.39. MUG-0007 (Ceramic mug): out of stock, €11.50.',
    },
  },
  guide: {
    procedure: [
      'Read both tool descriptions in the Source tab. Which one would you call first?',
      'Run the example. In the trace, find the two inventoryLookup calls made in the same step.',
      'Find the formatCurrency calls and check that their amountCents come from the lookups.',
      'Change the currency to JPY and run again.',
      'Ask about an unknown SKU such as ZZZ-9999: what does the agent do without a price?',
      'Optional (costs money): run live and compare the real model’s tool choices with the offline script.',
    ],
    prediction: 'How many tool calls in total will the example make, and how many model steps?',
    hints: [
      { level: 1, text: 'Two SKUs are looked up independently.' },
      { level: 2, text: 'Both are found, so both prices are formatted.' },
      { level: 3, text: 'Four tool calls (2 lookups + 2 formats) over three model steps: lookups, formats, answer.' },
    ],
    commonMistakes: [
      { mistake: 'Overlapping tool descriptions.', fix: 'Describe each tool’s single job and its input format.' },
      { mistake: 'No maxSteps limit.', fix: 'Set maxSteps so a confused model cannot loop forever.' },
      {
        mistake: 'Letting the model guess prices.',
        fix: 'Instruct it to use tool results only, and check the answer against them.',
      },
      { mistake: 'Formatting money with toFixed and a "$" string.', fix: 'Use Intl.NumberFormat with the currency code.' },
    ],
    challenge: {
      prompt:
        'Add a third tool "checkShipping" (sku, country) and ask a question that needs all three tools. How many steps does the agent need now?',
      successCriteria: ['The trace shows three different tools', 'maxSteps is high enough but still bounded'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Two SKUs need to be looked up. How can the agent do it?',
      choices: [
        'Only one at a time across two steps',
        'Two tool calls in the same step',
        'It must ask the user',
        'It cannot use the same tool twice',
      ],
      correctIndex: 1,
      explanation: 'Independent calls can be issued together in one step.',
    },
    {
      id: 'q2',
      prompt: 'What does maxSteps limit?',
      choices: [
        'Tokens per answer',
        'How many model/tool-call rounds the agent may take',
        'The number of tools',
        'Concurrent users',
      ],
      correctIndex: 1,
      explanation: 'Each step is one model call plus any tool executions it requested.',
    },
    {
      id: 'q3',
      prompt: 'Why does each tool call have a toolCallId?',
      choices: [
        'For billing',
        'To match each call with its result and trace it separately',
        'Mastra requires UUIDs for tools',
        'To cache results',
      ],
      correctIndex: 1,
      explanation: 'Ids pair calls with results, even when several calls run in one step.',
    },
  ],
  sourceFiles: [
    { path: 'tools.ts', title: 'The two tools', description: 'Mock inventory and fixed-rate currency formatting.' },
    { path: 'run.ts', title: 'Lab run', description: 'Agent with two tools, offline script, grounding checks.' },
  ],
  exercise: {
    instructions:
      'In your project, give one agent two tools with clearly separated descriptions, set maxSteps, and write a test that asserts the order of tool calls from result.steps (or the stream) for a question that needs both.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'lookup-each-sku', label: 'inventoryLookup was called for every SKU' },
    { id: 'chained', label: 'formatCurrency used the prices returned by inventoryLookup' },
    { id: 'separate-calls', label: 'Each tool call was logged separately with its own id' },
    { id: 'answer-grounded', label: 'The answer shows each found price as formatted by the tool' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Agents with many tools', minutes: 1, talkingPoints: ['The agent loop', 'maxSteps'] },
      { title: 'Parallel calls', minutes: 1.5, talkingPoints: ['Two lookups in one step', 'toolCallIds'] },
      { title: 'Chaining', minutes: 1.5, talkingPoints: ['Price from lookup → formatCurrency'] },
      { title: 'Grounding', minutes: 1, talkingPoints: ['Unknown SKU', 'Never invent prices'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Next: calling a real external API'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 5, maxToolCalls: 8 },
    costNotice: 'Offline is free. Live mode makes about three model calls (one per step) with your provider key.',
  },
  tags: ['tools', 'multi-tool', 'agent-loop'],
} satisfies LabDefinitionInput;
