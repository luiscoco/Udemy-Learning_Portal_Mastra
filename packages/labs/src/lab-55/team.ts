import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { ConversationMessage } from '@mlp/contracts';
import type { RunContext } from '@mlp/lab-engine';
import type { PromptView, ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamAgent } from '../shared/tool-stream.js';
import {
  EDITOR_INSTRUCTIONS,
  editorScript,
  Notebook,
  prompts as l51,
  RESEARCHER_INSTRUCTIONS,
  researcherScript,
  researcherTools,
} from '../lab-51/agents.js';
import { formatNotes, IssueSchema, ReviewSchema, sentencesOf } from '../lab-51/grounding.js';
import { SLIPS, type Slip } from '../lab-51/workflow.js';
import { ClaimSchema, classifyClaims, type Claim } from './claims.js';
import {
  FACT_CHECKER_INSTRUCTIONS,
  ItemSchema,
  LEAD_INSTRUCTIONS,
  leadScript,
  PlanSchema,
  poolNotes,
  PooledNoteSchema,
  ResearchItemSchema,
  type PooledNote,
  type ResearchItem,
} from './plan.js';

export const WORKFLOW_ID = 'research-team-workflow';
export const APPROVE_STEP = 'approve';

const InputSchema = z.object({ question: z.string(), maxWords: z.number().int() });
const DraftSchema = z.object({ notes: z.array(PooledNoteSchema), draft: z.string(), injected: z.string().nullable() });
const CheckedSchema = DraftSchema.extend({
  claims: z.array(ClaimSchema),
  unmatched: z.array(IssueSchema),
  modelApproved: z.boolean(),
});
export const SuspendSchema = z.object({ supported: z.number().int(), flagged: z.number().int(), preview: z.string() });
export const ResumeSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reviewer: z.string().min(1).max(80),
  source: z.enum(['preset', 'learner', 'timeout']),
});
export type Resume = z.infer<typeof ResumeSchema>;
const ApprovedSchema = CheckedSchema.extend({ decision: ResumeSchema });
export const FinalSchema = z.object({
  status: z.enum(['published', 'rejected']),
  text: z.string(),
  claims: z.array(ClaimSchema),
  notes: z.array(PooledNoteSchema),
  decision: ResumeSchema,
});
export type Final = z.infer<typeof FinalSchema>;

export interface TeamDeps {
  ctx: RunContext<LabServices>;
  modelId: Parameters<LabServices['models']['resolve']>[0]['modelId'];
  slip: Slip;
  post: (m: Omit<ConversationMessage, 'seq'>) => void;
  rec: {
    subQuestions: string[];
    items: ResearchItem[];
    suspended: z.infer<typeof SuspendSchema> | null;
    simulated: boolean;
  };
}

