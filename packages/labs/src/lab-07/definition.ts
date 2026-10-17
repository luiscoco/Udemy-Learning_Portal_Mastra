import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab07Definition = {
  id: 'lab-07',
  number: 7,
  title: 'Behavior and instruction variants',
  moduleId: 'module-02',
  summary:
    'Run the same prompt under two instruction profiles with identical settings, compare the outputs and save the comparison.',
  concept:
    'Instructions shape tone, length, format and boundaries, so changing them is the cheapest way to change how an agent behaves. ' +
    'To learn what a wording change really does, you run a controlled experiment: the same model, the same prompt and the same settings, with only the instructions different. ' +
    'If you change the model or the prompt at the same time, you can no longer tell which change caused the difference. ' +
    'Each variant gets a config hash, a short fingerprint of its label, model, instructions and settings, so every output stays linked to the exact configuration that produced it. ' +
    'Saving comparisons gives you a history to come back to when you decide which instructions go to production. ' +
    'Real models are not perfectly repeatable, so in live mode you would usually run each variant several times before trusting a difference. ' +
    'In offline mode the labelled simulator reacts to cues such as friendly, formal, concise or bullet, so you can practise the workflow for free.',
  objectives: [
    'Design a fair A/B comparison where only the instructions change',
    'Link every output to its configuration with a config hash',
    'Explain how specific instruction wording changes tone, length and format',
    'Save comparisons and use them to choose instructions',
  ],
  prerequisites: ['lab-06'],
  inputs: [
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model (shared by both variants)',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
    {
      kind: 'text',
      name: 'prompt',
      label: 'Prompt (shared by both variants)',
      minLength: 1,
      maxLength: 1000,
      default: 'How do I reset my password?',
      required: true,
    },
    {
      kind: 'text',
      name: 'labelA',
      label: 'Variant A label',
      minLength: 1,
      maxLength: 40,
      default: 'Friendly concise',
      required: true,
    },
    {
      kind: 'textarea',
      name: 'instructionsA',
      label: 'Variant A instructions',
      rows: 3,
      minLength: 10,
      maxLength: 2000,
      default: 'You are a friendly support agent. Be concise.',
      required: true,
    },
    {
      kind: 'text',
      name: 'labelB',
      label: 'Variant B label',
      minLength: 1,
      maxLength: 40,
      default: 'Formal bullets',
      required: true,
    },
    {
      kind: 'textarea',
      name: 'instructionsB',
      label: 'Variant B instructions',
      rows: 3,
      minLength: 10,
      maxLength: 2000,
      default: 'You are a formal support agent. Use bullet points.',
      required: true,
    },
  ],
  exampleInput: {
    modelId: 'openai/gpt-5-mini',
    prompt: 'How do I reset my password?',
    labelA: 'Friendly concise',
    instructionsA: 'You are a friendly support agent. Be concise.',
    labelB: 'Formal bullets',
    instructionsB: 'You are a formal support agent. Use bullet points.',
  },
  expectedOutput: {
    description:
      'Steps variant-A, variant-B and save-comparison; two outputs each with its configHash; identical settings verified; the comparison saved and listed first.',
    example: {
      settings: { modelId: 'openai/gpt-5-mini', maxSteps: 1, mode: 'offline', simulated: true },
      variants: [
        {
          label: 'Friendly concise',
          output: '[simulated openai/gpt-5-mini] Happy to help! About "How do I reset my password": here is a simulated answer.',
        },
        {
          label: 'Formal bullets',
          output:
            '[simulated openai/gpt-5-mini] Good day.\n- About "How do I reset my password": here is a simulated answer.\n- Check the details in the official documentation.\n- Ask again if you need more help.',
        },
      ],
      identicalSettingsVerified: true,
      outputsDiffer: true,
    },
  },
  guide: {
    procedure: [
      'Read both variants. Predict which output will be longer and which will use bullets.',
      'Run the example and compare the two outputs side by side in the result.',
      "Find each variant's configHash and note that the hashes differ.",
      "Change only variant B's label and run again: its configHash changes even though the output does not.",
      'Make both instructions identical and run: read the "variants differ" check.',
      'Run twice with the same inputs and look at recentComparisons: both runs were saved.',
    ],
    prediction: 'Which variant will produce the shorter answer, and why?',
    hints: [
      { level: 1, text: 'Look for words about length and format in each instruction.' },
      { level: 2, text: '"Be concise" limits the answer; "Use bullet points" changes the format but not the length limit.' },
      { level: 3, text: 'Variant A is shorter (one sentence); variant B lists three bullet points with a formal greeting.' },
    ],
    commonMistakes: [
      {
        mistake: 'Changing the model and the instructions in the same comparison.',
        fix: 'Hold the model and settings constant; change one thing.',
      },
      {
        mistake: 'Judging live models from a single run.',
        fix: 'Real models vary; repeat each variant several times before deciding.',
      },
      { mistake: 'Losing track of which instructions produced which output.', fix: 'Store a config hash with every output.' },
    ],
    challenge: {
      prompt:
        "Write a variant C that keeps variant A's friendliness but uses bullets, and compare it with variant B. Which words did you have to add?",
      successCriteria: ['Both outputs use bullet points', 'Only the greeting differs'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What must stay the same in a fair instruction comparison?',
      choices: ['Only the prompt', 'The model, prompt and settings', 'Nothing', 'Only the label'],
      correctIndex: 1,
      explanation: 'Only the instructions should change between variants.',
    },
    {
      id: 'q2',
      prompt: 'Why store a config hash with each output?',
      choices: [
        'To encrypt the output',
        'To link each output to the exact configuration that produced it',
        'Mastra requires it',
        'To make the model faster',
      ],
      correctIndex: 1,
      explanation: 'A hash identifies a configuration compactly and reproducibly.',
    },
    {
      id: 'q3',
      prompt: 'Why can one live run be misleading?',
      choices: [
        'Live models never change',
        'Real model outputs vary between runs',
        'Live mode ignores instructions',
        'Hashes change in live mode',
      ],
      correctIndex: 1,
      explanation: 'Sampling makes outputs vary; repeat runs before drawing conclusions.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'Two variants, shared settings, configHash.' },
    { path: 'store.ts', title: 'Comparison store', description: 'Save, prune and list comparisons.' },
    { path: 'shared/simulated.ts', title: 'Offline simulator' },
  ],
  exercise: {
    instructions:
      'In your project, write a `compareInstructions(prompt, variants)` helper that creates one agent per variant with the same model, runs them sequentially, and returns `{ label, configHash, text }` for each. Save the result to a JSON file.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'both-outputs', label: 'Both variants produced an output' },
    { id: 'identical-settings', label: 'Model, prompt and settings were identical for both variants' },
    { id: 'variants-differ', label: 'The two variants use different instructions' },
    { id: 'outputs-linked', label: 'Each output is linked to its configuration (configHash)' },
    { id: 'comparison-saved', label: 'The comparison was saved and appears in the recent list' },
  ],
  instructorOutline: {
    durationMinutes: 5,
    segments: [
      { title: 'Why controlled comparisons', minutes: 1, talkingPoints: ['Change one thing at a time'] },
      { title: 'Run A vs B', minutes: 1.5, talkingPoints: ['Same model and prompt', 'Read both outputs'] },
      { title: 'Config hashes', minutes: 1, talkingPoints: ['Hash per variant', 'Label change → new hash'] },
      {
        title: 'Saved history and live caveats',
        minutes: 1.5,
        talkingPoints: ['recentComparisons', 'Repeat live runs before deciding'],
      },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 45_000,
    maxTimeoutMs: 90_000,
    budget: { maxSteps: 2, maxTokens: 1500 },
    costNotice: 'Offline is free. Live mode makes two model calls (one per variant) with your provider key.',
  },
  tags: ['instructions', 'ab-testing', 'comparison'],
} satisfies LabDefinitionInput;
