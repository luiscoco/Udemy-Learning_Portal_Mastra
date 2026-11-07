import { LABS } from './labs.js';

export type ProjectId = 'study-coach' | 'evaluation-studio' | 'publishing-studio';
export interface ProjectStage {
  id: string;
  title: string;
  goal: string;
  labs: string[];
  files: string[];
  evidence: string[];
}
export interface MilestoneProject {
  id: ProjectId;
  title: string;
  subtitle: string;
  outcome: string;
  stages: ProjectStage[];
}
const stage = (
  number: number,
  title: string,
  goal: string,
  labs: number[],
  files: string[],
  evidence: string[],
): ProjectStage => ({
  id: `M${String(number).padStart(2, '0')}`,
  title,
  goal,
  labs: labs.map((n) => `lab-${String(n).padStart(2, '0')}`),
  files,
  evidence,
});
export const MILESTONE_PROJECTS: MilestoneProject[] = [
  {
    id: 'study-coach',
    title: 'Study Coach',
    subtitle: 'Understand, ask and practise',
    outcome: 'Build a lesson-grounded Mastra coach with readable answers, recognition checks and recoverable learner work.',
    stages: [
      stage(
        1,
        'Create the coach foundation',
        'Create an ESM TypeScript app and register a named Mastra Agent behind a server API.',
        [1, 2, 3],
        ['src/mastra/agents/coach.ts', 'src/mastra/index.ts'],
        ['Node and pinned dependencies checked', 'Agent is registered by key and id', 'Offline startup uses no provider'],
      ),
      stage(
        2,
        'Teach with clear instructions',
        'Separate a learner question from trusted teaching instructions and validate all input.',
        [4, 6, 16],
        ['src/coach.ts', 'src/contracts.ts'],
        [
          'Empty and oversized questions rejected',
          'Instructions explain the selected concept',
          'Provider errors are actionable and masked',
        ],
      ),
      stage(
        3,
        'Stream readable answers',
        'Stream a coach answer and render safe Markdown with coloured TypeScript code.',
        [7, 8, 66, 67],
        ['src/server.ts', 'src/CoachPanel.tsx'],
        [
          'Incremental text appears',
          'Raw HTML and remote images do not execute',
          'Stop and disconnected streams remain incomplete',
        ],
      ),
      stage(
        4,
        'Ground the concept catalog',
        'Build searchable topic cards linked to the actual course source and version-matched documentation.',
        [5, 17, 18],
        ['src/concepts.ts', 'src/ConceptBrowser.tsx'],
        ['Every topic links to its lab', 'Code excerpts identify their source', 'Question shortcuts edit without submitting'],
      ),
      stage(
        5,
        'Add practice and feedback',
        'Add recognition checks with explanations and a next-step practice task.',
        [19, 20, 57],
        ['src/practice.ts', 'src/RecognitionCheck.tsx'],
        [
          'Wrong answers explain the concept',
          'Correct answers remain self-practice evidence',
          'Linked lab completion is unchanged',
        ],
      ),
      stage(
        6,
        'Remember learner work safely',
        'Scope drafts and practice evidence by learner and add bounded backup and recovery.',
        [21, 22, 23, 71],
        ['src/progress.ts', 'src/progress.test.ts'],
        ['Reload restores the same learner', 'Another learner sees no prior work', 'Unavailable storage has an export fallback'],
      ),
      stage(
        7,
        'Verify and package the coach',
        'Test the full offline learning path, accessibility and an optional explicitly authorized live turn.',
        [24, 25, 65, 74],
        ['README.md', 'tests/coach.test.ts', 'tests/coach.spec.ts'],
        [
          'Offline tests and production build pass',
          'Phone and both themes are readable',
          'Live receipt is separate from fixture evidence',
        ],
      ),
    ],
  },
  {
    id: 'evaluation-studio',
    title: 'Agent Evaluation Studio',
    subtitle: 'Run, inspect and improve',
    outcome:
      'Build an evidence-driven Mastra evaluation workbench with real execution traces, checks and controlled comparisons.',
    stages: [
      stage(
        8,
        'Define cases and baselines',
        'Create a case catalog with valid example inputs, expected results and explicit review criteria.',
        [6, 11, 57],
        ['src/cases.ts', 'src/baseline.ts'],
        ['Each case has a reproducible input', 'Expected output is explained', 'Baseline and experiment labels are distinct'],
      ),
      stage(
        9,
        'Execute bounded experiments',
        'Run registered agents and workflows through a validated server boundary with cancellation.',
        [12, 26, 27, 65],
        ['src/runner.ts', 'src/server.ts'],
        [
          'Actual run identity is visible',
          'Timeout and cancellation terminate observation',
          'Submitted TypeScript never executes in the API',
        ],
      ),
      stage(
        10,
        'Inspect tools and approvals',
        'Display actual tool calls, results and approval decisions rather than inferring them from answer text.',
        [13, 14, 15, 47],
        ['src/TraceInspector.tsx', 'src/approvals.ts'],
        [
          'Tool arguments and outcomes are inspectable',
          'A pending approval requires an explicit decision',
          'Declining causes no approved side effect',
        ],
      ),
      stage(
        11,
        'Compare workflow and retrieval evidence',
        'Evaluate routing, parallel steps, retrieval passages and citation failures against the stated case.',
        [28, 29, 30, 37, 44],
        ['src/criteria.ts', 'src/WorkflowEvidence.tsx'],
        [
          'Parallel and sequential steps are distinguished',
          'Citations point to returned evidence',
          'An unsupported answer fails a relevant check',
        ],
      ),
      stage(
        12,
        'Score and compare one change',
        'Run a fixed dataset and compare one controlled change against a recorded baseline.',
        [56, 57, 58, 59, 60],
        ['src/scoring.ts', 'src/comparison.ts'],
        [
          'Scores identify their case and revision',
          'A failed case is retained',
          'One variable changes between compared attempts',
        ],
      ),
      stage(
        13,
        'Persist and export reviews',
        'Keep bounded per-learner history and export inspectable evidence without tokens or credentials.',
        [61, 62, 64, 71],
        ['src/history.ts', 'src/export.ts'],
        [
          'Only completed observations become history entries',
          'Manual review remains separate from objective checks',
          'Backup contains no run capability',
        ],
      ),
      stage(
        14,
        'Harden the evaluation release',
        'Exercise fault, trust-boundary and regression fixtures before an optional paid model comparison.',
        [63, 65, 72, 74],
        ['tests/evaluation.test.ts', 'tests/evaluation.spec.ts', 'README.md'],
        [
          'Failures and cancellations never count as success',
          'No automatic paid retry occurs',
          'Offline CI and a documented live procedure exist',
        ],
      ),
    ],
  },
  {
    id: 'publishing-studio',
    title: 'Agent Publishing Studio',
    subtitle: 'Review, select and publish',
    outcome:
      'Build a Mastra answer-to-artifact studio with provenance, editable Word documents, PDF pages and styled infographics.',
    stages: [
      stage(
        15,
        'Create a grounded answer workspace',
        'Build a lesson-aware answer form with clearly separate offline and live provenance.',
        [3, 4, 6, 66],
        ['src/answer.ts', 'src/PublishingPanel.tsx'],
        [
          'Question and selected topic are visible',
          'Offline text is labelled authored guidance',
          'Live submission needs fresh consent',
        ],
      ),
      stage(
        16,
        'Select a completed response',
        'Store bounded immutable completed answers and select the exact response used for publishing.',
        [7, 8, 19, 67],
        ['src/answers.ts', 'src/AnswerHistory.tsx'],
        [
          'Partial streams cannot be published',
          'Selection survives editing a later question',
          'Answer identity and model provenance are retained',
        ],
      ),
      stage(
        17,
        'Build editable Word documents',
        'Generate valid OpenXML Word files with headings, body text and coloured code from the selected answer.',
        [20, 66, 72],
        ['src/docx.ts', 'tests/docx.test.ts'],
        ['Word opens the ZIP-based document', 'Complete code and indentation are retained', 'Untrusted XML is escaped'],
      ),
      stage(
        18,
        'Paginate readable PDF exports',
        'Generate a PDF that keeps the selected answer readable across page boundaries.',
        [65, 66, 72],
        ['src/pdf.ts', 'tests/pdf.spec.ts'],
        ['Long content paginates without clipping', 'Unicode and code are readable', 'Export states its rendering limitations'],
      ),
      stage(
        19,
        'Design a Mastra infographic',
        'Create a blue, mint and violet explanatory infographic with a concept flow and a bounded code excerpt.',
        [26, 34, 68],
        ['src/infographic.ts', 'src/ArtifactPreview.tsx'],
        [
          'Title and provenance match the selected answer',
          'Excerpt is labelled and code is coloured',
          'SVG and PNG contain the same composition',
        ],
      ),
      stage(
        20,
        'Use a local image style reference',
        'Validate one bounded PNG and adapt a deterministic palette and artwork without uploading it to a model.',
        [36, 63, 65],
        ['src/image-reference.ts', 'tests/image-reference.spec.ts'],
        [
          'Non-PNG and oversized images are refused',
          'Reference remains in this browser',
          'Approximate styling is not called AI image generation',
        ],
      ),
      stage(
        21,
        'Track evidence and package artifacts',
        'Keep per-learner project notes, answer provenance and downloadable Markdown/JSON build evidence.',
        [61, 62, 64, 71],
        ['src/evidence.ts', 'src/downloads.ts'],
        [
          'Another learner cannot see retained answers',
          'Restart and storage limitations are explicit',
          'Export metadata names the exact answer',
        ],
      ),
      stage(
        22,
        'Verify the publishing release',
        'Test hostile content, downloads, accessibility and deployment notes for the complete publishing workflow.',
        [72, 73, 74, 75],
        ['tests/publishing.spec.ts', 'README.md'],
        [
          'All five artifact formats open',
          'Keyboard, phone and themes work',
          'Prepared and optional live validation are reported honestly',
        ],
      ),
    ],
  },
];
export const projectById = (id: string) => MILESTONE_PROJECTS.find((p) => p.id === id);
export function stagePrompt(project: MilestoneProject, step: ProjectStage): string {
  return `# ${step.id}: ${step.title}\n\nBuild the ${project.title} milestone using the current Mastra TypeScript monorepo.\n\nGoal: ${step.goal}\n\nContinue the previous stages; preserve working code and lab routes. Inspect installed @mastra/core types and the linked tested lessons before choosing APIs. Keep credentials and Mastra on the server. Provide deterministic offline tests and require fresh consent for paid calls. Never execute submitted arbitrary code in the API.\n\nRelated lessons: ${step.labs.join(', ')}\nFiles to build or adapt:\n${step.files.map((f) => `- ${f}`).join('\n')}\n\nAcceptance evidence:\n${step.evidence.map((e) => `- ${e}`).join('\n')}\n\nShow the changed files, commands actually run, results, limitations and the next focused step. Opening a reference preview is not completion evidence.\n`;
}
export interface ProjectTopic {
  id: string;
  title: string;
  section: string;
  labId: string;
  introduction?: string;
}
export const PROJECT_TOPICS: ProjectTopic[] = [
  {
    id: 'llm',
    title: 'What is a language model?',
    section: 'Foundations',
    labId: 'lab-06',
    introduction:
      'A language model predicts useful text from instructions and input. API access, credentials and billing are separate from a consumer chat subscription.',
  },
  {
    id: 'agent',
    title: 'What is an agent?',
    section: 'Foundations',
    labId: 'lab-03',
    introduction:
      'A Mastra Agent combines a model with instructions and optional tools. The application owns validation, authorization and user experience.',
  },
  {
    id: 'harness',
    title: 'The application harness',
    section: 'Foundations',
    labId: 'lab-65',
    introduction:
      'The harness is the application around model calls: limits, cancellation, tool permissions, logs and evidence. A plausible answer does not prove that a tool ran.',
  },
  {
    id: 'mastra',
    title: 'Mastra and the TypeScript stack',
    section: 'Foundations',
    labId: 'lab-02',
    introduction:
      'Mastra is the server-side agent framework. This portal adds React, Express validation, typed transport, learner state and deterministic teaching fixtures.',
  },
  {
    id: 'first-answer',
    title: 'Your first generate() result',
    section: 'Foundations',
    labId: 'lab-06',
    introduction:
      'Define an Agent, call generate() on the server, inspect result.text and metadata, and handle errors before displaying a successful answer.',
  },
  ...LABS.map((lab) => ({ id: lab.id, title: lab.title, section: lab.moduleId, labId: lab.id })),
];
export const questionShortcuts = (title: string) => [
  `Explain ${title} step by step.`,
  `What source evidence supports ${title}?`,
  `Show a small TypeScript example for ${title}.`,
  `Explain ${title} in plain language.`,
  `Outline a complete Mastra app using ${title}, separating framework APIs from application code.`,
  `Compare ${title} with a simpler alternative.`,
  `What can fail when implementing ${title}?`,
  `How should I test ${title} offline?`,
  `What observable evidence proves ${title} worked?`,
  `Give me a short practice task for ${title}, with a hint first.`,
];
