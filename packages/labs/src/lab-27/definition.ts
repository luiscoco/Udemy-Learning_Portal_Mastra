import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const invitation = 'Team offsite on 2026-11-12 at 09:30 in Lisbon, room Atlas, organiser Ana.';

export const lab27Definition = {
  id: 'lab-27',
  number: 27,
  title: 'Sequential steps',
  moduleId: 'module-06',
  summary:
    'Chain typed steps into a parse → enrich → map → render pipeline, follow the ordered event trace, and see Mastra stop the run when one step hands the next the wrong type.',
  concept:
    'Most workflows are pipelines: each step does one job and hands its output to the next step as input. ' +
    'In Mastra you chain steps with .then(stepA).then(stepB), and the output schema of one step should match the input schema of the next; TypeScript checks that while you write it. ' +
    'At runtime Mastra checks it again: before each step runs, its input is validated against its inputSchema, and a mismatch fails the run with WORKFLOW_STEP_INPUT_VALIDATION_FAILED instead of passing bad data along. ' +
    'When two steps do not line up, .map() inserts a small mapping step that reshapes the data; it has no schema of its own, so the next schema’d step is where problems get caught. ' +
    'A later step can also read earlier data with getInitData() (the workflow input) and getStepResult(step), without threading every field through every step. ' +
    'Here a parse step extracts an event from an invitation, enrich adds the weekday, countdown, time zone, UTC time and venue address, a mapping step prepares what to show, and render produces a Markdown card and a calendar (.ics) entry. ' +
    'The stream gives an ordered trace: every step starts and finishes in sequence, which is what makes a pipeline easy to debug. ' +
    'Keeping each step small and typed means a failure points at exactly one boundary.',
  objectives: [
    'Chain typed steps with .then() and reshape data with .map()',
    'Read earlier data with getInitData() and getStepResult()',
    'Follow an ordered step trace through a pipeline',
    'Recognise a failed transition and where Mastra catches it',
  ],
  prerequisites: ['lab-26'],
  inputs: [
    {
      kind: 'textarea',
      name: 'invitation',
      label: 'Invitation',
      help: 'Cities: Lisbon, Berlin, New York, Tokyo. Rooms with addresses: Atlas (Lisbon), Spree (Berlin), Hudson (New York), Sakura (Tokyo).',
      minLength: 10,
      maxLength: 1000,
      default: invitation,
      required: true,
    },
    {
      kind: 'text',
      name: 'today',
      label: 'Reference date (today)',
      help: 'YYYY-MM-DD, used for the countdown.',
      minLength: 10,
      maxLength: 10,
      default: '2026-10-17',
      required: true,
    },
    {
      kind: 'boolean',
      name: 'brokenEnrich',
      label: 'Break the enrich step (daysUntil becomes text)',
      default: false,
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
  exampleInput: { invitation, today: '2026-10-17', brokenEnrich: false, modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'Four steps run in order (parse, enrich, a mapping step, render). The card says Thursday 2026-11-12, 09:30 Europe/Lisbon (09:30 UTC), in 26 days, Atlas, Rua Augusta 100. The .ics entry starts at 20261112T093000Z.',
    example: {
      status: 'success',
      error: null,
      rendered: {
        headline: 'Team offsite — Thursday 2026-11-12, 09:30 Europe/Lisbon (09:30 UTC)',
        markdown:
          '### Team offsite\n- **When:** Thursday 2026-11-12, 09:30 Europe/Lisbon (09:30 UTC) (in 26 days)\n- **Where:** Atlas, Rua Augusta 100, 1100-053 Lisboa\n- **Organiser:** Ana',
      },
    },
  },
  guide: {
    procedure: [
      'Open steps.ts in the Source tab: follow the schemas from InviteInputSchema to RenderedSchema.',
      'Run the example and read the ordered trace in the timeline.',
      'Read transitions in the result: which schema did each step’s output satisfy?',
      'Change the city to Tokyo (keep 09:30): how do the UTC time and the .ics DTSTART change?',
      'Turn on “Break the enrich step” and run: which step fails, and with what error code?',
      'Optional (costs money): run live; a real model parses the invitation.',
    ],
    prediction: 'With the broken enrich step, will the failure appear at the mapping step or at render?',
    hints: [
      { level: 1, text: 'Which steps have an inputSchema?' },
      { level: 2, text: 'The mapping step created by .map() has no schema; it passes daysUntil through.' },
      {
        level: 3,
        text: 'At render: its input validation fails with WORKFLOW_STEP_INPUT_VALIDATION_FAILED, so render’s execute never runs.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'One giant step that parses, enriches and renders.',
        fix: 'Split into small typed steps so failures point at one boundary.',
      },
      { mistake: 'Assuming .map() validates.', fix: 'A mapping step has no schema; the next schema’d step is the guard.' },
      { mistake: 'Threading every field through every step.', fix: 'Read the workflow input with getInitData() where needed.' },
      { mistake: 'Formatting dates in local server time.', fix: 'Convert with the event’s IANA time zone and store UTC.' },
    ],
    challenge: {
      prompt:
        'Add a “translate” step between map and render that writes the card in the attendee’s language. How do you keep the transition typed, and where would a bad translation fail?',
      successCriteria: ['The new step has input and output schemas', 'The trace shows it in order'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What does Mastra do before each step runs?',
      choices: ['Nothing', 'Validates the step’s input against its inputSchema', 'Calls the model', 'Saves a checkpoint to disk'],
      correctIndex: 1,
      explanation: 'A mismatch fails the run with WORKFLOW_STEP_INPUT_VALIDATION_FAILED.',
    },
    {
      id: 'q2',
      prompt: 'Two steps have different shapes. What connects them?',
      choices: ['.map()', '.commit()', 'createRun()', '.parallel()'],
      correctIndex: 0,
      explanation: '.map() inserts a mapping step that reshapes the data.',
    },
    {
      id: 'q3',
      prompt: 'How can a later step read the original workflow input?',
      choices: ['It cannot', 'getInitData()', 'A global variable', 'By re-running the first step'],
      correctIndex: 1,
      explanation: 'getInitData() and getStepResult(step) are available in execute.',
    },
    {
      id: 'q4',
      prompt: 'Why keep the reference date as an input?',
      choices: ['It is faster', 'So the countdown is reproducible and testable', 'Mastra requires it', 'To save tokens'],
      correctIndex: 1,
      explanation: 'Deterministic inputs make deterministic outputs.',
    },
  ],
  sourceFiles: [
    {
      path: 'steps.ts',
      title: 'Steps and schemas',
      description: 'parse, enrich, map, render, time-zone math and .ics rendering.',
    },
    { path: 'run.ts', title: 'Lab run', description: 'Typed run, transition re-validation and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, chain three typed steps with .then() and one .map(), stream the run, and write a test asserting the step order and that a deliberately mistyped field fails at the next step with WORKFLOW_STEP_INPUT_VALIDATION_FAILED.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'ordered-events', label: 'Events arrived in pipeline order: parse → enrich → map → render' },
    { id: 'typed-transitions', label: 'Every transition satisfied the next step’s input schema' },
    { id: 'typed-output', label: 'The final output passed the workflow’s output schema' },
    { id: 'enrichment-correct', label: 'Enrichment computed weekday, countdown and UTC time from the reference date' },
    { id: 'today-respected', label: 'The countdown uses the reference date you entered' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'Pipelines', minutes: 1, talkingPoints: ['One job per step', '.then() chains'] },
      { title: 'Typed transitions', minutes: 1.5, talkingPoints: ['Input validated before each step', 'The broken enrich'] },
      {
        title: '.map() and earlier data',
        minutes: 1.5,
        talkingPoints: ['Mapping step has no schema', 'getInitData, getStepResult'],
      },
      { title: 'The ordered trace', minutes: 1, talkingPoints: ['Start/finish per step', 'Debugging by boundary'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['UTC and time zones', 'Next: parallel branches'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 1 },
    costNotice: 'Offline is free. Live mode makes one structured-output model call (the parse step).',
  },
  tags: ['workflows', 'sequential', 'map', 'schemas'],
} satisfies LabDefinitionInput;
