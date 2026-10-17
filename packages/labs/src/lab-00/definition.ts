import type { LabDefinitionInput } from '@mlp/contracts';

export const lab00Definition = {
  id: 'lab-00',
  number: 0,
  title: 'Dummy Lab 00',
  moduleId: 'module-00',
  summary: 'Tour the platform: run a deterministic lab, watch its events stream, cancel it and pass its checks — at zero cost.',
  concept:
    'Every lab on this platform runs on the server, never in your browser. ' +
    'When you press Run, the web app sends your inputs to the API, which validates them with a Zod schema before anything executes. ' +
    'The API starts a run, gives it a unique run id and a deadline, and streams progress back to you as Server-Sent Events. ' +
    'Events have types such as log, token, tool-start, tool-finish and workflow-step, so you can see exactly what the lab did and in which order. ' +
    'Every run ends with exactly one complete event whose status is succeeded, failed, cancelled or timeout. ' +
    'Dummy Lab 00 imitates an agent without calling any AI model: it counts words with a pretend tool and streams an echo token by token. ' +
    'Because it is deterministic, the same input always produces the same output, which is how automated checks can grade it. ' +
    'Later labs replace the pretend parts with real Mastra agents, tools and workflows while keeping this same event contract.',
  objectives: [
    'Start a lab run and read its streamed event timeline',
    'Explain why every run ends with exactly one complete event',
    'Cancel a run and observe the cancelled status',
    'Trigger a validation error and a simulated failure and interpret their error codes',
  ],
  prerequisites: [],
  inputs: [
    {
      kind: 'text',
      name: 'message',
      label: 'Message',
      help: 'Any text from 1 to 200 characters. It is echoed back word by word.',
      maxLength: 200,
      minLength: 1,
      placeholder: 'Hello Mastra',
      default: 'Hello Mastra learners',
      required: true,
    },
    {
      kind: 'number',
      name: 'delayMs',
      label: 'Delay per token (ms)',
      help: 'Slow the stream down so you have time to press Cancel. 0–1000.',
      min: 0,
      max: 1000,
      step: 50,
      default: 150,
      required: true,
    },
    {
      kind: 'boolean',
      name: 'simulateFailure',
      label: 'Simulate a provider failure',
      help: 'Fault injection: fails after the analysis step with a retryable PROVIDER_ERROR.',
      default: false,
      required: false,
    },
  ],
  exampleInput: { message: 'Hello Mastra learners', delayMs: 150, simulateFailure: false },
  expectedOutput: {
    description:
      'Two workflow steps (analyze, respond), one wordCounter tool call, one token per word of the echo, and a result whose checks all pass.',
    example: {
      echo: 'Echo: Hello Mastra learners',
      wordCount: 3,
      characterCount: 21,
      reversed: 'srenrael artsaM olleH',
    },
  },
  guide: {
    procedure: [
      'Open the Learn tab and read the concept and objectives.',
      'Switch to Run, keep the example input and press Run. Watch the timeline fill in.',
      'Inspect the tool-start and tool-finish events for wordCounter and compare its result with the final output.',
      'Set the delay to 800 ms, press Run, then press Cancel before it finishes. Note the error and complete events.',
      'Clear the message and press Run to see a validation error before any run starts.',
      'Enable "Simulate a provider failure" and run again. Note the error code and the retryable flag.',
    ],
    prediction:
      'Before running: how many token events will the message "Hello Mastra learners" produce, and what will the final complete status be?',
    hints: [
      { level: 1, text: 'Each word of the echo, including the "Echo:" prefix, becomes one token event.' },
      { level: 2, text: 'The echo is "Echo: " plus your message, so three words become four tokens.' },
      {
        level: 3,
        text: 'Four token events, two workflow steps with running and success each, one tool call, then result and complete with status succeeded.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Expecting the browser to run the lab code.',
        fix: 'The browser only renders events; execution happens in the API process.',
      },
      {
        mistake: 'Treating a cancelled run as a failure of the lab.',
        fix: 'Cancelled and timeout are distinct terminal statuses; failed means the lab itself raised an error.',
      },
      {
        mistake: 'Retrying non-retryable errors such as VALIDATION_FAILED.',
        fix: 'Check the retryable flag; fix the input instead of retrying.',
      },
    ],
    challenge: {
      prompt:
        'Find an input whose run takes longer than the lab deadline (10 s) and observe the timeout status. What is the smallest delay that guarantees it?',
      successCriteria: ['A run ends with complete status "timeout"', 'You can explain the delay × token count calculation'],
    },
    diagram: {
      kind: 'mermaid',
      caption: 'How a run flows from the browser to the server and back',
      source:
        'sequenceDiagram\n  participant B as Browser\n  participant A as API\n  participant L as Lab\n  B->>A: POST /api/labs/lab-00/runs\n  A->>A: validate input (Zod)\n  A-->>B: 202 runId\n  B->>A: GET /api/runs/:id/events (SSE)\n  A->>L: run(ctx, input)\n  L-->>A: log / tool / token events\n  A-->>B: events stream\n  L-->>A: return output\n  A-->>B: result + complete',
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Where does lab code execute on this platform?',
      choices: ['In the browser', 'In the API server process', 'On the AI provider', 'In a browser extension'],
      correctIndex: 1,
      explanation: 'The browser only sends inputs and renders events. Keys and Mastra stay on the server.',
    },
    {
      id: 'q2',
      prompt: 'How many complete events does a run emit?',
      choices: ['Zero or one', 'Exactly one, always last', 'One per step', 'One per token'],
      correctIndex: 1,
      explanation: 'The engine guarantees exactly one terminal complete event, whatever happens.',
    },
    {
      id: 'q3',
      prompt: 'You cancel a run. Which terminal status do you see?',
      choices: ['failed', 'timeout', 'cancelled', 'succeeded'],
      correctIndex: 2,
      explanation: 'Cancellation is reported as cancelled, preceded by an error event with code CANCELLED.',
    },
    {
      id: 'q4',
      prompt: 'Which error should you NOT retry unchanged?',
      choices: ['TIMEOUT', 'TOO_MANY_REQUESTS', 'VALIDATION_FAILED', 'A retryable PROVIDER_ERROR'],
      correctIndex: 2,
      explanation: 'Validation errors mean the input is wrong; retrying the same input fails again.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab implementation', description: 'Input schema, run function and automated checks.' },
    { path: 'definition.ts', title: 'Lesson definition', description: 'The LabDefinition that drives Learn, Run and Source.' },
  ],
  exercise: {
    instructions:
      'Extend the pretend agent: add a second tool call named "vowelCounter" that emits tool-start/tool-finish with the number of vowels, and add a check "vowels-counted". Run the conformance tests with `npm test` to confirm the lab still passes.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'echo-matches', label: 'Echo equals "Echo: " + your message' },
    { id: 'word-count', label: 'wordCounter tool counted the words correctly' },
    { id: 'tokens-streamed', label: 'One token event was streamed per echo word' },
    { id: 'steps-completed', label: 'Both workflow steps finished with success' },
  ],
  instructorOutline: {
    durationMinutes: 5,
    segments: [
      {
        title: 'Why a dummy lab',
        minutes: 1,
        talkingPoints: ['Learn the platform before spending tokens', 'Server-side execution and secret isolation'],
      },
      {
        title: 'Happy path run',
        minutes: 1.5,
        talkingPoints: [
          'Run with the example input',
          'Walk the timeline: workflow steps, tool call, tokens',
          'Show the result checks',
        ],
      },
      {
        title: 'Cancel and timeout',
        minutes: 1.5,
        talkingPoints: [
          'Increase delay, press Cancel',
          'Point out error CANCELLED then complete cancelled',
          'Mention the deadline',
        ],
      },
      {
        title: 'Errors and Source tab',
        minutes: 1,
        talkingPoints: [
          'Empty message → VALIDATION_FAILED before the run',
          'Simulated failure → retryable PROVIDER_ERROR',
          'Open Source tab, show run.ts',
        ],
      },
    ],
  },
  execution: {
    modes: ['offline'],
    defaultTimeoutMs: 10_000,
    maxTimeoutMs: 15_000,
    budget: { maxSteps: 2, maxToolCalls: 1 },
    costNotice: 'Free: runs entirely offline with no AI provider calls.',
  },
  tags: ['platform', 'events', 'offline'],
} satisfies LabDefinitionInput;
