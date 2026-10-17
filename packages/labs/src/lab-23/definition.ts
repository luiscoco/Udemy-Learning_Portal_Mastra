import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const messages = [
  "Hi, I'm Ana. I always fly from LIS and I prefer window seats.",
  "Also, I'm vegetarian.",
  'Actually, put me on the roof of the plane.',
];
const settingsUpdates = [{ currency: 'EUR' }, { seat: 'cockpit' }, { dietary: ['vegan', 'vegan'] }, { homeAirport: 'lisbon' }];
const followUp = 'Book my next flight. Which seat and meal should I request, and from which airport?';

export const lab23Definition = {
  id: 'lab-23',
  number: 23,
  title: 'Working memory',
  moduleId: 'module-05',
  summary:
    'Keep a structured, schema-validated user profile in Mastra working memory, update it from conversation and from a settings API, and use it in the next conversation.',
  concept:
    'Message history remembers what was said; working memory remembers what matters about the user, such as their name, home airport, seat and dietary needs, as a small structured record. ' +
    'In Mastra you enable it on Memory with workingMemory: { enabled: true, scope: "resource", schema }, and the agent then sees the current record in its instructions on every turn. ' +
    'Mastra also gives the agent an updateWorkingMemory tool whose input schema is generated from your Zod schema, so updates made in conversation are validated: an unknown seat value is rejected and nothing changes. ' +
    'Updates through the tool merge with what is already stored, so telling the agent “I’m vegetarian” does not erase your seat preference. ' +
    'With resource scope the record belongs to the user, not to one conversation, so a brand-new thread starts with everything the agent already knows. ' +
    'Your own code can read it with memory.getWorkingMemory() and write it with memory.updateWorkingMemory(), but that direct write stores any string and replaces the whole record. ' +
    'So a settings page must validate the patch, merge it with the current profile and validate the result before writing. ' +
    'This lab updates a profile both ways, including bad updates, and then asks the agent to book a flight in a new conversation.',
  objectives: [
    'Configure schema-based working memory at resource scope',
    'Update it from conversation through the updateWorkingMemory tool',
    'Validate and merge direct updates before writing them',
    'Use the stored profile in a later, separate conversation',
  ],
  prerequisites: ['lab-22'],
  inputs: [
    {
      kind: 'json',
      name: 'messages',
      label: 'Conversation 1: what the user tells the agent (1–5)',
      maxBytes: 3_000,
      default: messages,
      required: true,
    },
    {
      kind: 'json',
      name: 'settingsUpdates',
      label: 'Settings page: direct profile updates (0–6)',
      help: 'Fields: name, homeAirport (IATA, e.g. LIS), seat (window | aisle), dietary (vegetarian | vegan | gluten-free | halal | kosher, at most 3, no duplicates), currency (EUR | USD | GBP).',
      maxBytes: 3_000,
      default: settingsUpdates,
      required: true,
    },
    {
      kind: 'boolean',
      name: 'validateDirectUpdates',
      label: 'Validate settings updates before writing (turn off to see a raw write)',
      default: true,
      required: true,
    },
    {
      kind: 'text',
      name: 'followUp',
      label: 'Conversation 2 (a new thread)',
      minLength: 1,
      maxLength: 400,
      default: followUp,
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
  exampleInput: { messages, settingsUpdates, validateDirectUpdates: true, followUp, modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'The agent saves name, airport and seat, then merges vegetarian. The roof request is rejected by the tool. Settings apply EUR and reject the other three with reasons. In a new thread, the agent books with the stored profile.',
    example: {
      afterConversation: { name: 'Ana', homeAirport: 'LIS', seat: 'window', dietary: ['vegetarian'] },
      settingsUpdates: [
        { patch: { currency: 'EUR' }, result: { ok: true } },
        { patch: { seat: 'cockpit' }, result: { ok: false } },
        { patch: { dietary: ['vegan', 'vegan'] }, result: { ok: false } },
        { patch: { homeAirport: 'lisbon' }, result: { ok: false } },
      ],
      followUp: {
        threadId: 'conversation-2',
        answer: 'Flying from LIS: I’ll request a window seat and a vegetarian meal, Ana.',
      },
      followUpSawProfile: true,
      stored: { name: 'Ana', homeAirport: 'LIS', seat: 'window', dietary: ['vegetarian'], currency: 'EUR' },
      storedValid: true,
    },
  },
  guide: {
    procedure: [
      'Open profile.ts in the Source tab and read PreferencesSchema and updateProfile().',
      'Run the example. In the trace, find the three updateWorkingMemory calls: which one failed, and why?',
      'Read the settings results: what reason does each rejected update give?',
      'Check the follow-up: it runs in a new thread, yet the agent knows the seat, meal and airport.',
      'Turn off “Validate settings updates” and run again. What does the stored profile look like now?',
      'Optional (costs money): run live; does the real model even try to put you on the roof?',
    ],
    prediction: 'After “Also, I’m vegetarian.”, will the stored seat still be “window”?',
    hints: [
      { level: 1, text: 'The second message only mentions a dietary need.' },
      { level: 2, text: 'Updates through Mastra’s tool are merged with the stored record.' },
      {
        level: 3,
        text: 'Yes: the tool merges { dietary: ["vegetarian"] } into the record. A raw memory.updateWorkingMemory() would have replaced it instead.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Writing working memory directly from a request body.',
        fix: 'Validate the patch, merge it and validate again (updateProfile).',
      },
      {
        mistake: 'Thread scope for user facts.',
        fix: 'Use resource scope so the profile follows the user into new conversations.',
      },
      {
        mistake: 'A loose schema (z.any() or no enums).',
        fix: 'Use enums, formats and .strict() so bad values cannot be stored.',
      },
      {
        mistake: 'Storing secrets or sensitive data “to be helpful”.',
        fix: 'Working memory is shown to the model on every turn; keep it to what the agent needs.',
      },
      {
        mistake: 'Surprise at a rejected first update in live mode.',
        fix: 'Mastra shows an empty template ("currency": ""); real models often copy it, the enum rejects "", and the model retries without the field. Expect one retry.',
      },
    ],
    challenge: {
      prompt:
        'Add a “forget my dietary needs” request. How should the agent remove a field, and how do you prove the rest of the profile survives?',
      successCriteria: [
        'dietary is gone from the stored profile',
        'name, airport and seat are unchanged and the profile still validates',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'How does an agent update working memory in Mastra?',
      choices: [
        'It edits the database',
        'By calling the updateWorkingMemory tool Mastra provides',
        'Through instructions only',
        'By returning JSON in its answer',
      ],
      correctIndex: 1,
      explanation: 'The tool’s input schema is generated from your working-memory schema.',
    },
    {
      id: 'q2',
      prompt: 'Working memory has scope "resource". A user starts a new thread. What does the agent know?',
      choices: ['Nothing', 'The stored profile', 'Only the last message', 'Other users’ profiles'],
      correctIndex: 1,
      explanation: 'Resource scope keeps the record per user, across threads.',
    },
    {
      id: 'q3',
      prompt: 'What does memory.updateWorkingMemory({ workingMemory: \'{"seat":"roof"}\' }) do in this version?',
      choices: [
        'Rejects it against the schema',
        'Stores it without validation and replaces the whole record',
        'Merges seat into the record',
        'Throws an error',
      ],
      correctIndex: 1,
      explanation: 'That is why direct writes go through a validating service.',
    },
    {
      id: 'q4',
      prompt: 'The user asks for a seat “on the roof”. What should happen?',
      choices: [
        'Store "roof"',
        'The update is rejected by the schema and the stored seat is unchanged',
        'Delete the profile',
        'Ask the model to guess',
      ],
      correctIndex: 1,
      explanation: 'The enum allows only window or aisle.',
    },
  ],
  sourceFiles: [
    {
      path: 'profile.ts',
      title: 'Profile schema and service',
      description: 'PreferencesSchema, validated merge for direct updates, raw contrast.',
    },
    {
      path: 'run.ts',
      title: 'Lab run',
      description: 'Conversation via the tool, settings updates, new-thread follow-up and checks.',
    },
  ],
  exercise: {
    instructions:
      'In your project, enable schema working memory at resource scope, add a settings endpoint that validates and merges patches before memory.updateWorkingMemory(), and write a test where a preference set in one thread is used in a new thread and a bad update is rejected with a reason.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'preference-survives', label: 'The next conversation (a new thread) used the stored preferences' },
    { id: 'tool-validated', label: 'Invalid updates the agent tried were rejected by the schema' },
    { id: 'direct-validated', label: 'Invalid settings updates were rejected with reasons; valid ones were applied' },
    { id: 'stored-matches-schema', label: 'The stored profile passes the strict PreferencesSchema' },
    { id: 'merge-not-replace', label: 'Later partial updates kept the fields learned earlier' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'History vs working memory', minutes: 1, talkingPoints: ['What was said vs what matters', 'Resource scope'] },
      {
        title: 'Schema working memory',
        minutes: 1.5,
        talkingPoints: ['workingMemory: { schema }', 'The updateWorkingMemory tool'],
      },
      { title: 'Bad updates', minutes: 1.5, talkingPoints: ['Roof seat rejected by the tool', 'Merge, not replace'] },
      { title: 'Direct writes', minutes: 2, talkingPoints: ['updateWorkingMemory stores anything', 'Validate, merge, validate'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['New thread uses the profile', 'End of Module 05'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 3, maxToolCalls: 6 },
    costNotice:
      'Offline is free. Live mode makes about two model calls per message (tool call and reply) plus the follow-up, about 7 for the example.',
  },
  tags: ['memory', 'working-memory', 'schema', 'validation'],
} satisfies LabDefinitionInput;
