import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const question = 'How do Mastra workflows run their steps, pause for a human approval, and repeat a step safely?';

export const lab55Definition = {
  id: 'lab-55',
  number: 55,
  title: 'Research team capstone',
  moduleId: 'module-11',
  summary:
    'Build a research team of agents (a lead, one researcher per sub-question, a synthesizer and a fact-checker) in one Mastra workflow that surfaces the evidence for every claim, flags unsupported claims and pauses for a human approval before anything is published.',
  concept:
    'This capstone combines the patterns of Module 11. A lead agent splits the question into sub-questions. A .foreach step gives each sub-question its own researcher, with its own notebook, so concurrent researchers never share state, and record_finding only accepts quotes copied verbatim from a source. ' +
    'A plain step pools the findings, drops duplicates and numbers them; the synthesizer writes the answer from those notes only, citing a note in every sentence. ' +
    'The fact-checker then reviews each sentence, and the workflow adds the structural checks it can do in code, uncited sentences and citations to notes that do not exist, so a flag never depends on the model alone. ' +
    'Every sentence becomes a claim that is either supported or flagged with its reasons. ' +
    'Before publishing, the workflow suspends. A suspended Mastra run can only be resumed when its snapshot is stored, so the workflow is registered on a Mastra instance (in-memory storage here). ' +
    'A human, you in the Run tab or a preset reviewer, approves or rejects, and the run resumes into publish: only supported claims are published, each with its evidence (the quote and where it is in the source), while flagged claims are withheld and listed. ' +
    'To see the flagging work, the lab can plant one bad sentence in the draft; it is marked as planted in the transcript.',
  objectives: [
    'Compose lead, researcher, synthesizer and fact-checker agents in one workflow',
    'Surface the evidence of every published claim',
    'Flag unsupported claims with code checks plus a fact-checker',
    'Require a human approval with suspend and resume before publishing',
  ],
  prerequisites: ['lab-54'],
  inputs: [
    {
      kind: 'textarea',
      name: 'question',
      label: 'Research question',
      minLength: 10,
      maxLength: 500,
      rows: 2,
      default: question,
      required: true,
    },
    {
      kind: 'select',
      name: 'plantedClaim',
      label: 'Plant a bad sentence in the draft',
      options: [
        { value: 'none', label: 'None' },
        { value: 'uncited-claim', label: 'A sentence without a citation' },
        { value: 'unknown-citation', label: 'A citation to a note that does not exist' },
        { value: 'unsupported-claim', label: 'A claim its cited note does not support' },
      ],
      default: 'unsupported-claim',
      required: true,
    },
    {
      kind: 'select',
      name: 'approver',
      label: 'Approval before publishing',
      options: [
        { value: 'approve', label: 'Approve automatically (preset reviewer)' },
        { value: 'reject', label: 'Reject automatically (preset reviewer)' },
        { value: 'ask', label: 'Ask me during the run (interactive)' },
      ],
      default: 'approve',
      required: true,
    },
    { kind: 'number', name: 'maxWords', label: 'Maximum words', min: 40, max: 300, step: 10, default: 160, required: true },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model (live)',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: { question, plantedClaim: 'unsupported-claim', approver: 'approve', maxWords: 160, modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'The lead plans three sub-questions; three researchers record notes from S1–S4; the pool numbers the unique notes; the synthesizer writes one cited sentence per note; the planted sentence “Each step is billed by the second on a GPU cluster [1].” is flagged as unsupported. The run pauses for approval, the preset reviewer approves, and only the supported claims are published, each with its quote highlighted in its source.',
    example: {
      subQuestions: [
        'How does a Mastra workflow run its steps?',
        'How can a workflow pause for a human?',
        'How does a workflow repeat a step safely?',
      ],
      trace: {
        beforeApproval: ['plan', 'research', 'pool', 'synthesize', 'fact-check', 'approve'],
        afterApproval: ['approve', 'publish'],
        firstStatus: 'suspended',
      },
      final: { status: 'published' },
    },
  },
  guide: {
    procedure: [
      'Open team.ts in the Source tab: find the seven steps, the .foreach() and the approve step’s suspend.',
      'Run the example. In “Answer with citations”, open a citation: which quote is highlighted, and in which source?',
      'Find the planted sentence: who flagged it, with which reason, and is it in the published text?',
      'Plant “A sentence without a citation”: which check catches it, the fact-checker or the workflow’s own check?',
      'Choose “Reject automatically” and run: what is published?',
      'Choose “Ask me during the run”, run, read the approval request and approve it yourself.',
    ],
    prediction: 'If you reject in the approval panel, does the publish step still run?',
    hints: [
      { level: 1, text: 'The decision is the resume data of the approve step.' },
      { level: 2, text: 'After the resume, the workflow continues with the steps after approve.' },
      { level: 3, text: 'Yes: publish runs, sees decision reject and publishes nothing (status rejected).' },
    ],
    commonMistakes: [
      {
        mistake: 'Publishing citations without showing the evidence.',
        fix: 'Return the quote and its location in the source with every claim.',
      },
      { mistake: 'Trusting the fact-checker model alone.', fix: 'Add the checks code can do: missing and unknown citations.' },
      { mistake: 'Deleting flagged claims silently.', fix: 'Withhold them from the published text, but list them with reasons.' },
      {
        mistake: 'Suspending a workflow that is not registered on Mastra.',
        fix: 'Register it so its snapshot is stored; otherwise resume fails.',
      },
      {
        mistake: 'Letting concurrent researchers share one notebook.',
        fix: 'Give each .foreach iteration its own agent and notebook.',
      },
    ],
    challenge: {
      prompt:
        'Let the human edit the answer during the approval (resume with an edited text), and re-run the fact-check on the edited text before publishing.',
      successCriteria: [
        'The resume data carries the edit',
        'An edit with an uncited sentence is flagged',
        'Only the checked text is published',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Why does each sub-question get its own researcher and notebook?',
      choices: ['It is cheaper', 'Concurrent iterations must not share state', 'Mastra requires it', 'To use more tools'],
      correctIndex: 1,
      explanation: '.foreach runs iterations concurrently; a shared notebook would mix and race.',
    },
    {
      id: 'q2',
      prompt: 'What does “evidence surfaced” mean in this lab?',
      choices: [
        'The answer lists source titles',
        'Each claim carries the verbatim quote and its position in the source',
        'The model says it is sure',
        'The notes are logged',
      ],
      correctIndex: 1,
      explanation: 'A reader can open each citation and see the highlighted quote.',
    },
    {
      id: 'q3',
      prompt: 'What happens to a flagged claim when the reviewer approves?',
      choices: ['It is published', 'It is withheld and listed with its reasons', 'The run fails', 'It is rewritten'],
      correctIndex: 1,
      explanation: 'Only supported claims are published.',
    },
    {
      id: 'q4',
      prompt: 'Why is the workflow registered on a Mastra instance?',
      choices: ['For logging', 'So the suspended run’s snapshot is stored and resume works', 'For tools', 'To run faster'],
      correctIndex: 1,
      explanation: 'Without a snapshot store, resume fails with “No snapshot found”.',
    },
  ],
  sourceFiles: [
    {
      path: 'team.ts',
      title: 'Research team workflow',
      description: 'Plan, foreach research, pool, synthesize, fact-check, approve and publish.',
    },
    {
      path: 'claims.ts',
      title: 'Claims and evidence',
      description: 'Claim classification and the cited answer with located quotes.',
    },
    { path: 'plan.ts', title: 'Plan and pool', description: 'Sub-questions, schemas and note pooling.' },
    { path: 'run.ts', title: 'Lab run', description: 'Mastra instance, approval bridge, resume and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, build a workflow where researchers record verbatim findings, a synthesizer cites them, a fact-checker flags unsupported sentences, and an approve step suspends until a human decides; publish only supported claims with their quotes.',
    solutionFile: 'solution.md',
  },
  checks: [
    {
      id: 'team-coordinated',
      label: 'Lead → one researcher per sub-question → pool → synthesizer → fact-checker → approval pause → publish',
    },
    { id: 'notes-grounded', label: 'Every pooled note quotes its source verbatim' },
    { id: 'evidence-surfaced', label: 'Every published claim shows its evidence: a quote located in the cited source' },
    { id: 'unsupported-flagged', label: 'Unsupported claims are flagged with a reason and withheld from the published text' },
    { id: 'approval-before-publish', label: 'The workflow pauses for a human decision and publishes only after approval' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'The team', minutes: 1, talkingPoints: ['Lead, researchers, synthesizer, fact-checker', 'One workflow'] },
      {
        title: 'Research in parallel',
        minutes: 1.5,
        talkingPoints: ['.foreach with own notebooks', 'Verbatim quotes', 'Pooling'],
      },
      {
        title: 'Evidence and flags',
        minutes: 2,
        talkingPoints: ['Citations with located quotes', 'Code checks plus fact-checker', 'Withhold, do not hide'],
      },
      {
        title: 'Human approval',
        minutes: 1.5,
        talkingPoints: ['suspend / resumeStream', 'Snapshot storage', 'Approve or reject'],
      },
      { title: 'Module wrap-up', minutes: 1, talkingPoints: ['From collaboration to control', 'Next module'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 240_000,
    maxTimeoutMs: 300_000,
    budget: { maxSteps: 6 },
    costNotice:
      'Offline is free (scripted models). Live makes one lead call, two or three researcher runs of up to 6 steps, one synthesis and one fact-check on your provider key. Waiting for your approval does not count against the timeout.',
  },
  tags: ['multi-agent', 'capstone', 'citations', 'fact-checking', 'human-in-the-loop'],
} satisfies LabDefinitionInput;
