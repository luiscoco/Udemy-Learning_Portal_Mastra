import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

const question = 'How does a Mastra workflow run its steps?';

export const lab56Definition = {
  id: 'lab-56',
  number: 56,
  title: 'Trace events',
  moduleId: 'module-12',
  summary:
    'Instrument a Mastra workflow with three agents using the official @mastra/observability adapter, collect its spans with your own exporter, show them as a span tree, and verify that parents, trace ids and correlation ids stay coherent.',
  concept:
    'A trace is a tree of spans: each span is one unit of work with a start, an end, a type and a parent. Mastra creates spans for workflow runs, steps, parallel blocks, agent runs, model generations and steps, tool calls and more, as soon as an Observability instance is configured. ' +
    'In @mastra/observability, an Observability config lists exporters, and an exporter is a class (here a BaseExporter subclass) that receives span_started, span_updated and span_ended events. This lab’s exporter keeps the events of one run in memory and writes each ended span to the log; other exporters send the same events to a storage or a tracing platform. ' +
    'Spans nest automatically: a step that calls a registered agent through mastra.getAgent() gets the agent run as its child, and a tool call appears under the model step that requested it. ' +
    'Correlation is what connects the trace to the outside world: the run is started with tracingOptions metadata (this lab’s correlation id and run id), which Mastra copies onto every span, and the run result returns the trace id and root span id so they can be matched. ' +
    'The lab checks the structure instead of trusting it: every span ends once, all spans share one trace with one root, each parent exists and contains its child in time, and every agent call the app made has its agent span under the step that made it. ' +
    'Two faults show what breaks: a failing tool must leave its error on exactly that tool span (message only, the stack trace is not exported), and an agent that is not registered on Mastra runs without producing any span, a blind spot the lab has to detect from its own call log.',
  objectives: [
    'Configure @mastra/observability with a custom exporter',
    'Read the span hierarchy of workflows, agents, models and tools',
    'Propagate a correlation id onto every span',
    'Verify parent-child coherence and detect untraced work',
  ],
  prerequisites: ['lab-55'],
  inputs: [
    {
      kind: 'textarea',
      name: 'question',
      label: 'Question',
      minLength: 5,
      maxLength: 500,
      rows: 2,
      default: question,
      required: true,
    },
    {
      kind: 'select',
      name: 'fault',
      label: 'Fault',
      options: [
        { value: 'none', label: 'None' },
        { value: 'tool-error', label: 'Tool error (first search fails)' },
        { value: 'detached-agent', label: 'Detached agent (not registered on Mastra)' },
      ],
      default: 'none',
      required: true,
    },
    {
      kind: 'select',
      name: 'view',
      label: 'Span view',
      options: [
        { value: 'summary', label: 'Summary (workflow, agents, models, tools)' },
        { value: 'full', label: 'Full (every span)' },
      ],
      default: 'summary',
      required: true,
    },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model (live)',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
      default: 'openai/gpt-5-mini',
      required: true,
    },
  ],
  exampleInput: { question, fault: 'none', view: 'summary', modelId: 'openai/gpt-5-mini' },
  expectedOutput: {
    description:
      'One trace with a workflow run root. Under it: the classify step, a parallel span with the research and review steps, and the answer step. Each of those three steps has its agent run (researcher, reviewer, writer) with a model generation; the researcher’s search_sources tool call sits under its model step. Every span carries the run’s correlation id.',
    example: {
      workflowStatus: 'success',
      lifecycle: { missingEnd: [], endedWithoutStart: [], endedTwice: [] },
      coherence: { orphans: [], outsideParent: [], misplacedSteps: [], strayTools: [] },
    },
  },
  guide: {
    procedure: [
      'Open run.ts in the Source tab: find the Observability config, the exporter and the tracingOptions.',
      'Run the example and expand the span tree: which span is the parent of the research step, and which span holds the tool call?',
      'Switch the span view to Full and run again: which span types were hidden, and do the parents still make sense?',
      'Choose “Tool error”: which span shows the error, and does the run fail?',
      'Choose “Detached agent”: what is missing under the review step, and how does the lab notice?',
      'Compare the correlation id in the span tree header with the run’s events in the timeline.',
    ],
    prediction: 'With “Detached agent”, will the review step span still appear in the trace?',
    hints: [
      { level: 1, text: 'The step itself is run by the workflow, which Mastra traces.' },
      { level: 2, text: 'Only the agent call inside the step is invisible.' },
      {
        level: 3,
        text: 'Yes: the review step span is there, but it has no agent_run child, so the agent’s model calls are untraced.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Creating agents inside steps without registering them.',
        fix: 'Register agents on Mastra and fetch them with mastra.getAgent() so their spans nest.',
      },
      { mistake: 'Exporting error stacks to a browser.', fix: 'Export the error message only; stacks leak file paths.' },
      {
        mistake: 'Sleeping before reading exported spans.',
        fix: 'Call observability.flush() before reading, and shutdown() when done.',
      },
      {
        mistake: 'Correlating traces by time.',
        fix: 'Pass a correlation id in tracingOptions.metadata and match the trace id from the run result.',
      },
      { mistake: 'Hiding spans by deleting them from the tree.', fix: 'Re-parent their children to the nearest shown ancestor.' },
    ],
    challenge: {
      prompt:
        'Add a span processor or exporter option that hides the inputs of the researcher’s tool calls, and prove with a check that no tool span carries an input.',
      successCriteria: ['Tool spans have no input', 'Other spans are unchanged', 'The trace stays coherent'],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'What does an exporter receive from Mastra’s observability?',
      choices: ['Log lines', 'span_started, span_updated and span_ended events', 'Only finished traces', 'HTTP requests'],
      correctIndex: 1,
      explanation: 'Exporters get every span lifecycle event.',
    },
    {
      id: 'q2',
      prompt: 'Where does the researcher’s tool call span appear?',
      choices: ['Under the workflow run', 'Under the model step that requested it', 'In its own trace', 'Under the answer step'],
      correctIndex: 1,
      explanation: 'Tool calls are children of the model step that called them.',
    },
    {
      id: 'q3',
      prompt: 'How does the lab’s correlation id reach every span?',
      choices: [
        'Through the logger',
        'Through tracingOptions.metadata on the run',
        'Through the agents’ instructions',
        'It is guessed from time',
      ],
      correctIndex: 1,
      explanation: 'Mastra copies trace metadata onto every span of the trace.',
    },
    {
      id: 'q4',
      prompt: 'An agent created inside a step but not registered on Mastra runs. What does the trace show?',
      choices: ['A separate trace', 'An error span', 'No spans for that agent', 'Duplicate spans'],
      correctIndex: 2,
      explanation: 'Its work is invisible; only the app’s own call log reveals it.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Instrumented run', description: 'Observability config, tracingOptions, flush and checks.' },
    { path: 'collector.ts', title: 'Exporter', description: 'A BaseExporter subclass and the span lifecycle analysis.' },
    { path: 'pipeline.ts', title: 'Traced pipeline', description: 'Three registered agents in a workflow, and the faults.' },
    {
      path: 'coherence.ts',
      title: 'Coherence checks',
      description: 'Parents, time windows, agent and tool nesting, untraced work.',
    },
    { path: 'tree.ts', title: 'Span tree', description: 'Flattening, sanitised errors and the summary view.' },
  ],
  exercise: {
    instructions:
      'In your project, configure Observability with a custom exporter, start a workflow run with a correlation id in tracingOptions.metadata, flush, and print the span tree with each span’s type, parent and duration.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'spans-complete', label: 'Every started span ended exactly once' },
    { id: 'single-trace', label: 'All spans belong to the run’s trace, under one workflow-run root' },
    {
      id: 'parent-child-coherent',
      label: 'Every span has its parent in the trace and inside its time window; steps, agents and tools nest correctly',
    },
    {
      id: 'correlation-propagated',
      label: 'Every span carries the lab correlation id and run id; the root carries the tag and the workflow run id',
    },
    {
      id: 'errors-attributed',
      label: 'A tool failure is recorded on its own tool span (message only, no stack), and the run still succeeds',
    },
    { id: 'untraced-work-detected', label: 'Agent work that left no spans is detected and reported' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Spans and traces', minutes: 1, talkingPoints: ['Start, end, type, parent', 'Mastra span types'] },
      {
        title: 'The adapter',
        minutes: 1.5,
        talkingPoints: ['@mastra/observability', 'Exporters and BaseExporter', 'flush and shutdown'],
      },
      {
        title: 'Reading the tree',
        minutes: 1.5,
        talkingPoints: ['Workflow → step → agent → model → tool', 'Summary vs full view'],
      },
      { title: 'Correlation', minutes: 1, talkingPoints: ['tracingOptions.metadata', 'Trace id from the run result'] },
      {
        title: 'When traces lie',
        minutes: 2,
        talkingPoints: ['Tool errors on the right span', 'Unregistered agents are invisible'],
      },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 120_000,
    maxTimeoutMs: 240_000,
    budget: { maxSteps: 4 },
    costNotice:
      'Offline is free (scripted models; the spans are real Mastra spans). Live makes three agent runs (the researcher up to 4 steps) on your provider key.',
  },
  tags: ['observability', 'tracing', 'spans', 'correlation', 'exporters'],
} satisfies LabDefinitionInput;
