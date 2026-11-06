import type { LabDefinition, SourceFile } from '@mlp/contracts';

/** Editorial concept paths, aligned with this portal's stable lab numbers (not video lesson numbers). */
export const CONCEPT_FLOWS: readonly (readonly [string, string, string, string])[] = [
  ['Learner input', 'Offline exercise', 'Streamed events', 'Checks and progress'],
  ['Project settings', 'Generated files', 'TypeScript build', 'Clean workspace'],
  ['Project tree', 'File responsibilities', 'Runtime entry', 'Architecture checks'],
  ['Agent definition', 'Mastra registration', 'Agent lookup', 'Generated answer'],
  ['Provider model', 'System instructions', 'User prompt', 'Response behavior'],
  ['Registered agents', 'Studio inspection', 'Model selection', 'Read the result'],
  ['Prompt', 'Agent generation', 'Complete text', 'Usage and checks'],
  ['Instruction variant', 'Same question', 'Model response', 'Compare behavior'],
  ['Start request', 'Text deltas', 'Incremental display', 'Explicit completion'],
  ['Output schema', 'Model response', 'Schema validation', 'Typed JSON result'],
  ['Failure scenario', 'Bounded retries', 'Deadline or abort', 'Safe outcome'],
  ['Tool definition', 'Model tool call', 'Tool execution', 'Final answer'],
  ['Untrusted arguments', 'Zod validation', 'Accepted tool call', 'Validated result'],
  ['Available tools', 'Model selection', 'Tool observations', 'Combined answer'],
  ['Tool arguments', 'External request', 'Bounded response', 'Safe error handling'],
  ['Proposed action', 'Policy and approval', 'Allowed execution', 'Audit evidence'],
  ['Request settings', 'Dynamic instructions', 'Agent behavior', 'Compare answers'],
  ['Request context', 'Typed values', 'Agent or tool access', 'Context evidence'],
  ['Tenant context', 'Tool constraints', 'Scoped lookup', 'Permitted result'],
  ['Model capabilities', 'Execution settings', 'Effective options', 'Inspect limits'],
  ['Input processing', 'Agent execution', 'Output processing', 'Accepted response'],
  ['Conversation turn', 'Message storage', 'Reload history', 'Contextual response'],
  ['Signed-in learner', 'Owned thread', 'Scoped messages', 'Isolation checks'],
  ['Working memory', 'Update facts', 'Next turn context', 'Recall evidence'],
  ['Earlier messages', 'Semantic search', 'Relevant memories', 'Grounded reply'],
  ['Conversation history', 'Observations', 'Condensed context', 'Later recall'],
  ['Input contract', 'Typed step', 'Workflow result', 'Output validation'],
  ['Initial input', 'First step', 'Next step', 'Combined result'],
  ['Shared input', 'Parallel branches', 'Wait for results', 'Join outputs'],
  ['Condition input', 'Choose branch', 'Execute selected path', 'Inspect skipped path'],
  ['Input collection', 'Per-item step', 'Bounded concurrency', 'Ordered results'],
  ['Parent input', 'Child workflow', 'Nested step events', 'Parent result'],
  ['Workflow run', 'Suspend checkpoint', 'Resume data', 'Continued execution'],
  ['Requested action', 'Human decision', 'Approve or decline', 'Recorded outcome'],
  ['Durable checkpoint', 'Interruption', 'Explicit recovery', 'Idempotent effects'],
  ['Business request', 'Coordinated steps', 'Approval boundary', 'Business evidence'],
  ['Uploaded document', 'Validated format', 'Extracted text', 'Ingestion evidence'],
  ['Document text', 'Chunk strategy', 'Boundaries and overlap', 'Compare chunks'],
  ['Text chunks', 'Embedding vectors', 'Vector storage', 'Persisted records'],
  ['Search question', 'Query vector', 'Nearest candidates', 'Retrieved passages'],
  ['User question', 'Retrieved evidence', 'Agent answer', 'Grounding checks'],
  ['Search context', 'Metadata filter', 'Permitted candidates', 'Filtered results'],
  ['Search question', 'Keyword and vector', 'Result fusion', 'Compare rankings'],
  ['Initial candidates', 'Relevance scoring', 'Reranked passages', 'Context selection'],
  ['Retrieved sources', 'Generated claims', 'Citation verification', 'Inspectable passages'],
  ['Question fixtures', 'RAG execution', 'Quality measures', 'Regression evidence'],
  ['MCP server', 'Connection lifecycle', 'Discovered capabilities', 'Clean disconnect'],
  ['Tool discovery', 'Input schema', 'Validated call', 'Tool result'],
  ['Server capabilities', 'Resources or prompts', 'Explicit fallback', 'Capability evidence'],
  ['Mastra tools', 'MCP facade', 'Client invocation', 'Transport cleanup'],
  ['Multiple MCP servers', 'Namespaced tools', 'Agent selection', 'Combined evidence'],
  ['Initial task', 'Agent collaboration', 'Intermediate messages', 'Shared outcome'],
  ['Active agent', 'Handoff decision', 'Cycle boundary', 'Resolution or escalation'],
  ['Supervisor task', 'Delegate work', 'Bounded coordination', 'Final decision'],
  ['Workflow plan', 'Agent-owned steps', 'Retry boundaries', 'Coordinated result'],
  ['Research questions', 'Pooled source notes', 'Human review', 'Verified publication'],
  ['Execution events', 'Nested spans', 'Error attribution', 'Trace inspection'],
  ['Candidate answer', 'Scoring function', 'Score and rationale', 'Fixture assertions'],
  ['Dataset cases', 'Versioned revision', 'Evaluation run', 'Stored assertions'],
  ['Baseline', 'Candidate settings', 'Comparable measures', 'Regression decision'],
  ['Stored run metrics', 'Quality summaries', 'Regression signal', 'Open related trace'],
  ['Session request', 'Authentication', 'Protected action', 'Account evidence'],
  ['Learner identity', 'Tenant partition', 'Owned resources', 'Cross-account refusal'],
  ['Untrusted content', 'Instruction boundary', 'Action policy', 'Verified evidence'],
  ['Proposed tool call', 'Policy decision', 'Learner approval', 'Audit verification'],
  ['Injected fault', 'Bounded execution', 'Cancel or timeout', 'Recovery checks'],
  ['React controls', 'Typed API client', 'Validated SSE', 'Accessible result'],
  ['User message', 'Streamed reply', 'Stop or retry', 'Thread history'],
  ['Workflow graph', 'Step events', 'Live node status', 'Accessible step list'],
  ['Speech or text', 'Transcription', 'Agent answer', 'Audio or fallback'],
  ['Knowledge documents', 'Agent conversation', 'Tasks and tools', 'Evidence inspector'],
  ['Durable state', 'Process restart', 'Verified recovery', 'Backup and retention'],
  ['Server configuration', 'Validation and secrets', 'Production bundle', 'Readiness checks'],
  ['Deployment inputs', 'Staging revision', 'Health and streaming', 'Rollback evidence'],
  ['Regression scenarios', 'Security and limits', 'Offline checks', 'Release evidence'],
  ['Authenticated case', 'Tools and evidence', 'Approval boundary', 'Verified resolution'],
];

