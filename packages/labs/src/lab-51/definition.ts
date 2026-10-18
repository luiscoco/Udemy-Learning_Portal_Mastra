import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const request = 'Explain to a beginner how a Mastra workflow runs its steps.';

export const lab51Definition = {
  id: 'lab-51',
  number: 51,
  title: 'Two collaborating agents',
  moduleId: 'module-11',
  summary:
    'Connect a research agent and an editor agent through an explicit Mastra workflow: the researcher records grounded notes, the editor writes a cited draft from those notes only, the researcher reviews it, and a bounded loop revises it before anything is published.',
  concept:
    'Two agents can collaborate without ever talking to each other directly: a workflow sits between them, decides who acts next and passes each one exactly the data it needs. ' +
    'Here the research agent has tools to search a small local source pack and to record findings, and record_finding rejects any quote that is not copied verbatim from its source, so every note is grounded by construction. ' +
    'The editor agent has no tools at all: its only input is the request plus the numbered notes, which is the explicit handoff payload, and it must cite a note at the end of every sentence. ' +
    'The researcher then reviews the draft with structured output, { approved, issues }, and the orchestrator adds its own structural check (uncited sentences, citations to notes that do not exist), because a model’s review alone is not a guarantee. ' +
    'While issues remain the editor revises, inside .dountil(), and the loop is bounded by a revision limit you choose: Mastra does not cap loops for you, so the condition must. ' +
    'Only an approved draft is published; otherwise the issues go to a human. ' +
    'To watch the review work, the lab can plant one bad sentence in the first draft: it is marked as injected in the transcript, which shows every message, every intermediate output and the final result.',
  objectives: [
    'Give two agents distinct roles, tools and instructions',
    'Connect them through workflow steps that own every handoff',
    'Review a draft with structured output plus a deterministic check',
    'Bound a review-and-revise loop and escalate when it is exhausted',
  ],
  prerequisites: ['lab-50'],
  inputs: [
    {
      kind: 'textarea',
      name: 'request',
      label: 'Request',
      minLength: 10,
      maxLength: 500,
      rows: 2,
      default: request,
      required: true,
    },
    { kind: 'number', name: 'maxWords', label: 'Maximum words', min: 30, max: 200, step: 10, default: 120, required: true },
    {
      kind: 'select',
      name: 'editorSlip',
      label: 'Plant an editor slip in the first draft',
      options: [
        { value: 'none', label: 'None' },
        { value: 'uncited-claim', label: 'A sentence without a citation' },
        { value: 'unknown-citation', label: 'A citation to a note that does not exist' },
        { value: 'unsupported-claim', label: 'A claim its cited note does not support' },
      ],
      default: 'none',
      required: true,
    },
    { kind: 'number', name: 'maxRevisions', label: 'Maximum revisions', min: 0, max: 3, step: 1, default: 2, required: true },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model (live)',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: { request, maxWords: 120, editorSlip: 'none', maxRevisions: 2, modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'The steps run research → draft → review-and-revise → publish. The researcher searches once and records three notes from S1, S2 and S3; the editor writes three cited sentences; the first review approves; the text is published. The transcript shows the task, the notes, the draft, the review and the final text.',
    example: {
      stepPath: ['research', 'draft', 'review-and-revise', 'publish'],
      roles: {
        researcher: { tools: ['search_sources', 'record_finding'], toolCalls: ['search_sources', 'record_finding', 'record_finding', 'record_finding'] },
        editor: { tools: [], toolCalls: [] },
      },
      revisions: 0,
      iterations: 1,
      final: {
        status: 'published',
        text: 'A Mastra workflow is a typed graph of steps that runs in a fixed, explicit order [1]. A step is created with createStep and declares an input schema, an output schema and an execute function [2]. In a workflow, the parallel method runs independent steps at the same time and joins their outputs by step id [3].',
        revisions: 0,
        issues: [],
      },
    },
  },
  guide: {
    procedure: [
      'Open workflow.ts in the Source tab and find the four steps and the .dountil() condition.',
      'Run the example and read the conversation from top to bottom: who sends what to whom, and in which step?',
      'Open agents.ts: which agent has tools, and what does record_finding refuse?',
      'Plant “A sentence without a citation” and run again: which review catches it, and what does the revision change?',
      'Plant “A citation to a note that does not exist” with Maximum revisions 0: what happens to the text?',
      'In live mode, plant “A claim its cited note does not support”: does the model reviewer catch it? The orchestrator’s structural check cannot.',
    ],
    prediction: 'With an uncited sentence planted and Maximum revisions 2, how many times does review-and-revise run?',
    hints: [
      { level: 1, text: 'Each iteration reviews the current draft once.' },
      { level: 2, text: 'The first review finds the planted sentence, so the editor revises once.' },
      { level: 3, text: 'Twice: review (issue) → revise, then review (approved). Iterations are always revisions + 1.' },
    ],
    commonMistakes: [
      { mistake: 'Letting the agents call each other freely.', fix: 'Route every handoff through a workflow step you can see and test.' },
      { mistake: 'Passing the whole conversation to the editor.', fix: 'Pass the minimum payload: the request and the numbered notes.' },
      { mistake: 'Trusting the reviewer model alone.', fix: 'Add a deterministic check for what code can verify, such as missing or unknown citations.' },
      { mistake: 'A dountil loop without a bound.', fix: 'Stop on approval or when the revision limit is reached; Mastra will not stop it for you.' },
      { mistake: 'Publishing the last draft when the loop gives up.', fix: 'Escalate to a human with the remaining issues instead.' },
    ],
    challenge: {
      prompt:
        'Add a third agent, a fact-checker with no tools, that reviews in parallel with the researcher (.parallel()), and approve only when both reviews pass.',
      successCriteria: ['Two review messages per round', 'Either reviewer can block publication', 'The loop stays bounded'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Who decides that the editor acts after the researcher?',
      choices: ['The researcher', 'The editor', 'The workflow', 'The model provider'],
      correctIndex: 2,
      explanation: 'The workflow fixes the order of steps in code; the agents never call each other.',
    },
    {
      id: 'q2',
      prompt: 'Why does record_finding check that the quote is verbatim?',
      choices: ['To save tokens', 'So every note is grounded in a real source', 'Because Mastra requires it', 'To speed up search'],
      correctIndex: 1,
      explanation: 'A finding with an invented quote is rejected before it reaches the editor.',
    },
    {
      id: 'q3',
      prompt: 'What ends the review-and-revise loop?',
      choices: [
        'Mastra’s default iteration cap',
        'Approval, or reaching the revision limit',
        'The editor deciding it is done',
        'A timeout only',
      ],
      correctIndex: 1,
      explanation: 'The dountil condition stops on approved || exhausted.',
    },
    {
      id: 'q4',
      prompt: 'The revision limit is reached with issues left. What happens?',
      choices: ['The last draft is published', 'The loop continues', 'Nothing is published; the issues go to a human', 'The notes are deleted'],
      correctIndex: 2,
      explanation: 'The outcome is needs-human, with the remaining issues.',
    },
  ],
  sourceFiles: [
    { path: 'workflow.ts', title: 'Orchestrating workflow', description: 'research → draft → dountil(review-and-revise) → publish.' },
    { path: 'agents.ts', title: 'The two agents', description: 'Researcher tools with the verbatim-quote guard, instructions, handoff prompts.' },
    { path: 'grounding.ts', title: 'Grounding checks', description: 'Sentences, citations, structural and support issues.' },
    { path: 'run.ts', title: 'Lab run', description: 'Agents, transcript, workflow run and checks.' },
  ],
  exercise: {
    instructions:
      'In your project, build a workflow that hands a researcher’s notes to an editor agent, reviews the draft with structured output, and loops at most twice before publishing or escalating.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'roles-separated', label: 'Two separate agents: only the researcher has and uses tools; the editor writes without tools' },
    {
      id: 'explicit-handoffs',
      label: 'Every message travels through a workflow step, and the editor receives exactly the recorded notes',
    },
    { id: 'notes-grounded', label: 'Every note quotes its source verbatim' },
    { id: 'review-loop-bounded', label: 'The review loop ran once per revision plus one, within the revision limit' },
    { id: 'slip-caught', label: 'A planted editor slip is reported by the first review' },
    {
      id: 'final-grounded',
      label: 'Only an approved, fully cited text is published; otherwise it goes to a human with the issues',
    },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Why an orchestrator', minutes: 1, talkingPoints: ['Agents decide, workflows fix the order', 'No direct agent-to-agent calls'] },
      { title: 'Two roles', minutes: 1.5, talkingPoints: ['Researcher tools', 'Verbatim-quote guard', 'Editor without tools'] },
      { title: 'Handoffs', minutes: 1.5, talkingPoints: ['Minimum payload', 'The transcript'] },
      { title: 'Review loop', minutes: 2, talkingPoints: ['Structured review', 'Deterministic check', 'dountil bound', 'Escalation'] },
      { title: 'Wrap-up', minutes: 1, talkingPoints: ['Next: handoffs between a triage agent and specialists'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 90_000,
    maxTimeoutMs: 180_000,
    budget: { maxSteps: 6 },
    costNotice:
      'Offline is free (two scripted models). Live makes up to 6 research steps, one draft, up to Maximum revisions + 1 reviews and Maximum revisions revisions on your provider key (at most 14 model calls).',
  },
  tags: ['multi-agent', 'workflows', 'orchestration', 'review-loop', 'grounding'],
} satisfies LabDefinitionInput;
