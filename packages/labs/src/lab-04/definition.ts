import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab04Definition = {
  id: 'lab-04',
  number: 4,
  title: 'Model and instructions',
  moduleId: 'module-01',
  summary: 'Choose a supported model id, edit the agent instructions and compare two models on exactly the same input.',
  concept:
    'Two settings shape almost everything an agent does: which model answers, and which instructions it follows. ' +
    'Mastra names models with "provider/model" strings, and every installed Mastra version ships a registry of the ids it knows, so a typo or a retired model can be caught before any request is sent. ' +
    'Models differ in price, speed, context length and features such as structured output or temperature control, which is why production apps keep an allowlist of models they have actually tested. ' +
    'Instructions are the system prompt: they set role, tone, format and limits, and small wording changes can visibly change answers. ' +
    'A fair comparison changes one thing at a time, so this lab sends the same instructions and the same prompt to two models and shows the answers side by side. ' +
    'Each run also writes a record of what was used, including model ids, a hash of the instructions and input sizes, so you can reproduce it later without ever storing an API key. ' +
    'In offline mode each model id gets a clearly labelled simulated style, so you can practise the workflow for free before spending tokens in live mode.',
  objectives: [
    'Recognise valid "provider/model" ids and fix an unsupported one using the validation message',
    'Change instructions and predict how the answer will change',
    'Compare two models fairly by holding instructions and prompt constant',
    'Read a run record and explain why it must never contain secrets',
  ],
  prerequisites: ['lab-03'],
  inputs: [
    {
      kind: 'text',
      name: 'modelId',
      label: 'Primary model id',
      help: `Type a "provider/model" id. Tested ids: ${DEFAULT_LIVE_MODELS.join(', ')}. Try a made-up one to see the validation.`,
      minLength: 3,
      maxLength: 80,
      default: 'openai/gpt-5-mini',
      required: true,
    },
    {
      kind: 'select',
      name: 'compareModelId',
      label: 'Comparison model',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'anthropic/claude-haiku-4-5',
      required: true,
    },
    {
      kind: 'textarea',
      name: 'instructions',
      label: 'Instructions',
      rows: 4,
      minLength: 10,
      maxLength: 2000,
      default: 'You are a friendly travel assistant. Keep answers concise.',
      help: 'Offline cues the simulator reacts to: friendly, formal, pirate, concise, bullet, Spanish.',
      required: true,
    },
    {
      kind: 'text',
      name: 'prompt',
      label: 'Prompt (sent to both models)',
      minLength: 1,
      maxLength: 500,
      default: 'What should I pack for Lisbon in April?',
      required: true,
    },
  ],
  exampleInput: {
    modelId: 'openai/gpt-5-mini',
    compareModelId: 'anthropic/claude-haiku-4-5',
    instructions: 'You are a friendly travel assistant. Keep answers concise.',
    prompt: 'What should I pack for Lisbon in April?',
  },
  expectedOutput: {
    description:
      'Two workflow steps (primary-model, comparison-model), two answers side by side and a run record with model ids, instructions hash and sizes.',
    example: {
      primary: {
        modelId: 'openai/gpt-5-mini',
        simulated: true,
        text: '[simulated openai/gpt-5-mini] Happy to help! About "What should I pack for Lisbon in April": here is a simulated answer.',
      },
      comparison: {
        modelId: 'anthropic/claude-haiku-4-5',
        simulated: true,
        text: '[simulated anthropic/claude-haiku-4-5] Happy to help!\n- About "What should I pack for Lisbon in April": here is a simulated answer.',
      },
      sameInputDelivered: true,
      record: {
        mode: 'offline',
        models: ['openai/gpt-5-mini', 'anthropic/claude-haiku-4-5'],
        instructionsChars: 58,
        promptChars: 39,
      },
    },
  },
  guide: {
    procedure: [
      'Open the Run tab and look at the preflight: it lists which models are enabled for live runs and whether each key is configured.',
      'Run the example. Compare the two answers and read the run record.',
      'Change the primary model to "openai/gpt-99-ultra" and press Run. Read the message next to the field.',
      'Fix the id, then remove "concise" from the instructions and run again: what changed in both answers?',
      'Add "Use bullet points." to the instructions and run once more.',
      'Note the instructions hash: change one word and confirm the hash changes too.',
    ],
    prediction: 'If you delete the word "concise" from the instructions, will one answer or both answers change?',
    hints: [
      { level: 1, text: 'Both agents receive the same instructions, so an instruction change affects both.' },
      { level: 2, text: 'Model choice changes the style (sentence vs list); instructions change content and length.' },
      { level: 3, text: 'Both answers get longer (three points instead of one) while keeping their own model style.' },
    ],
    commonMistakes: [
      {
        mistake: 'Comparing models while also changing the instructions.',
        fix: 'Change one variable at a time; keep instructions and prompt identical.',
      },
      {
        mistake: 'Guessing model ids from memory.',
        fix: 'Use ids from the registry/allowlist; the validation message lists tested ids.',
      },
      {
        mistake: 'Logging the full config object including API keys.',
        fix: 'Record model ids and hashes; keys stay in the server environment.',
      },
    ],
    challenge: {
      prompt:
        'Write instructions that make both simulated models answer in Spanish with bullet points and a formal greeting, using as few words as possible.',
      successCriteria: ['Both answers are in Spanish', 'Both use "- " bullets', 'Both start with "Good day."'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Which model id is in the correct format for Mastra?',
      choices: ['gpt-5-mini', 'openai:gpt-5-mini', 'openai/gpt-5-mini', 'OPENAI_GPT5_MINI'],
      correctIndex: 2,
      explanation: 'Mastra model router ids are "provider/model".',
    },
    {
      id: 'q2',
      prompt: 'Why keep an allowlist of tested models?',
      choices: [
        'Mastra requires it',
        'To control cost, features and behaviour you have actually verified',
        'To hide models from Studio',
        'Because ids change every day',
      ],
      correctIndex: 1,
      explanation: 'Models differ in price, features and behaviour; an allowlist keeps production predictable.',
    },
    {
      id: 'q3',
      prompt: 'What makes a model comparison fair?',
      choices: [
        'Different prompts per model',
        'Same instructions and prompt, only the model changes',
        'Running each model once on different days',
        'Using the cheapest model first',
      ],
      correctIndex: 1,
      explanation: 'Hold everything constant except the variable you are testing.',
    },
    {
      id: 'q4',
      prompt: 'What belongs in a run record?',
      choices: ['The API key', 'Model ids, instruction hash and sizes', 'The .env file', 'Nothing; records are unsafe'],
      correctIndex: 1,
      explanation: 'Records make runs reproducible without exposing secrets.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'Registry validation, side-by-side agents, run record.' },
    { path: 'shared/simulated.ts', title: 'Offline simulator', description: 'How simulated models react to instruction cues.' },
  ],
  exercise: {
    instructions:
      'In your project, read the model id from an environment variable (e.g. AGENT_MODEL) with a default, and validate it at startup so a typo fails fast with a helpful message instead of at the first request.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'models-supported', label: 'Both model ids exist in the installed Mastra registry' },
    { id: 'both-outputs', label: 'Both models produced an answer for the same prompt' },
    { id: 'same-input', label: 'Both models received identical instructions and prompt' },
    { id: 'record-complete', label: 'Run record lists models, instructions hash and lengths' },
    { id: 'record-secret-free', label: 'Run record contains no API keys' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      {
        title: 'Model ids and the registry',
        minutes: 1.5,
        talkingPoints: ['"provider/model"', 'Registry ships with Mastra', 'Allowlist via LIVE_MODELS'],
      },
      { title: 'Fair comparison', minutes: 1.5, talkingPoints: ['Run the example', 'Same input, two models'] },
      { title: 'Validation in action', minutes: 1, talkingPoints: ['Type gpt-99-ultra', 'Field-level error with tested ids'] },
      { title: 'Instruction edits', minutes: 1.5, talkingPoints: ['Remove "concise"', 'Add bullets', 'Hash changes'] },
      { title: 'Run records', minutes: 0.5, talkingPoints: ['Reproducible, secret-free'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 45_000,
    maxTimeoutMs: 90_000,
    budget: { maxSteps: 2, maxTokens: 1000 },
    costNotice: 'Offline is free. Live mode makes two model calls (one per model) with your provider keys.',
  },
  tags: ['models', 'instructions', 'comparison'],
} satisfies LabDefinitionInput;