export interface GuidePhase {
  title: string;
  summary: string;
  details: string[];
  target: 'learn' | 'run' | 'source' | 'notes';
}
export interface TeachingExcerpt {
  path: string;
  line: number;
  language: string;
  code: string;
}

export function walkthroughPhases(d: LabDefinition): GuidePhase[] {
  return [
    { title: 'Understand the goal', summary: d.summary, details: [d.concept, ...d.objectives], target: 'learn' },
    {
      title: 'Prepare the exercise',
      summary: d.guide.procedure[0]!,
      details: [
        d.prerequisites.length ? `Review prerequisites: ${d.prerequisites.join(', ')}.` : 'No earlier lab is required.',
        ...d.guide.procedure.slice(0, 2),
        'Read the prerequisite and execution notices before starting. Keep credentials on the server.',
      ],
      target: 'learn',
    },
    {
      title: 'Run a baseline',
      summary: 'Use the actual example inputs. Start in Offline and press Run yourself.',
      details: [d.exercise.instructions, ...d.guide.procedure.slice(1, 4), d.execution.costNotice],
      target: 'run',
    },
    {
      title: 'Inspect the evidence',
      summary: d.expectedOutput.description,
      details: d.checks.map((c) => c.label),
      target: 'run',
    },
    {
      title: 'Change one scenario',
      summary: d.guide.challenge.prompt,
      details: [
        ...d.guide.challenge.successCriteria,
        'Change one input or condition, predict the difference, then deliberately run again and compare the evidence.',
      ],
      target: 'source',
    },
    {
      title: 'Explain and record',
      summary: d.guide.prediction,
      details: [
        'Record your prediction, observed result and explanation in My notes.',
        'Explain which checks support your conclusion and what the run does not prove.',
        'Reading this walkthrough does not mark the lesson read, run an exercise or pass the quiz.',
      ],
      target: 'notes',
    },
  ];
}

