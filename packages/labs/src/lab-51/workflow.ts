import { z } from 'zod';
import type { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { ConversationMessage } from '@mlp/contracts';
import type { RunContext } from '@mlp/lab-engine';
import { streamAgent, type ToolTrace } from '../shared/tool-stream.js';
import { prompts, type Notebook } from './agents.js';
import {
  formatNotes,
  IssueSchema,
  mergeIssues,
  NoteSchema,
  ReviewSchema,
  sentencesOf,
  structuralIssues,
  type Issue,
} from './grounding.js';

export const SLIPS = {
  none: null,
  'uncited-claim': 'Mastra workflows were first designed to steer spacecraft.',
  'unknown-citation': 'Steps can also be written in Python [9].',
  'unsupported-claim': 'Each step is billed by the second on a GPU cluster [1].',
} as const;
export type Slip = keyof typeof SLIPS;

const BriefSchema = z.object({ request: z.string(), maxWords: z.number() });
const ResearchedSchema = BriefSchema.extend({ notes: z.array(NoteSchema) });
/** The review loop's state: fed back into the same step by .dountil(). */
export const LoopStateSchema = ResearchedSchema.extend({
  draft: z.string(),
  revisions: z.number().int(),
  approved: z.boolean(),
  exhausted: z.boolean(),
  issues: z.array(IssueSchema),
});
export const FinalSchema = z.object({
  status: z.enum(['published', 'needs-human']),
  text: z.string(),
  revisions: z.number().int(),
  issues: z.array(IssueSchema),
});
export type Final = z.infer<typeof FinalSchema>;

export interface ReviewRecord {
  round: number;
  /** The reviewer model's own verdict and issues (structured output). */
  modelApproved: boolean;
  modelIssues: Issue[];
  /** Issues the orchestrator found itself (never delegated to a model). */
  structuralIssues: Issue[];
  issues: Issue[];
  approved: boolean;
}
export interface DraftRecord {
  round: number;
  text: string;
  injected: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = Agent<any, any, any, any, any>;

export interface Orchestration {
  ctx: RunContext<unknown>;
  researcher: AnyAgent;
  editor: AnyAgent;
  notebook: Notebook;
  slip: Slip;
  maxRevisions: number;
  post: (m: Omit<ConversationMessage, 'seq'>) => void;
  /** Evidence collected while the workflow runs. */
  record: {
    researcherTools: ToolTrace[];
    editorTools: ToolTrace[];
    editorSawNotes: boolean[];
    drafts: DraftRecord[];
    reviews: ReviewRecord[];
  };
}

/**
 * research → draft → dountil(review-and-revise) → publish. The workflow owns every handoff: the agents
 * never call each other, and each one sees only the payload its step gives it.
 */
export function buildResearchEditorWorkflow(o: Orchestration) {
  const { ctx, record } = o;

  const research = createStep({
    id: 'research',
    description: 'The researcher searches the source pack and records grounded findings.',
    inputSchema: BriefSchema,
    outputSchema: ResearchedSchema,
    execute: async ({ inputData }) => {
      const task = prompts.research(inputData.request);
      o.post({
        from: 'orchestrator',
        to: 'researcher',
        kind: 'task',
        stepId: 'research',
        round: null,
        summary: 'Research request',
        content: task,
      });
      const res = await streamAgent(ctx, o.researcher, task, { maxSteps: 6, emitTokens: false });
      record.researcherTools.push(...res.tools);
      const notes = o.notebook.notes.map((n) => ({ ...n }));
      if (notes.length === 0) throw new Error('The researcher recorded no grounded findings.');
      o.post({
        from: 'researcher',
        to: 'editor',
        kind: 'notes',
        stepId: 'research',
        round: null,
        summary: `${notes.length} grounded notes${o.notebook.rejected.length ? ` (${o.notebook.rejected.length} rejected)` : ''}`,
        content: formatNotes(notes),
      });
      return { ...inputData, notes };
    },
  });

  const draft = createStep({
    id: 'draft',
    description: 'The editor writes a cited draft from the notes only.',
    inputSchema: ResearchedSchema,
    outputSchema: LoopStateSchema,
    execute: async ({ inputData }) => {
      const brief = prompts.draft(inputData.request, inputData.maxWords, inputData.notes);
      record.editorSawNotes.push(brief.includes(formatNotes(inputData.notes)));
      const res = await streamAgent(ctx, o.editor, brief, { maxSteps: 1, emitTokens: false });
      record.editorTools.push(...res.tools);
      const planted = SLIPS[o.slip];
      const text = planted ? `${res.text.trim()} ${planted}` : res.text.trim();
      record.drafts.push({ round: 0, text, injected: planted });
      o.post({
        from: 'editor',
        to: 'researcher',
        kind: 'draft',
        stepId: 'draft',
        round: 0,
        summary: `First draft, ${sentencesOf(text).length} sentences${planted ? ' (one sentence planted by the lab)' : ''}`,
        content: text,
        ...(planted ? { injected: true } : {}),
      });
      return { ...inputData, draft: text, revisions: 0, approved: false, exhausted: false, issues: [] };
    },
  });

  const reviewAndRevise = createStep({
    id: 'review-and-revise',
    description: 'The researcher reviews the draft; the editor revises while issues remain and revisions are left.',
    inputSchema: LoopStateSchema,
    outputSchema: LoopStateSchema,
    execute: async ({ inputData: s }) => {
      const round = s.revisions;
      const r = await o.researcher.generate(prompts.review(s.notes, s.draft), {
        structuredOutput: { schema: ReviewSchema },
        toolChoice: 'none',
        abortSignal: ctx.signal,
      });
      const model = ReviewSchema.parse(r.object);
      const structural = structuralIssues(s.draft, s.notes);
      const issues = mergeIssues(model.issues, structural);
      const approved = issues.length === 0;
      record.reviews.push({
        round,
        modelApproved: model.approved,
        modelIssues: model.issues,
        structuralIssues: structural,
        issues,
        approved,
      });
      o.post({
        from: 'researcher',
        to: 'editor',
        kind: 'review',
        stepId: 'review-and-revise',
        round,
        summary: approved
          ? 'Approved'
          : `${issues.length} issue(s)${structural.length ? `, ${structural.length} found by the orchestrator's own check` : ''}`,
        content: approved ? 'No issues.' : issues.map((i) => `- "${i.sentence}" (${i.kind}): ${i.problem}`).join('\n'),
      });
      if (approved) return { ...s, approved, issues };
      if (s.revisions >= o.maxRevisions) return { ...s, exhausted: true, issues };

      const res = await streamAgent(ctx, o.editor, prompts.revise(s.notes, s.draft, issues), { maxSteps: 1, emitTokens: false });
      record.editorTools.push(...res.tools);
      const text = res.text.trim();
      record.drafts.push({ round: round + 1, text, injected: null });
      o.post({
        from: 'editor',
        to: 'researcher',
        kind: 'revision',
        stepId: 'review-and-revise',
        round: round + 1,
        summary: `Revision ${round + 1}, ${sentencesOf(text).length} sentences`,
        content: text,
      });
      return { ...s, draft: text, revisions: s.revisions + 1, issues };
    },
  });

  const publish = createStep({
    id: 'publish',
    description: 'Publishes an approved draft; otherwise hands the remaining issues to a human.',
    inputSchema: LoopStateSchema,
    outputSchema: FinalSchema,
    execute: async ({ inputData: s }) => {
      if (s.approved) {
        o.post({
          from: 'editor',
          to: 'orchestrator',
          kind: 'final',
          stepId: 'publish',
          round: s.revisions,
          summary: 'Approved text published',
          content: s.draft,
        });
        return { status: 'published' as const, text: s.draft, revisions: s.revisions, issues: [] };
      }
      o.post({
        from: 'orchestrator',
        to: 'human',
        kind: 'escalation',
        stepId: 'publish',
        round: s.revisions,
        summary: `Not published: ${s.issues.length} issue(s) left after ${s.revisions} revision(s)`,
        content: s.issues.map((i) => `- "${i.sentence}" (${i.kind}): ${i.problem}`).join('\n'),
      });
      return { status: 'needs-human' as const, text: '', revisions: s.revisions, issues: s.issues };
    },
  });

  return createWorkflow({ id: 'research-editor-workflow', inputSchema: BriefSchema, outputSchema: FinalSchema })
    .then(research)
    .then(draft)
    .dountil(reviewAndRevise, async ({ inputData }) => inputData.approved || inputData.exhausted)
    .then(publish)
    .commit();
}
