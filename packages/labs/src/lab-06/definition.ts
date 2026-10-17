import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab06Definition = {
  id: 'lab-06',
  number: 6,
  title: 'Basic text generation',
  moduleId: 'module-02',
  summary:
    'Send a prompt with agent.generate(), show the answer with its request metadata, and fall back safely when the model fails.',
  concept:
    'The simplest way to use an agent is `agent.generate(prompt)`: it sends your instructions and the prompt to the model, waits for the complete answer and returns a result object. ' +
    "The result's text property holds the answer, and the same object carries metadata such as finishReason, token usage, the provider's response id and Mastra's own runId. " +
    'Recording that metadata together with your own request and correlation ids lets you trace any answer back to the request that produced it when a user reports a problem. ' +
    'Before calling the model you validate the input: an empty or oversized prompt is rejected with a clear message instead of wasting a paid request. ' +
    'Model calls can fail for reasons outside your control, such as provider outages, rate limits or an empty answer, so a production app catches those cases and shows a safe fallback message. ' +
    'The fallback must never leak raw provider errors, stack traces or keys to the user; the details go to server logs instead. ' +
    'In offline mode you can inject a provider error or an empty answer to see the fallback path without waiting for a real outage.',
  objectives: [
    'Call agent.generate() and display result.text',
    'Record request metadata (request id, correlation id, model, duration, usage) for every answer',
    'Reject empty prompts before calling the model',
    'Show a safe fallback when the model fails or answers with nothing',
  ],
  prerequisites: ['lab-05'],
  inputs: [
    {
      kind: 'textarea',
      name: 'prompt',
      label: 'Prompt',
      rows: 3,
      minLength: 1,
      maxLength: 2000,
      default: 'Explain what an API key is in one paragraph.',
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
    {
      kind: 'select',
      name: 'failureMode',
      label: 'Fault injection (offline only)',
      options: [
        { value: 'none', label: 'None — normal answer' },
        { value: 'provider-error', label: 'Provider error (HTTP 503)' },
        { value: 'empty-response', label: 'Empty answer' },
      ],
      default: 'none',
      required: true,
    },
    {
      kind: 'text',
      name: 'fallbackText',
      label: 'Fallback message',
      maxLength: 300,
      default: "Sorry, I couldn't answer right now. Please try again in a moment.",
      required: true,
    },
  ],
  exampleInput: {
    prompt: 'Explain what an API key is in one paragraph.',
    modelId: 'openai/gpt-5-mini',
    failureMode: 'none',
    fallbackText: "Sorry, I couldn't answer right now. Please try again in a moment.",
  },
  expectedOutput: {
    description:
      'Steps validate-prompt and generate, the answer text, usedFallback false and metadata with request id, correlation id, model, finishReason and duration.',
    example: {
      text: '[simulated openai/gpt-5-mini] About "Explain what an API key is in one paragraph": here is a simulated answer.',
      usedFallback: false,
      fallbackReason: null,
      metadata: { modelId: 'openai/gpt-5-mini', simulated: true, finishReason: 'stop' },
    },
  },
  guide: {
    procedure: [
      'Run the example and read the answer and the metadata block in the result.',
      'Find the request id in the metadata and the same id in the response headers of your browser dev tools (x-request-id).',
      'Clear the prompt and press Run: the form refuses it. Type only spaces and try again — the server refuses it too.',
      'Set fault injection to "Provider error" and run. Read the timeline: generate failed, fallback succeeded.',
      'Set fault injection to "Empty answer" and run. Compare the fallback reason.',
      'Change the fallback message and run with a provider error again.',
    ],
    prediction: 'When the provider returns HTTP 503, what will the learner see, and where does the 503 appear?',
    hints: [
      { level: 1, text: 'The learner-facing text and the server log are two different places.' },
      {
        level: 2,
        text: 'The answer area shows your fallback message; the timeline log mentions the failure without raw details.',
      },
      {
        level: 3,
        text: 'Text = your fallback message; the warn log says "The model call failed (HTTP 503)"; no stack trace anywhere.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Calling the model with an empty prompt.',
        fix: 'Validate and trim input first; reject it with a clear message.',
      },
      {
        mistake: 'Showing error.message from the provider to users.',
        fix: 'Show a friendly fallback; log a sanitised summary on the server.',
      },
      { mistake: 'Treating an empty answer as success.', fix: 'Check result.text and fall back when it is blank.' },
      {
        mistake: 'Not recording which model and request produced an answer.',
        fix: 'Store request id, correlation id, model and usage with each answer.',
      },
    ],
    challenge: {
      prompt:
        'Write the fallback logic so that a cancelled request (user pressed Cancel) is NOT replaced by the fallback message. Why is that different from a provider error?',
      successCriteria: ['Cancellation ends the run as cancelled', 'Provider errors still use the fallback'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Where is the answer text in an agent.generate() result?',
      choices: ['result.output', 'result.text', 'result.response.body', 'result.messages[0]'],
      correctIndex: 1,
      explanation: 'generate() resolves to a result with a text property, plus usage and finishReason.',
    },
    {
      id: 'q2',
      prompt: 'A provider returns HTTP 503. What should the user see?',
      choices: ['The raw error and stack trace', 'A friendly fallback message', 'An empty page', 'The API key so they can retry'],
      correctIndex: 1,
      explanation: 'Users get a safe fallback; details stay in server logs.',
    },
    {
      id: 'q3',
      prompt: 'Why record a correlation id with each answer?',
      choices: [
        'It makes the model faster',
        'To trace a reported answer back to the exact request',
        'It is required by OpenAI',
        'To bill the user',
      ],
      correctIndex: 1,
      explanation: 'Correlation ids connect browser requests, server logs and model calls.',
    },
    {
      id: 'q4',
      prompt: 'Where should empty prompts be rejected?',
      choices: ['Only in the browser', 'Only by the model', 'In the browser for UX and on the server for safety', 'Nowhere'],
      correctIndex: 2,
      explanation: 'Client checks help users; server validation is the real guard.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'generate(), metadata and safe fallback.' },
    { path: 'shared/agent-kit.ts', title: 'Agent kit', description: 'Routes Mastra logs into the run stream.' },
  ],
  exercise: {
    instructions:
      'In your project, write an `answer(prompt)` function around agent.generate() that trims and rejects empty prompts, catches provider failures and empty answers, returns a fallback message, and logs request metadata (model, finishReason, usage, duration) without the raw error.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'response-displayed', label: 'A non-empty answer is shown to the learner' },
    { id: 'metadata-recorded', label: 'Request metadata recorded (request id, correlation id, model, duration)' },
    { id: 'fallback-correct', label: 'Fallback used exactly when the model failed' },
    { id: 'no-raw-error', label: 'Raw provider errors are never shown to the learner' },
  ],
  instructorOutline: {
    durationMinutes: 5,
    segments: [
      {
        title: 'generate() in one line',
        minutes: 1,
        talkingPoints: ['agent.generate(prompt)', 'result.text, usage, finishReason'],
      },
      { title: 'Metadata', minutes: 1, talkingPoints: ['request + correlation ids', 'responseId and Mastra runId'] },
      { title: 'Input validation', minutes: 1, talkingPoints: ['Empty prompt blocked in UI and API'] },
      {
        title: 'Failures and fallback',
        minutes: 1.5,
        talkingPoints: ['Inject 503', 'Inject empty answer', 'No raw errors to users'],
      },
      { title: 'Wrap-up', minutes: 0.5, talkingPoints: ['Next: instruction variants'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 30_000,
    maxTimeoutMs: 60_000,
    budget: { maxSteps: 1, maxTokens: 800 },
    costNotice: 'Offline is free. Live mode makes one model call with your provider key.',
  },
  tags: ['generate', 'metadata', 'fallback'],
} satisfies LabDefinitionInput;
