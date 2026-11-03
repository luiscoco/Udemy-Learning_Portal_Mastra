import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab67Definition = {
  id: 'lab-67',
  number: 67,
  title: 'Streaming chat UI',
  moduleId: 'module-14',
  presentation: 'chat',
  summary:
    'Build a chat that streams each reply token by token, stops instantly, retries cleanly and keeps an honest thread history in Mastra memory.',
  concept:
    'A chat interface turns each message into an agent run on a conversation thread, and shows the reply as it is generated instead of after a long silence. ' +
    'The tokens travel from the model through the server as run events, and the browser appends each one to a live bubble; every event has a sequence number, so a reconnect can never show a token twice. ' +
    'Stop must feel instant: the panel shows that it is stopping at once, the server cancels the run, and the model stream is aborted. ' +
    'Mastra memory is the thread’s source of truth, and it has a detail worth knowing: when a reply is aborted, Mastra still saves the question and the partial reply. ' +
    'This lab tags that partial reply as stopped, so the history never presents half an answer as a real one. ' +
    'Retry replaces the unfinished turn instead of asking the same question again on top of it, and a provider failure keeps the question marked as failed so it can be retried. ' +
    'Each learner’s threads live in their own storage partition, and turns on one thread run one at a time. ' +
    'Offline, a scripted model streams a reply word by word; choose “Slow tokens” to have time to press Stop.',
  objectives: [
    'Stream a reply into the UI token by token without duplicates',
    'Make Stop respond immediately and cancel the run on the server',
    'Keep thread history honest after a stop or a failure',
    'Retry an unfinished turn without repeating the question',
  ],
  prerequisites: ['lab-66'],
  inputs: [
    {
      kind: 'select',
      name: 'action',
      label: 'Action',
      default: 'send',
      options: [
        { value: 'send', label: 'Send a message' },
        { value: 'history', label: 'Load the thread history' },
        { value: 'delete-thread', label: 'Delete the thread' },
      ],
    },
    {
      kind: 'text',
      name: 'threadId',
      label: 'Thread',
      minLength: 3,
      maxLength: 41,
      default: 'chat-1',
      required: true,
      help: 'Lowercase letters, digits and dashes. Your threads are private to you.',
    },
    {
      kind: 'textarea',
      name: 'message',
      label: 'Message',
      maxLength: 1_000,
      rows: 2,
      default: 'Hi! What can you do?',
      required: false,
    },
    { kind: 'boolean', name: 'retry', label: 'Retry the unfinished last turn', default: false },
    {
      kind: 'select',
      name: 'fault',
      label: 'Fault',
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'slow', label: 'Slow tokens (time to press Stop)' },
        { value: 'fail', label: 'Provider fails (HTTP 503, before any token)' },
      ],
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model',
      default: 'openai/gpt-5-mini',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
    },
  ],
  exampleInput: {
    action: 'send',
    threadId: 'chat-1',
    message: 'Hi! What can you do?',
    retry: false,
    fault: 'none',
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'The reply streams token by token; the concatenated tokens equal the saved reply, and the thread ends with your message and a complete reply. After Stop, history shows the partial reply as stopped; Retry replaces it.',
    example: { action: 'send', removedOnRetry: 0 },
  },
  guide: {
    procedure: [
      'Send a message and watch the reply grow in the live bubble.',
      'Choose “Slow tokens”, send again and press Stop after a few words: the panel says “Stopping…” at once.',
      'Reload the page: the history shows the partial reply marked stopped, not as an answer.',
      'Press Retry: the stopped turn is replaced, and the question appears once.',
      'Choose “Provider fails” and send: the question is kept as failed; switch the fault back to None and press Retry.',
      'Start a new thread and come back: each thread keeps its own history.',
      'Read run.ts in Source: find where the partial reply is tagged and where Retry deletes the unfinished turn.',
    ],
    prediction: 'Without tagging, what would the next model call see in the thread after a Stop?',
    hints: [
      { level: 1, text: 'Stopping a stream does not undo what memory already saved.' },
      {
        level: 2,
        text: 'Look at the last messages of the thread after a stop: what is there, and how can you tell it is unfinished?',
      },
      {
        level: 3,
        text: 'After an abort, wait for the partial reply and set metadata.chatStatus = "stopped" with memory.updateMessages(); on retry, find the trailing question plus its unfinished reply and memory.deleteMessages() them before sending again.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Appending every token event the stream delivers.',
        fix: 'Track the last sequence number and ignore replays after a reconnect.',
      },
      {
        mistake: 'Waiting for the server before showing that Stop was pressed.',
        fix: 'Show “Stopping…” immediately; the cancel request and the stream end follow.',
      },
      {
        mistake: 'Treating a stopped partial reply as an answer.',
        fix: 'Tag it and show it as stopped; the model sees it as unfinished context.',
      },
      {
        mistake: 'Retrying by sending the question again on top of the failed turn.',
        fix: 'Replace the unfinished turn so history holds the question once.',
      },
    ],
    challenge: {
      prompt:
        'Add “Edit and resend” for the last user message: replace the question and its reply, and keep earlier turns untouched.',
      successCriteria: [
        'Only the last turn changes',
        'The edited question appears once',
        'Stop and Retry still work on the edited turn',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What prevents a token from appearing twice after the stream reconnects?',
      choices: [
        'A longer timeout',
        'Each event’s sequence number: replayed ones are ignored',
        'Restarting the run',
        'Debouncing the UI',
      ],
      correctIndex: 1,
      explanation: 'Last-Event-ID resumes after the last seq, and the client skips any seq it already applied.',
    },
    {
      id: 'q2',
      prompt: 'What does Mastra memory keep when a streamed reply is aborted?',
      choices: ['Nothing', 'Only the question', 'The question and the partial reply', 'Only the system prompt'],
      correctIndex: 2,
      explanation: 'That is why this lab tags the partial reply as stopped.',
    },
    {
      id: 'q3',
      prompt: 'How should Retry treat an unfinished turn?',
      choices: [
        'Send the question again on top of it',
        'Replace the trailing question and its unfinished reply',
        'Delete the whole thread',
        'Ignore it',
      ],
      correctIndex: 1,
      explanation: 'History then holds the question once, followed by one complete reply.',
    },
    {
      id: 'q4',
      prompt: 'Why show “Stopping…” before the server confirms?',
      choices: ['To hide errors', 'So Stop feels instant while the cancel completes', 'It is required by SSE', 'To save tokens'],
      correctIndex: 1,
      explanation: 'Immediate feedback, then the real outcome when the run ends.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Chat turns, Stop tagging and Retry', description: 'Mastra memory streaming and turn semantics.' },
    { path: 'transcript.ts', title: 'Honest thread transcript', description: 'Message status: complete, stopped or failed.' },
  ],
  exercise: {
    instructions: 'Explain what Mastra keeps after Stop and why it must be tagged, then implement the challenge.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'streamed-incrementally', label: 'The reply arrived token by token before the run finished' },
    { id: 'no-duplicate-tokens', label: 'Every streamed token was delivered once, and together they equal the saved reply' },
    { id: 'history-persisted', label: 'The thread ends with your message and the complete reply' },
    { id: 'retry-replaced-turn', label: 'A retry replaced the unfinished turn instead of repeating the question' },
    { id: 'failure-recoverable', label: 'A failed turn is marked failed so it can be retried' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'A run per message', minutes: 1, talkingPoints: ['Threads in memory', 'Tokens as run events'] },
      { title: 'No duplicate tokens', minutes: 1, talkingPoints: ['Sequence numbers', 'Resume after a drop'] },
      {
        title: 'Stop that feels instant',
        minutes: 1,
        talkingPoints: ['Optimistic “Stopping…”', 'Server cancel aborts the model'],
      },
      {
        title: 'Honest history',
        minutes: 2,
        talkingPoints: ['Mastra saves the partial reply', 'Tag it; Retry replaces the turn'],
      },
      { title: 'Failures and threads', minutes: 1, talkingPoints: ['Failed turn kept for retry', 'Private threads per learner'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 2 },
    costNotice:
      'Offline is free. Live mode makes one short model call per message you send, usually well under a cent. The failure fault never calls the provider.',
  },
  tags: ['chat', 'streaming', 'memory', 'react', 'cancellation'],
} satisfies LabDefinitionInput;