/** plan → foreach(research) → pool → synthesize → fact-check → approve (suspend) → publish. */
export function buildTeamWorkflow(d: TeamDeps) {
  const { ctx } = d;
  const agent = (
    id: string,
    name: string,
    instructions: string,
    offline: (v: PromptView) => ScriptedTurn,
    tools?: Record<string, unknown>,
  ) => {
    const m = ctx.services.models.resolve({ mode: ctx.mode, modelId: d.modelId, offline });
    d.rec.simulated = m.simulated;
    return withLabLogger(ctx, new Agent({ id, name, instructions, model: m.model, ...(tools ? { tools: tools as never } : {}) }));
  };

  const plan = createStep({
    id: 'plan',
    description: 'The lead splits the question into sub-questions.',
    inputSchema: InputSchema,
    outputSchema: z.array(ItemSchema),
    execute: async ({ inputData }) => {
      d.post({
        from: 'user',
        to: 'lead',
        kind: 'task',
        stepId: 'plan',
        round: null,
        summary: 'Research question',
        content: inputData.question,
      });
      const lead = agent('lead', 'Lead', LEAD_INSTRUCTIONS, leadScript());
      const r = await lead.generate(inputData.question, { structuredOutput: { schema: PlanSchema }, abortSignal: ctx.signal });
      const { subQuestions } = PlanSchema.parse(r.object);
      d.rec.subQuestions = subQuestions;
      d.post({
        from: 'lead',
        to: 'workflow',
        kind: 'result',
        stepId: 'plan',
        round: null,
        summary: `${subQuestions.length} sub-questions`,
        content: subQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
      });
      return subQuestions.map((subQuestion, i) => ({ index: i + 1, subQuestion }));
    },
  });

  const researchOne = createStep({
    id: 'research',
    description: 'One researcher per sub-question, with its own notebook (no shared state between iterations).',
    inputSchema: ItemSchema,
    outputSchema: ResearchItemSchema,
    execute: async ({ inputData: item }) => {
      const id = `researcher-${item.index}`;
      const notebook = new Notebook();
      const researcher = agent(
        id,
        `Researcher ${item.index}`,
        RESEARCHER_INSTRUCTIONS,
        researcherScript(),
        researcherTools(notebook),
      );
      const task = l51.research(item.subQuestion);
      d.post({
        from: 'workflow',
        to: id,
        kind: 'task',
        stepId: 'research',
        round: item.index,
        summary: item.subQuestion,
        content: task,
      });
      await streamAgent(ctx, researcher, task, { maxSteps: 6, emitTokens: false });
      const result = {
        ...item,
        researcher: id,
        notes: notebook.notes.map((n) => ({ ...n })),
        rejected: notebook.rejected.length,
      };
      d.rec.items.push(result);
      d.post({
        from: id,
        to: 'workflow',
        kind: 'notes',
        stepId: 'research',
        round: item.index,
        summary: `${result.notes.length} grounded note(s)${result.rejected ? `, ${result.rejected} rejected` : ''}`,
        content: formatNotes(result.notes) || '(no findings)',
      });
      return result;
    },
  });

  const pool = createStep({
    id: 'pool',
    description: 'Deterministic: merges the notes, removes duplicate quotes and renumbers them.',
    inputSchema: z.array(ResearchItemSchema),
    outputSchema: z.object({ notes: z.array(PooledNoteSchema) }),
    execute: async ({ inputData }) => {
      const notes = poolNotes(inputData);
      if (notes.length === 0) throw new Error('No researcher recorded a grounded finding.');
      return { notes };
    },
  });

  const synthesize = createStep({
    id: 'synthesize',
    description: 'The synthesizer writes a cited answer from the pooled notes only.',
    inputSchema: z.object({ notes: z.array(PooledNoteSchema) }),
    outputSchema: DraftSchema,
    execute: async ({ inputData, getInitData }) => {
      const init = getInitData() as z.infer<typeof InputSchema>;
      const synthesizer = agent('synthesizer', 'Synthesizer', EDITOR_INSTRUCTIONS, editorScript());
      const brief = l51.draft(init.question, init.maxWords, inputData.notes);
      d.post({
        from: 'workflow',
        to: 'synthesizer',
        kind: 'task',
        stepId: 'synthesize',
        round: null,
        summary: `${inputData.notes.length} pooled notes`,
        content: brief,
      });
      const r = await streamAgent(ctx, synthesizer, brief, { maxSteps: 1, emitTokens: false });
      const planted = SLIPS[d.slip];
      const draft = planted ? `${r.text.trim()} ${planted}` : r.text.trim();
      d.post({
        from: 'synthesizer',
        to: 'fact-checker',
        kind: 'draft',
        stepId: 'synthesize',
        round: null,
        summary: `Draft, ${sentencesOf(draft).length} sentences${planted ? ' (one sentence planted by the lab)' : ''}`,
        content: draft,
        ...(planted ? { injected: true } : {}),
      });
      return { notes: inputData.notes, draft, injected: planted };
    },
  });

  const factCheck = createStep({
    id: 'fact-check',
    description: 'The fact-checker reviews every sentence; the orchestrator adds the structural check.',
    inputSchema: DraftSchema,
    outputSchema: CheckedSchema,
    execute: async ({ inputData: s }) => {
      // Offline, the L51 researcher script's review branch is the fact-checker (structural ∪ support issues).
      const checker = agent('fact-checker', 'Fact-checker', FACT_CHECKER_INSTRUCTIONS, researcherScript());
      const r = await checker.generate(l51.review(s.notes, s.draft), {
        structuredOutput: { schema: ReviewSchema },
        abortSignal: ctx.signal,
      });
      const review = ReviewSchema.parse(r.object);
      const { claims, unmatched } = classifyClaims(s.draft, s.notes, review.issues, s.injected);
      const flagged = claims.filter((c) => c.status === 'flagged');
      d.post({
        from: 'fact-checker',
        to: 'workflow',
        kind: 'review',
        stepId: 'fact-check',
        round: null,
        summary: `${claims.length - flagged.length} supported, ${flagged.length} flagged${unmatched.length ? `, ${unmatched.length} unmatched issue(s)` : ''}`,
        content: claims
          .map(
            (c) => `${c.status === 'flagged' ? '✗' : '✓'} ${c.sentence}${c.reasons.length ? `\n   ${c.reasons.join('; ')}` : ''}`,
          )
          .join('\n'),
      });
      return { ...s, claims, unmatched, modelApproved: review.approved };
    },
  });

  const approve = createStep({
    id: APPROVE_STEP,
    description: 'Suspends until a human approves or rejects publishing.',
    inputSchema: CheckedSchema,
    outputSchema: ApprovedSchema,
    suspendSchema: SuspendSchema,
    resumeSchema: ResumeSchema,
    execute: async ({ inputData: s, resumeData, suspend }) => {
      if (!resumeData) {
        const supported = s.claims.filter((c) => c.status === 'supported');
        const payload = {
          supported: supported.length,
          flagged: s.claims.length - supported.length,
          preview: supported
            .map((c) => c.sentence)
            .join(' ')
            .slice(0, 1_000),
        };
        d.rec.suspended = payload;
        d.post({
          from: 'workflow',
          to: 'human',
          kind: 'task',
          stepId: APPROVE_STEP,
          round: null,
          summary: `Approval requested: ${payload.supported} supported claim(s), ${payload.flagged} flagged (withheld)`,
          content: payload.preview || '(nothing publishable)',
        });
        return await suspend(payload);
      }
      d.post({
        from: 'human',
        to: 'workflow',
        kind: 'review',
        stepId: APPROVE_STEP,
        round: null,
        summary: `${resumeData.decision === 'approve' ? 'Approved' : 'Rejected'} by ${resumeData.reviewer} (${resumeData.source})`,
        content: resumeData.decision,
      });
      return { ...s, decision: resumeData };
    },
  });

  const publish = createStep({
    id: 'publish',
    description: 'Publishes only the supported claims, and only after approval.',
    inputSchema: ApprovedSchema,
    outputSchema: FinalSchema,
    execute: async ({ inputData: s }) => {
      const supported: Claim[] = s.claims.filter((c) => c.status === 'supported');
      const ok = s.decision.decision === 'approve' && supported.length > 0;
      const text = ok ? supported.map((c) => c.sentence).join(' ') : '';
      d.post({
        from: 'workflow',
        to: ok ? 'public' : 'human',
        kind: ok ? 'final' : 'escalation',
        stepId: 'publish',
        round: null,
        summary: ok ? `Published ${supported.length} claim(s); ${s.claims.length - supported.length} withheld` : 'Not published',
        content: ok
          ? text
          : s.decision.decision === 'reject'
            ? 'The reviewer rejected publishing.'
            : 'No supported claim to publish.',
      });
      return {
        status: ok ? ('published' as const) : ('rejected' as const),
        text,
        claims: s.claims,
        notes: s.notes,
        decision: s.decision,
      };
    },
  });

  return createWorkflow({ id: WORKFLOW_ID, inputSchema: InputSchema, outputSchema: FinalSchema })
    .then(plan)
    .foreach(researchOne, { concurrency: 2 })
    .then(pool)
    .then(synthesize)
    .then(factCheck)
    .then(approve)
    .then(publish)
    .commit();
}

export type { PooledNote };
