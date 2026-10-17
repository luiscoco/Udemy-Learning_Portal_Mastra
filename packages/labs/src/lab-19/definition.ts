import type { LabDefinitionInput } from '@mlp/contracts';
import { CAPABILITIES, EFFORT_ORDER, MODELS, modelsWhere } from './capabilities.js';

const prompt =
  'Plan a three-stop walk in Lisbon: Alfama, Belém Tower and LX Factory. Look up each stop with lookupPlace, then write the plan.';

const label = (m: (typeof MODELS)[number]) => {
  const c = CAPABILITIES[m];
  const parts = [c.temperature ? 'temperature' : 'no temperature', c.effort.length ? 'reasoning effort' : null].filter(Boolean);
  return `${m} (${parts.join(', ')})`;
};

export const lab19Definition = {
  id: 'lab-19',
  number: 19,
  title: 'Execution options',
  moduleId: 'module-04',
  summary:
    'Choose a model and its generation options, bound the agent loop and its time, and record the options that were really applied, with the UI offering only what the model supports.',
  concept:
    'Every agent call carries execution options: the model, generation settings such as temperature and maxOutputTokens, provider options such as reasoning effort, and loop limits such as maxSteps. ' +
    'In Mastra you pass them per call: agent.generate(prompt, { maxSteps, modelSettings: { temperature, maxOutputTokens, timeout: { stepMs } }, providerOptions }). ' +
    'Models differ in what they accept, and some providers silently ignore unsupported settings; for example, temperature sent to openai/gpt-5-mini returns no error and no warning. ' +
    'Mastra’s provider registry describes each model, through modelSupportsTemperature() and getModelReasoningOptions(), so an app can offer only the options a model really supports. ' +
    'The server must enforce the same rules, because a hand-written API request can bypass any UI. ' +
    'Limits keep runs bounded: maxSteps caps the tool loop, and when it is reached the run ends without a final answer, while a too-small maxOutputTokens ends with finishReason "length". ' +
    'A per-call timeout (modelSettings.timeout.stepMs) stops a provider that stalls. ' +
    'Recording the effective options (what was applied, what was omitted and why, and what was left to the provider default) is what makes a run explainable afterwards.',
  objectives: [
    'Pass model settings, provider options and maxSteps per call',
    'Derive supported options per model from Mastra’s provider registry',
    'Enforce supported values on the server, not only in the UI',
    'Recognise and report step and token limits being hit',
  ],
  prerequisites: ['lab-18'],
  inputs: [
    {
      kind: 'textarea',
      name: 'prompt',
      label: 'Request',
      help: 'Known stops: Alfama, Belém Tower, LX Factory, São Jorge Castle. Each one needs one lookup step.',
      minLength: 1,
      maxLength: 1000,
      default: prompt,
      required: true,
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model',
      help: 'Capabilities come from the installed Mastra provider registry.',
      options: MODELS.map((m) => ({ value: m, label: label(m) })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
    {
      kind: 'select',
      name: 'temperature',
      label: 'Temperature',
      help: 'Shown only for models that support it.',
      visibleWhen: { field: 'modelId', in: modelsWhere((c) => c.temperature) },
      options: [
        { value: 'provider-default', label: 'Provider default' },
        { value: '0', label: '0 (most deterministic)' },
        { value: '0.3', label: '0.3' },
        { value: '0.7', label: '0.7' },
        { value: '1', label: '1 (most varied)' },
      ],
      default: 'provider-default',
      required: true,
    },
    {
      kind: 'select',
      name: 'reasoningEffort',
      label: 'Reasoning effort',
      help: 'Shown only for models with an effort control, with only the values they accept.',
      visibleWhen: { field: 'modelId', in: modelsWhere((c) => c.effort.length > 0) },
      options: [
        { value: 'provider-default', label: 'Provider default' },
        ...EFFORT_ORDER.map((e) => ({
          value: e,
          label: e,
          visibleWhen: { field: 'modelId', in: modelsWhere((c) => c.effort.includes(e)) },
        })),
      ],
      default: 'low',
      required: true,
    },
    {
      kind: 'number',
      name: 'maxOutputTokens',
      label: 'Max output tokens per call',
      help: 'For reasoning models this budget also covers hidden reasoning tokens.',
      min: 64,
      max: 2000,
      step: 1,
      default: 1500,
      required: true,
    },
    { kind: 'number', name: 'maxSteps', label: 'Max agent steps', min: 1, max: 6, step: 1, default: 4, required: true },
    {
      kind: 'number',
      name: 'stepTimeoutMs',
      label: 'Per-call timeout (ms)',
      min: 1000,
      max: 60000,
      step: 500,
      default: 20000,
      required: true,
    },
  ],
  exampleInput: {
    prompt,
    modelId: 'openai/gpt-5-mini',
    reasoningEffort: 'low',
    maxOutputTokens: 1500,
    maxSteps: 4,
    stepTimeoutMs: 20000,
  },
  expectedOutput: {
    description:
      'Three lookups in three steps, then the plan in the fourth step. The effective options show reasoningEffort "low" sent as an OpenAI provider option. Temperature is listed as omitted (not supported by gpt-5-mini), and every model call received the same settings.',
    example: {
      effective: {
        modelId: 'openai/gpt-5-mini',
        maxSteps: 4,
        modelSettings: { maxOutputTokens: 1500, timeout: { stepMs: 20000 } },
        providerOptions: { openai: { reasoningEffort: 'low' } },
        omitted: [{ option: 'temperature', reason: 'not supported by openai/gpt-5-mini (Mastra provider registry)' }],
        providerDefaults: [],
      },
      stepsUsed: 4,
      finishReason: 'stop',
      limitsHit: [],
      lookups: ['Alfama', 'Belém Tower', 'LX Factory'],
    },
  },
  guide: {
    procedure: [
      'Open capabilities.ts and options.ts in the Source tab: where do the per-model options come from?',
      'With gpt-5-mini selected, notice there is no temperature control. Switch to claude-haiku-4-5: temperature appears and reasoning effort disappears.',
      'Run the example and open “Effective options” in the result: what was applied, omitted and defaulted?',
      'Set Max agent steps to 2 and run: the loop stops after two lookups and there is no plan.',
      'Set Max output tokens to 64 and run: the plan is cut off and the finish reason is "length".',
      'Optional (costs money): run live with reasoning effort minimal and then high, and compare the usage.',
    ],
    prediction: 'With three stops and maxSteps 3, will you get a plan?',
    hints: [
      { level: 1, text: 'Each lookup is one step, and writing the plan needs one more.' },
      { level: 2, text: 'The offline model looks stops up one at a time.' },
      {
        level: 3,
        text: 'No: three steps are spent on lookups, so the loop ends with finishReason "tool-calls" and limitsHit: ["maxSteps"]. You need 4.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Showing every setting for every model.',
        fix: 'Use modelSupportsTemperature() and getModelReasoningOptions() to offer only what each model supports.',
      },
      { mistake: 'Validating only in the UI.', fix: 'Re-check the same rules on the server; API calls bypass the form.' },
      { mistake: 'Treating an empty answer as success.', fix: 'Check finishReason and report the limit that was hit.' },
      {
        mistake: 'A tiny maxOutputTokens on a reasoning model.',
        fix: 'Reasoning tokens count too; leave room or lower the effort.',
      },
    ],
    challenge: {
      prompt:
        'Expose Anthropic’s thinking budget (getModelReasoningOptions reports budget_tokens with min 1024) as a provider option. Which other settings must change together, and how would you record them?',
      successCriteria: [
        'The budget is offered only for claude-haiku-4-5',
        'maxOutputTokens stays above the budget and the coupling is recorded',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'How do you cap how many model/tool rounds an agent may take in one call?',
      choices: ['temperature', 'maxSteps', 'maxOutputTokens', 'topP'],
      correctIndex: 1,
      explanation: 'maxSteps bounds the agent loop.',
    },
    {
      id: 'q2',
      prompt: 'What happens when temperature is sent to openai/gpt-5-mini in this setup?',
      choices: ['An error', 'It is silently ignored', 'It switches models', 'It doubles the cost'],
      correctIndex: 1,
      explanation: 'The spike saw no error and no warning, which is why the UI must not offer it.',
    },
    {
      id: 'q3',
      prompt: 'A run ends with finishReason "length". What limit was hit?',
      choices: ['maxSteps', 'maxOutputTokens', 'The run deadline', 'The rate limit'],
      correctIndex: 1,
      explanation: 'The model ran out of output tokens.',
    },
    {
      id: 'q4',
      prompt: 'Why record effective options instead of the requested ones?',
      choices: [
        'They are always the same',
        'Some requests are omitted, clamped or defaulted, and the record must show what really ran',
        'To save tokens',
        'Mastra requires it',
      ],
      correctIndex: 1,
      explanation: 'Effective options explain the run’s behaviour and cost.',
    },
  ],
  sourceFiles: [
    {
      path: 'capabilities.ts',
      title: 'Model capabilities',
      description: 'modelSupportsTemperature() and getModelReasoningOptions() per model.',
    },
    {
      path: 'options.ts',
      title: 'Validation and effective options',
      description: 'Server-side rules and the resolver that records every decision.',
    },
    {
      path: 'run.ts',
      title: 'Lab run',
      description: 'Lookup tool loop with maxSteps, modelSettings, providerOptions and limits.',
    },
  ],
  exercise: {
    instructions:
      'In your project, build the generate() options from user settings with a resolver that drops unsupported settings (using Mastra’s registry helpers) and returns the effective options; log them with every run and test that temperature is never sent to a model that does not support it.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'supported-only', label: 'Only options the model supports were sent' },
    {
      id: 'effective-recorded',
      label: 'Every option is recorded as applied, omitted with a reason, or left to the provider default',
    },
    { id: 'calls-match-effective', label: 'Every model call received exactly the effective settings' },
    { id: 'steps-bounded', label: 'The agent loop stayed within maxSteps' },
    { id: 'answer-complete', label: 'The run finished normally with a full answer (no limit hit)' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      {
        title: 'Options on every call',
        minutes: 1,
        talkingPoints: ['modelSettings, providerOptions, maxSteps', 'Per call, not global'],
      },
      { title: 'Models differ', minutes: 1.5, talkingPoints: ['Registry helpers', 'UI shows only supported options'] },
      { title: 'Server enforcement', minutes: 1, talkingPoints: ['422 when the UI is bypassed', 'Effective options record'] },
      { title: 'Limits', minutes: 2, talkingPoints: ['maxSteps 2 → no plan', 'maxOutputTokens 64 → length', 'stepMs timeout'] },
      {
        title: 'Wrap-up',
        minutes: 1.5,
        talkingPoints: ['Reasoning effort changes cost (live)', 'Next: input and output processing'],
      },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 6, maxToolCalls: 6 },
    costNotice:
      'Offline is free. Live mode makes up to “Max agent steps” model calls; higher reasoning effort uses more output tokens (in a spike, minimal used 0 reasoning tokens and high used 448 for the same question).',
  },
  tags: ['execution-options', 'model-settings', 'limits', 'capabilities'],
} satisfies LabDefinitionInput;
