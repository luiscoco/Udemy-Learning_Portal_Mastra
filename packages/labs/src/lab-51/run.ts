import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type AgentConversation, type ConversationMessage, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { runTypedWorkflow } from '../shared/workflow-stream.js';
import {
  EDITOR_INSTRUCTIONS,
  editorScript,
  Notebook,
  RESEARCHER_INSTRUCTIONS,
  researcherScript,
  researcherTools,
} from './agents.js';
import { structuralIssues, type Issue, type Note } from './grounding.js';
import { lab51Definition } from './definition.js';
import { sourceById } from './sources.js';
import {
  buildResearchEditorWorkflow,
  FinalSchema,
  SLIPS,
  type DraftRecord,
  type Final,
  type Orchestration,
  type ReviewRecord,
} from './workflow.js';

export const Lab51InputSchema = z.object({
  request: z.string().trim().min(10).max(500),
  maxWords: z.number().int().min(30).max(200),
  editorSlip: z.enum(Object.keys(SLIPS) as [keyof typeof SLIPS, ...(keyof typeof SLIPS)[]]),
  maxRevisions: z.number().int().min(0).max(3),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab51Input = z.infer<typeof Lab51InputSchema>;

export interface Lab51Output {
  status: string;
  /** Steps in the order they ran (from the stream; a loop step appears once per iteration). */
  stepPath: string[];
  notes: Note[];
  rejectedFindings: { claim: string; sourceId: string; reason: string }[];
  drafts: DraftRecord[];
  reviews: ReviewRecord[];
  revisions: number;
  iterations: number;
  final: Final | null;
  slip: { kind: Lab51Input['editorSlip']; sentence: string } | null;
  roles: Record<'researcher' | 'editor', { tools: string[]; toolCalls: string[] }>;
  /** For each editor draft: did its prompt contain exactly the notes (the handoff payload)? */
  editorSawNotes: boolean[];
  agentConversation: AgentConversation;
  error: string | null;
}

const AGENTS = (researcherToolNames: string[]): AgentConversation['agents'] => [
  { id: 'orchestrator', name: 'Workflow (orchestrator)', role: 'Owns the order of steps and every handoff', tools: [] },
  { id: 'researcher', name: 'Research agent', role: 'Finds and records grounded facts; reviews drafts', tools: researcherToolNames },
  { id: 'editor', name: 'Editor agent', role: 'Writes and revises the text from the notes only', tools: [] },
];
export const STEP_PATH = /^research,draft(,review-and-revise)+,publish$/;

export const lab51: LabImplementation<Lab51Input, Lab51Output, LabServices> = {
  definition: lab51Definition as LabDefinition,
  inputSchema: Lab51InputSchema,

  async run(ctx, input) {
    const notebook = new Notebook();
    const tools = researcherTools(notebook);
    const researcherModel = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: researcherScript() });
    const editorModel = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: editorScript() });
    const researcher = withLabLogger(
      ctx,
      new Agent({ id: 'researcher', name: 'Research agent', instructions: RESEARCHER_INSTRUCTIONS, model: researcherModel.model, tools }),
    );
    const editor = withLabLogger(
      ctx,
      new Agent({ id: 'editor', name: 'Editor agent', instructions: EDITOR_INSTRUCTIONS, model: editorModel.model }),
    );

    const messages: ConversationMessage[] = [];
    const record: Orchestration['record'] = { researcherTools: [], editorTools: [], editorSawNotes: [], drafts: [], reviews: [] };
    const workflow = buildResearchEditorWorkflow({
      ctx,
      researcher,
      editor,
      notebook,
      slip: input.editorSlip,
      maxRevisions: input.maxRevisions,
      record,
      post: (m) => {
        messages.push({ seq: messages.length + 1, ...m });
        ctx.log('info', `${m.from} → ${m.to} [${m.kind}${m.round === null ? '' : ` r${m.round}`}]: ${m.summary}`);
      },
    });
    const res = await runTypedWorkflow(
      ctx,
      'research-editor-workflow',
      await workflow.createRun(),
      { request: input.request, maxWords: input.maxWords },
      FinalSchema,
    );
    ctx.setResultExtras({
      effective: {
        mode: ctx.mode,
        modelId: input.modelId,
        simulated: researcherModel.simulated,
        maxRevisions: input.maxRevisions,
      },
    });

    const final = res.typed;
    const planted = SLIPS[input.editorSlip];
    const outcome: AgentConversation['outcome'] = final
      ? { status: final.status, text: final.text, issues: final.issues.map((i) => `${i.sentence} (${i.kind})`) }
      : { status: 'failed', text: '', issues: [res.error ?? 'the workflow did not finish'] };
    return {
      status: res.status,
      // .dountil() leaves Mastra's stepExecutionPath empty, so the path comes from the streamed step results.
      stepPath: res.steps.map((s) => s.stepId).filter((id) => id !== 'research-editor-workflow'),
      notes: notebook.notes,
      rejectedFindings: notebook.rejected,
      drafts: record.drafts,
      reviews: record.reviews,
      revisions: final?.revisions ?? Math.max(0, record.drafts.length - 1),
      iterations: record.reviews.length,
      final,
      slip: planted ? { kind: input.editorSlip, sentence: planted } : null,
      roles: {
        researcher: { tools: Object.keys(tools), toolCalls: record.researcherTools.map((t) => t.toolName) },
        editor: { tools: [], toolCalls: record.editorTools.map((t) => t.toolName) },
      },
      editorSawNotes: record.editorSawNotes,
      agentConversation: { agents: AGENTS(Object.keys(tools)), messages, outcome },
      error: res.error ?? null,
    };
  },

  validate(out, input) {
    const kinds = new Set(out.agentConversation.messages.map((m) => m.kind));
    const steps = new Set(out.stepPath);
    const handoffsOk =
      STEP_PATH.test(out.stepPath.join(',')) &&
      out.agentConversation.messages.every((m) => steps.has(m.stepId)) &&
      ['task', 'notes', 'draft', 'review'].every((k) => kinds.has(k as never)) &&
      (kinds.has('final') || kinds.has('escalation')) &&
      out.editorSawNotes.length > 0 &&
      out.editorSawNotes.every(Boolean);

    const notesOk =
      out.notes.length > 0 &&
      out.notes.every((n) => (sourceById(n.sourceId)?.text.replace(/\s+/g, ' ') ?? '').includes(n.quote));

    const loopOk =
      out.revisions <= input.maxRevisions &&
      out.iterations === out.revisions + 1 &&
      out.stepPath.filter((s) => s === 'review-and-revise').length === out.iterations;

    const f = out.final;
    const planted = out.slip?.sentence ?? null;
    const lastReview = out.reviews.at(-1);
    const finalOk =
      !!f &&
      (f.status === 'published'
        ? f.text.trim().length > 0 &&
          structuralIssues(f.text, out.notes).length === 0 &&
          !!lastReview?.approved &&
          (!planted || !f.text.includes(planted))
        : f.text === '' && f.issues.length > 0 && out.revisions === input.maxRevisions);

    const firstIssues: Issue[] = out.reviews[0]?.issues ?? [];
    const caught = !planted || firstIssues.some((i) => i.sentence.includes(planted) || planted.includes(i.sentence.trim()));
    const researcherOnly = out.roles.researcher.toolCalls.every((t) => out.roles.researcher.tools.includes(t));
    return summarizeChecks([
      {
        id: 'roles-separated',
        label: 'Two separate agents: only the researcher has and uses tools; the editor writes without tools',
        passed: out.roles.editor.toolCalls.length === 0 && out.roles.researcher.toolCalls.length > 0 && researcherOnly,
        message: `researcher: ${out.roles.researcher.toolCalls.join(', ') || 'no calls'}; editor: ${out.roles.editor.toolCalls.join(', ') || 'no tool calls'}`,
      },
      {
        id: 'explicit-handoffs',
        label: 'Every message travels through a workflow step, and the editor receives exactly the recorded notes',
        passed: handoffsOk,
        message: `path: ${out.stepPath.join(' → ') || 'none'}; ${out.agentConversation.messages.length} messages`,
      },
      {
        id: 'notes-grounded',
        label: 'Every note quotes its source verbatim',
        passed: notesOk,
        message: `${out.notes.length} notes, ${out.rejectedFindings.length} findings rejected by record_finding`,
      },
      {
        id: 'review-loop-bounded',
        label: 'The review loop ran once per revision plus one, within the revision limit',
        passed: loopOk,
        message: `${out.iterations} review(s), ${out.revisions} revision(s), limit ${input.maxRevisions}`,
      },
      {
        id: 'slip-caught',
        label: 'A planted editor slip is reported by the first review',
        passed: caught,
        message: planted ? `${input.editorSlip}: ${caught ? 'caught' : 'missed'}` : 'no slip planted',
      },
      {
        id: 'final-grounded',
        label: 'Only an approved, fully cited text is published; otherwise it goes to a human with the issues',
        passed: finalOk,
        message: f ? `${f.status}${f.issues.length ? `: ${f.issues.length} issue(s) left` : ''}` : (out.error ?? 'no result'),
      },
    ]);
  },
};
