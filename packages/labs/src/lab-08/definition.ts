import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab08Definition = {
  id: 'lab-08',
  number: 8,
  title: 'Token streaming',
  moduleId: 'module-02',
  summary:
    'Stream an answer token by token with agent.stream(), bridge it to the browser over SSE, and stop it with Cancel or a token budget.',
  concept:
    'Waiting for a complete answer can take seconds, so chat interfaces show text as the model produces it. ' +
    '`agent.stream(prompt)` returns immediately with a stream object whose fullStream yields chunks such as text-delta, step-finish and finish as they happen. ' +
    'On the server you read that stream with `for await` and forward each text delta to the browser; this platform sends them as Server-Sent Events, the same mechanism every lab uses for its timeline. ' +
    'The time to first token is what users feel as speed, so it is worth measuring separately from the total duration. ' +
    'Streaming must be cancellable: passing an abortSignal to agent.stream lets a Cancel button, a deadline or a closed browser tab stop the model call and free its resources. ' +
    'When a stream is aborted it simply ends, so your code must check the signal afterwards and report a cancellation instead of a partial success. ' +
    'You can also stop a stream yourself, for example after a token budget, by aborting your own controller.',
  objectives: [
    'Call agent.stream() and read text-delta chunks from fullStream',
    'Forward tokens to the browser as Server-Sent Events and measure time to first token',
    'Cancel a stream with an abort signal and report it correctly',
    'Stop a stream deliberately with a token budget',
  ],
  prerequisites: ['lab-07'],
  inputs: [
    {
      kind: 'textarea',
      name: 'prompt',
      label: 'Prompt',
      rows: 3,
      minLength: 1,
      maxLength: 2000,
      default: 'Explain how streaming responses work in a chat app.',
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
      kind: 'number',
      name: 'tokenDelayMs',
      label: 'Offline delay between tokens (ms)',
      help: 'Offline only: slows the simulated model so you can watch tokens arrive and press Cancel. Live models stream at their own pace.',
      min: 0,
      max: 500,
      step: 10,
      default: 120,
      required: true,
    },
    {
      kind: 'number',
      name: 'stopAfterTokens',
      label: 'Stop after N tokens (0 = no limit)',
      help: 'A token budget enforced by the server: the lab aborts the stream itself.',
      min: 0,
      max: 500,
      default: 0,
      required: true,
    },
  ],
  exampleInput: {
    prompt: 'Explain how streaming responses work in a chat app.',
    modelId: 'openai/gpt-5-mini',
    tokenDelayMs: 120,
    stopAfterTokens: 0,
  },
  expectedOutput: {
    description:
      'Many token events in the timeline before the result, a first-token time well below the total, and final text equal to the joined tokens.',
    example: {
      text: '[simulated openai/gpt-5-mini] About "Explain how streaming responses work in a chat app": here is a simulated answer. Check the details in the official documentation. Ask again if you need more help.',
      tokenEvents: 31,
      finishReason: 'stop',
      stoppedEarly: false,
    },
  },
  guide: {
    procedure: [
      'Run the example and watch the Live output fill in word by word.',
      'In the result, compare firstTokenMs with totalMs.',
      'Raise the offline delay to 400 ms, run, and press Cancel halfway: the run ends as cancelled, not succeeded.',
      'Set "Stop after N tokens" to 5 and run: the server stops the stream after five tokens.',
      'Look at chunkTypes in the result: text-delta is only one of the chunk types the stream yields.',
      'Optional (costs money): run in live mode and compare the first-token time of two models.',
    ],
    prediction:
      'With a 120 ms delay and about 31 tokens, roughly when will the first token appear, and when will the run finish?',
    hints: [
      { level: 1, text: 'The first token waits for one delay; the whole answer waits for all of them.' },
      { level: 2, text: 'First token ≈ 120 ms, total ≈ 31 × 120 ms.' },
      { level: 3, text: 'About 0.1 s for the first token and roughly 3.7 s in total — that gap is why streaming feels faster.' },
    ],
    commonMistakes: [
      {
        mistake: 'Awaiting the full text before sending anything to the browser.',
        fix: 'Forward each text-delta as soon as it arrives.',
      },
      {
        mistake: 'Not passing abortSignal to agent.stream.',
        fix: 'Without it, a closed tab keeps the model call (and the bill) running.',
      },
      {
        mistake: 'Reporting an aborted stream as success.',
        fix: 'Check the signal after the loop; aborted streams end quietly.',
      },
      {
        mistake: 'Buffering SSE in a proxy.',
        fix: 'Send Cache-Control: no-cache and disable proxy buffering for event streams.',
      },
    ],
    challenge: {
      prompt:
        'Add a "time between tokens" statistic: the average gap between consecutive text-delta chunks. Predict its value for the default offline delay.',
      successCriteria: ['Average gap close to the configured delay offline', 'Computed without storing every chunk'],
    },
    diagram: {
      kind: 'ascii',
      caption: 'From the model to your screen',
      source:
        'model ──deltas──▶ agent.stream().fullStream ──for await──▶ API emits token events ──SSE──▶ browser appends text\n   ▲                                                                                     │\n   └────────────── abortSignal (Cancel / deadline / tab closed / token budget) ◀──────────┘',
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Which chunk type carries new answer text in fullStream?',
      choices: ['step-finish', 'text-delta', 'finish', 'start'],
      correctIndex: 1,
      explanation: 'text-delta chunks carry incremental text in payload.text.',
    },
    {
      id: 'q2',
      prompt: 'Why measure time to first token separately?',
      choices: [
        'It is billed separately',
        'It is what users perceive as responsiveness',
        'Mastra requires it',
        'It equals total time',
      ],
      correctIndex: 1,
      explanation: 'Users judge speed by when text starts appearing.',
    },
    {
      id: 'q3',
      prompt: "What happens when the stream's abort signal fires?",
      choices: [
        'An exception is always thrown',
        'The stream ends; your code should check the signal',
        'The model keeps going',
        'The browser reloads',
      ],
      correctIndex: 1,
      explanation: 'The loop ends quietly, so check the signal to report cancellation.',
    },
    {
      id: 'q4',
      prompt: 'A learner closes the tab mid-answer. What should the server do?',
      choices: [
        'Keep generating to finish the answer',
        'Abort the model call and free resources',
        'Restart the stream',
        'Nothing',
      ],
      correctIndex: 1,
      explanation: 'Disconnects should cancel work; this platform aborts after a short grace period.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'agent.stream, token forwarding, abort and budget.' },
    { path: 'shared/agent-kit.ts', title: 'Agent kit' },
  ],
  exercise: {
    instructions:
      'In your project, add an Express route GET /chat/stream?q=… that calls agent.stream with an AbortController tied to req "close", writes each text-delta as an SSE "token" event, and ends with a "done" event. Test it with curl -N.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'tokens-streamed', label: 'The answer arrived as several token events' },
    { id: 'first-token-early', label: 'The first token arrived before the stream completed' },
    { id: 'text-equals-tokens', label: 'Joining the token events reproduces the final text' },
    { id: 'clean-finish', label: 'The stream finished normally (or at the token budget)' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Why streaming', minutes: 1, talkingPoints: ['Perceived speed', 'Time to first token'] },
      { title: 'agent.stream and fullStream', minutes: 1.5, talkingPoints: ['for await over chunks', 'text-delta payload.text'] },
      { title: 'SSE bridge', minutes: 1, talkingPoints: ['token events', 'Live output vs timeline'] },
      {
        title: 'Cancel and budgets',
        minutes: 1.5,
        talkingPoints: ['Cancel mid-stream', 'Stop after N tokens', 'Check the signal after the loop'],
      },
      { title: 'Disconnects and costs', minutes: 1, talkingPoints: ['Closed tab aborts the call', 'Live streaming costs'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 45_000,
    maxTimeoutMs: 90_000,
    budget: { maxSteps: 1, maxTokens: 1000 },
    costNotice: 'Offline is free. Live mode streams one model answer with your provider key; cancelling stops the call early.',
  },
  tags: ['streaming', 'sse', 'cancellation'],
} satisfies LabDefinitionInput;
