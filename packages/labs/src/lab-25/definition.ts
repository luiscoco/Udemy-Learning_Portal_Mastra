import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const conversation = [
  "Hi! I'm allergic to peanuts, which matters a lot when I eat out with colleagues.",
  'I live in Berlin, in a small flat near the river, and I commute by bike every day.',
  'My dog is called Rex and he loves long walks in the park on Sunday mornings.',
  'I work as a nurse on night shifts, so I usually eat dinner very late.',
];
const question = 'Before we book the team dinner: what do you know about me?';

export const lab25Definition = {
  id: 'lab-25',
  number: 25,
  title: 'Observational memory',
  moduleId: 'module-05',
  summary:
    'Feature-detect Mastra Observational Memory, watch its Observer turn a long conversation into dense observations, and compare it with an explicitly labelled app-level fallback.',
  concept:
    'Long conversations eventually overflow the context window, and stuffing in more raw history makes models slower, costlier and less accurate. ' +
    'Observational Memory (OM) is Mastra’s answer, added in @mastra/memory 1.1.0: a background Observer agent watches the conversation and writes dense, dated observations that replace older raw messages, and a Reflector compresses those observations when they grow. ' +
    'You enable it with new Memory({ storage, options: { observationalMemory: { model, observation: { messageTokens } } } }); the defaults observe at about 30,000 tokens and buffer in the background so the agent never waits. ' +
    'On the next turn the agent sees an <observations> block instead of the old messages, so it still knows that you are allergic to peanuts without re-reading every word. ' +
    'Features like this move fast, so the lab first feature-detects OM from evidence in the installed packages: version, exports, bundled docs and the storage adapter’s read API. ' +
    'When OM is not available you can still keep long-term notes yourself, but that is an app-level fallback with different guarantees and it must be labelled as such, never presented as Mastra’s feature. ' +
    'This lab uses a tiny threshold and synchronous observation so you can see it happen in four turns; production keeps the large defaults and async buffering. ' +
    'Offline, the Observer is a scripted model that writes OM-format observations from the transcript Mastra sends it; live, the Observer is a real model and each observation is a billed call.',
  objectives: [
    'Feature-detect a Mastra capability from evidence and record it',
    'Configure Observational Memory with a threshold and an Observer model',
    'Inspect stored observations and see them injected into the next turn',
    'Label an app-level fallback honestly and explain how it differs',
  ],
  prerequisites: ['lab-24'],
  inputs: [
    {
      kind: 'json',
      name: 'conversation',
      label: 'Conversation (1–8 messages from you)',
      maxBytes: 5_000,
      default: conversation,
      required: true,
    },
    { kind: 'text', name: 'question', label: 'Final question', minLength: 1, maxLength: 300, default: question, required: true },
    {
      kind: 'text',
      name: 'expectedFact',
      label: 'A fact the observations should keep',
      minLength: 1,
      maxLength: 200,
      default: 'allergic to peanuts',
      required: true,
    },
    {
      kind: 'number',
      name: 'messageTokens',
      label: 'Observation threshold (history tokens)',
      help: 'Mastra’s default is 30,000; the lab uses a tiny value so observation happens within a few turns.',
      min: 60,
      max: 5000,
      step: 10,
      default: 100,
      required: true,
    },
    {
      kind: 'select',
      name: 'implementation',
      label: 'Implementation',
      options: [
        { value: 'auto', label: 'auto: native if the probe finds it, else the fallback' },
        { value: 'native', label: 'native: Mastra Observational Memory (refused if unavailable)' },
        { value: 'fallback', label: 'fallback: app-level notes (NOT Mastra observational memory)' },
      ],
      default: 'auto',
      required: true,
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model (chat and Observer)',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: {
    conversation,
    question,
    expectedFact: 'allergic to peanuts',
    messageTokens: 100,
    implementation: 'auto',
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'The probe finds native OM. After the history passes 100 tokens, the Observer turns the conversation into observations (“User stated: I’m allergic to peanuts…”). The final answer is built from the <observations> block in the prompt.',
    example: {
      capabilities: { nativeAvailable: true, memoryVersion: '1.38.0' },
      implementation: 'native',
      label: 'native (Mastra Observational Memory)',
      messageTokens: 100,
      injectedIntoPrompt: true,
    },
  },
  guide: {
    procedure: [
      'Open probe.ts in the Source tab: what evidence does each capability row use?',
      'Run the example and read the capability rows in the timeline log.',
      'In the result, read observations and observedMessages: which messages did the Observer replace?',
      'Raise the threshold to 5000 and run again: why are there no observations now?',
      'Choose “fallback” and run: compare the label, the notes and what is missing compared with native OM.',
      'Optional (costs money): run live; the Observer is a real model call.',
    ],
    prediction: 'With the threshold at 5000 tokens, will the final answer still know about the peanut allergy?',
    hints: [
      { level: 1, text: 'The Observer only runs when the history passes the threshold.' },
      { level: 2, text: 'Four short messages are far below 5000 tokens.' },
      {
        level: 3,
        text: 'No observations are made, but the raw messages are still in the window (lastMessages), so the agent can still answer. The observation checks fail.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Presenting your own summariser as “observational memory”.',
        fix: 'Label app-level fallbacks explicitly; they lack the Observer/Reflector pipeline and buffering.',
      },
      {
        mistake: 'Feature-detecting by version string alone.',
        fix: 'Record evidence: exports, docs, storage API and supported adapters.',
      },
      {
        mistake: 'Using OM without storage, or with an unsupported adapter.',
        fix: 'OM requires one of the documented storage adapters (LibSQL here).',
      },
      {
        mistake: 'Copying the tiny demo threshold to production.',
        fix: 'Keep Mastra’s large defaults and async buffering; the demo value only makes observation visible.',
      },
    ],
    challenge: {
      prompt:
        'Enable reflection with a tiny reflection.observationTokens threshold and run a longer conversation. How do you show in the result that the Reflector compressed the observations?',
      successCriteria: [
        'The record’s generationCount or reflected line count changes',
        'The answer still uses the compressed facts',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What does the Observer in Mastra Observational Memory do?',
      choices: ['Answers the user', 'Condenses older messages into dense observations', 'Embeds messages', 'Validates input'],
      correctIndex: 1,
      explanation: 'Observations replace raw history as it grows.',
    },
    {
      id: 'q2',
      prompt: 'When does the Observer run by default?',
      choices: [
        'Every message',
        'When history passes about 30,000 tokens (buffered in the background)',
        'Once per day',
        'Only on demand',
      ],
      correctIndex: 1,
      explanation: 'messageTokens defaults to 30k, and async buffering pre-computes observations.',
    },
    {
      id: 'q3',
      prompt: 'Your platform does not support native OM, so you build a summariser. How should it be presented?',
      choices: [
        'As observational memory',
        'As an explicitly labelled app-level fallback',
        'Hidden from users',
        'As semantic recall',
      ],
      correctIndex: 1,
      explanation: 'Never misrepresent a fallback as the native feature.',
    },
    {
      id: 'q4',
      prompt: 'What makes a capability probe trustworthy?',
      choices: [
        'Assuming the latest version',
        'Evidence from the installed packages, recorded with the result',
        'A feature flag',
        'Asking the model',
      ],
      correctIndex: 1,
      explanation: 'Version, exports, docs and storage API are checked and kept.',
    },
  ],
  sourceFiles: [
    {
      path: 'probe.ts',
      title: 'Capability probe',
      description: 'Evidence-based feature detection and the offline Observer format.',
    },
    { path: 'run.ts', title: 'Lab run', description: 'Native OM configuration, record inspection and the labelled fallback.' },
  ],
  exercise: {
    instructions:
      'In your project, write a probe that records whether Observational Memory is available (with evidence), enable it with a small threshold on a LibSQL-backed Memory, and write a test that shows observations in storage after a long conversation and the observed fact in the next answer.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'capabilities-recorded', label: 'The capability probe recorded each check with evidence' },
    { id: 'labelled-honestly', label: 'The result is labelled with what really ran (a fallback is never presented as native)' },
    { id: 'threshold-respected', label: 'Observation ran exactly when the history passed the token threshold' },
    { id: 'observations-created', label: 'The observations (or notes) contain the stated fact' },
    { id: 'answer-uses-observations', label: 'The final answer uses the observed fact' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Context rot', minutes: 1, talkingPoints: ['Long chats overflow', 'Observations instead of raw history'] },
      { title: 'Feature detection', minutes: 1.5, talkingPoints: ['Evidence rows', 'Recorded with every run'] },
      { title: 'Native OM', minutes: 2, talkingPoints: ['Observer, threshold, sync mode', 'The <observations> block'] },
      { title: 'Honest fallback', minutes: 1.5, talkingPoints: ['App-level notes', 'Labelled, never “native”'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Production defaults and buffering', 'Next module: workflows'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 120_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 1 },
    costNotice:
      'Offline is free. Live mode makes one call per message plus the question (5 in the example) and at least one Observer call (or one summary call in the fallback).',
  },
  tags: ['memory', 'observational-memory', 'feature-detection', 'fallback'],
} satisfies LabDefinitionInput;
