import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab70Definition = {
  id: 'lab-70',
  number: 70,
  title: 'Interactive agent workspace',
  moduleId: 'module-14',
  presentation: 'workspace',
  summary:
    'Bring chat, knowledge documents, tool calls, citations, the run trace and live task progress together in one responsive workspace for a grounded agent.',
  concept:
    'A real assistant screen shows more than a chat: the documents the agent can use, what it is doing right now, which tools it called, and where each fact in its answer comes from. ' +
    'This workspace puts four things side by side: your knowledge documents, the conversation, and an inspector with citations, tool calls, the event trace and a task checklist. ' +
    'The agent first plans its work with a planTasks tool, then ticks each task off with completeTask, and every change arrives as a live event, so the checklist moves while the run streams. ' +
    'It finds facts with a searchDocs tool over your own document library, which lives in your storage partition and is never shared with other learners. ' +
    'Its answer is a list of claims that cite passage ids with exact quotes, and the server checks each quote against the passages actually returned in this turn: a claim whose quote cannot be found is blocked, not shown. ' +
    'Every citation in the inspector opens the exact passage, so you can check the answer yourself. ' +
    'The conversation is a Mastra memory thread, so a reload brings it back. ' +
    'On a phone the same workspace becomes switchable panes, and everything works with the keyboard and a screen reader.',
  objectives: [
    'Combine chat, documents, tools, citations, trace and task progress in one screen',
    'Report an agent’s plan and progress live with tool calls and step events',
    'Show only claims whose citations are verified against retrieved passages',
    'Keep the workspace responsive and accessible on desktop and mobile',
  ],
  prerequisites: ['lab-69'],
  inputs: [
    {
      kind: 'select',
      name: 'action',
      label: 'Action',
      default: 'send',
      options: [
        { value: 'send', label: 'Ask a question' },
        { value: 'history', label: 'Load documents and history' },
        { value: 'seed', label: 'Seed the sample documents' },
      ],
    },
    { kind: 'text', name: 'threadId', label: 'Thread', minLength: 3, maxLength: 41, default: 'workspace-1', required: true },
    {
      kind: 'textarea',
      name: 'message',
      label: 'Question',
      maxLength: 1_000,
      rows: 2,
      default: 'How long do refunds take?',
      required: false,
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model',
      default: 'openai/gpt-5-mini',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
    },
  ],
  exampleInput: { action: 'send', threadId: 'workspace-1', message: 'How long do refunds take?', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'After seeding, the agent plans three tasks, searches the documents, ticks each task off, and answers with claims quoting the refund policy; each citation opens its passage.',
    example: { action: 'send', blocked: 0 },
  },
  guide: {
    procedure: [
      'Press “Seed sample documents” in the Knowledge pane and open one document.',
      'Ask “How long do refunds take?” and watch the Tasks tab tick off while the run streams.',
      'Open the Citations tab and press a citation: the exact quote is highlighted in its passage.',
      'Open the Tools tab: find the searchDocs call and the passages it returned.',
      'Open the Trace tab and follow the events in order.',
      'Ask something the documents do not cover: the answer says so instead of inventing facts.',
      'Reload the page: the thread and documents come back. On a phone, switch between the panes.',
    ],
    prediction: 'What should the screen show while the agent is still searching, before any answer exists?',
    hints: [
      { level: 1, text: 'Each pane reads from the same run: its events and its final output.' },
      {
        level: 2,
        text: 'Task progress, tool calls and the trace come from the event stream; citations from the verified output.',
      },
      {
        level: 3,
        text: 'Steps with stepId "task:<n>" drive the checklist; state.tools drives the Tools tab; guardClaims checks every quote against the passages searchDocs returned this turn.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Showing the model’s citations without checking them.',
        fix: 'Verify each quote against the passages actually retrieved in this turn.',
      },
      {
        mistake: 'Updating task progress only when the run ends.',
        fix: 'Emit an event per task change so the checklist moves live.',
      },
      {
        mistake: 'A three-column layout that overflows on phones.',
        fix: 'Switch to one pane at a time below a breakpoint; never scroll the page sideways.',
      },
      {
        mistake: 'Inspector tabs that only work with a mouse.',
        fix: 'Use the ARIA tabs pattern with arrow keys and roving focus.',
      },
    ],
    challenge: {
      prompt:
        'Let the learner upload their own document into the workspace (reuse Lab 36’s ingestion) and show the new document’s passages in the citations.',
      successCriteria: [
        'The upload is sniffed and size-limited',
        'The new document is searchable at once',
        'Other learners never see it',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Where does the live task checklist come from?',
      choices: ['A timer in the browser', 'Step events the agent’s task tools emit', 'The final answer', 'Local storage'],
      correctIndex: 1,
      explanation: 'planTasks and completeTask emit task:<n> steps as they happen.',
    },
    {
      id: 'q2',
      prompt: 'Which claims does the workspace show?',
      choices: [
        'All of them',
        'Those whose quotes are found in passages retrieved this turn',
        'The first three',
        'Those with long quotes',
      ],
      correctIndex: 1,
      explanation: 'Anything else is blocked and reported.',
    },
    {
      id: 'q3',
      prompt: 'How does the workspace behave on a phone?',
      choices: [
        'It scrolls sideways',
        'One pane at a time with a pane switcher',
        'It hides the inspector forever',
        'It only shows the chat',
      ],
      correctIndex: 1,
      explanation: 'Every pane stays reachable without horizontal scrolling.',
    },
    {
      id: 'q4',
      prompt: 'Whose documents can the agent search?',
      choices: ['Every learner’s', 'Only yours, in your storage partition', 'Only the samples', 'The internet'],
      correctIndex: 1,
      explanation: 'The library lives in your partition (Lab 62).',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Workspace turn and checks', description: 'Memory thread, tools, citation guard.' },
    { path: 'tools.ts', title: 'Task and search tools', description: 'Live task events and retrieval.' },
    { path: 'knowledge.ts', title: 'Seeded knowledge documents', description: 'Samples, passages and search.' },
  ],
  exercise: {
    instructions: 'Explain which pane reads which part of the run, then implement the upload challenge locally.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'documents-seeded', label: 'The answer drew on your knowledge documents, or honestly said there were none' },
    { id: 'tasks-progressed', label: 'Every planned task was shown running and then done' },
    { id: 'tools-used', label: 'The agent searched the documents before answering' },
    { id: 'citations-verified', label: 'Every shown claim quotes a passage retrieved in this turn' },
    { id: 'history-persisted', label: 'The thread ends with your question and the answer' },
    { id: 'no-cross-learner-docs', label: 'Only your own documents were searched' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'One screen, one run', minutes: 1, talkingPoints: ['Documents, chat, inspector', 'Events vs final output'] },
      { title: 'Plan and progress', minutes: 2, talkingPoints: ['planTasks and completeTask', 'A live checklist'] },
      { title: 'Grounded answers', minutes: 2, talkingPoints: ['searchDocs passages', 'Verified citations', 'Blocked claims'] },
      { title: 'Responsive and accessible', minutes: 1, talkingPoints: ['Pane switcher on phones', 'ARIA tabs and dialog'] },
      { title: 'Try it', minutes: 1, talkingPoints: ['Seed, ask, inspect, reload'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 180_000,
    budget: { maxSteps: 8, maxToolCalls: 10 },
    costNotice:
      'Offline is free. Live mode makes one agent run of up to 8 short steps per question, usually a few cents or less.',
  },
  tags: ['workspace', 'chat', 'rag', 'citations', 'accessibility'],
} satisfies LabDefinitionInput;