/** Select original reference code only. No solutions, runtime evaluation or generated SDK samples. */
export function teachingExcerpt(d: LabDefinition, files: SourceFile[]): TeachingExcerpt | null {
  const declared = new Set([...d.sourceFiles.map((f) => f.path), d.exercise.starterFile].filter(Boolean));
  const candidates = files.filter(
    (f) =>
      declared.has(f.path) && f.path !== d.exercise.solutionFile && !/solution/i.test(f.path) && /\.(ts|tsx|json)$/.test(f.path),
  );
  const file = candidates.find((f) => f.path === 'run.ts') ?? candidates[0];
  if (!file) return null;
  const lines = file.code.replace(/\r\n/g, '\n').split('\n');
  const native = /new Agent\(|createTool\(|createWorkflow\(|createStep\(|\.generate\(|\.stream\(|new MCPClient\(|new Memory\(/;
  let start = lines.findIndex((line) => native.test(line));
  if (start < 0)
    start = lines.findIndex((line) => /async run\(|z\.object\(|z\.strictObject\(|export (const|function)/.test(line));
  start = Math.max(0, start);
  const excerpt = lines.slice(start, start + 10);
  const indent = Math.min(...excerpt.filter((line) => line.trim()).map((line) => /^\s*/.exec(line)![0].length));
  return {
    path: file.path,
    line: start + 1,
    language: file.language,
    code: excerpt.map((line) => line.slice(Math.min(indent, /^\s*/.exec(line)![0].length))).join('\n'),
  };
}

export function guideTranscript(d: LabDefinition, kind: 'infographic' | 'walkthrough', excerpt: TeachingExcerpt | null): string {
  const flow = CONCEPT_FLOWS[d.number] ?? [];
  const body =
    kind === 'infographic'
      ? [
          d.concept,
          ...flow.map((label, i) => `### ${i + 1}. ${label}\n${d.objectives[i % d.objectives.length]}`),
          '## Objectives',
          ...d.objectives.map((o) => `- ${o}`),
          '## Expected evidence',
          d.expectedOutput.description,
          ...d.checks.map((c) => `- ${c.label}`),
        ]
      : walkthroughPhases(d).flatMap((phase, i) => [
          `## ${i + 1}. ${phase.title}`,
          phase.summary,
          ...phase.details.map((detail) => `- ${detail}`),
        ]);
  return [
    `# ${d.id}: ${d.title}`,
    kind === 'infographic' ? '## Infographic Content' : '## Exercise Walkthrough',
    ...body,
    '## Actual example input',
    '```json',
    JSON.stringify(d.exampleInput, null, 2),
    '```',
    ...(excerpt
      ? [
          '## Teaching source excerpt — surrounding setup omitted',
          `${excerpt.path}:${excerpt.line}`,
          `\`\`\`${excerpt.language}`,
          excerpt.code,
          '```',
        ]
      : []),
    'Teaching material, not proof of execution. This guide does not execute code or update progress.',
  ].join('\n\n');
}
