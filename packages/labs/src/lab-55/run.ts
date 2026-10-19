import { z } from 'zod';
import { Mastra } from '@mastra/core';
import { noopLogger } from '@mastra/core/logger';
import {
  CitedAnswerSchema,
  summarizeChecks,
  type AgentConversation,
  type CitedAnswer,
  type ConversationMessage,
  type LabDefinition,
} from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { streamWorkflow } from '../shared/workflow-stream.js';
import { structuralIssues } from '../lab-51/grounding.js';
import { sourceById } from '../lab-51/sources.js';
import { SLIPS } from '../lab-51/workflow.js';
import { toCitedAnswer } from './claims.js';
import { lab55Definition } from './definition.js';
import type { ResearchItem } from './plan.js';
import { APPROVE_STEP, buildTeamWorkflow, FinalSchema, WORKFLOW_ID, type Final, type Resume, type TeamDeps } from './team.js';

export const Lab55InputSchema = z.object({
  question: z.string().trim().min(10).max(500),
  plantedClaim: z.enum(Object.keys(SLIPS) as [keyof typeof SLIPS, ...(keyof typeof SLIPS)[]]),
  approver: z.enum(['approve', 'reject', 'ask']),
  maxWords: z.number().int().min(40).max(300),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab55Input = z.infer<typeof Lab55InputSchema>;

export interface Lab55Output {
  subQuestions: string[];
  research: ResearchItem[];
  /** Steps before the approval pause, and after the resume. */
  trace: { beforeApproval: string[]; afterApproval: string[]; firstStatus: string; researchIterations: number };
  approval: { requested: TeamDeps['rec']['suspended']; decision: Resume | null };
  final: Final | null;
  citedAnswer: CitedAnswer;
  agentConversation: AgentConversation;
  error: string | null;
}

const steps = (s: { stepId: string }[]) => s.map((x) => x.stepId).filter((id) => !id.startsWith(WORKFLOW_ID));

export const lab55: LabImplementation<Lab55Input, Lab55Output, LabServices> = {
  definition: lab55Definition as LabDefinition,
  inputSchema: Lab55InputSchema,

  async run(ctx, input) {
    const messages: ConversationMessage[] = [];
    const rec: TeamDeps['rec'] = { subQuestions: [], items: [], suspended: null, simulated: true };
    const post: TeamDeps['post'] = (m) => {
      messages.push({ seq: messages.length + 1, ...m });
      ctx.log('info', `${m.from} → ${m.to} [${m.kind}]: ${m.summary}`);
    };
    const wf = buildTeamWorkflow({ ctx, modelId: input.modelId, slip: input.plantedClaim, post, rec });
    // Resume needs a snapshot store: register the workflow on a Mastra instance (in-memory storage).
    const mastra = new Mastra({ workflows: { [WORKFLOW_ID]: wf }, logger: noopLogger });
    const run = await mastra.getWorkflow(WORKFLOW_ID).createRun();
    const c = ctx as RunContext<unknown>;

    const first = await streamWorkflow(c, WORKFLOW_ID, run, { question: input.question, maxWords: input.maxWords });
    let second: Awaited<ReturnType<typeof streamWorkflow>> | null = null;
    let decision: Resume | null = null;
    if (first.status === 'suspended' && rec.suspended) {
      const p = rec.suspended;
      if (input.approver === 'ask') {
        const outcome = await ctx.requestApproval({
          toolName: 'publish-research',
          args: { supportedClaims: p.supported, flaggedClaims: p.flagged, preview: p.preview },
          message: `Publish ${p.supported} supported claim(s)? ${p.flagged} flagged claim(s) will be withheld.`,
        });
        decision =
          outcome.by === 'user'
            ? { decision: outcome.decision === 'approve' ? 'approve' : 'reject', reviewer: 'you (Run tab)', source: 'learner' }
            : { decision: 'reject', reviewer: 'nobody', source: 'timeout' };
      } else decision = { decision: input.approver, reviewer: 'preset reviewer', source: 'preset' };
      second = await streamWorkflow(
        c,
        `${WORKFLOW_ID} (resume)`,
        { stream: () => run.resumeStream({ step: APPROVE_STEP, resumeData: decision }), cancel: () => run.cancel() },
        decision,
      );
    }
    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: rec.simulated, approver: input.approver },
    });

    const parsed = second?.status === 'success' ? FinalSchema.safeParse(second.result) : null;
    const final = parsed?.success ? parsed.data : null;
    const citedAnswer = toCitedAnswer(final?.claims ?? [], final?.notes ?? [], final?.status === 'published');
    const researchers = rec.subQuestions.map((q, i) => ({
      id: `researcher-${i + 1}`,
      name: `Researcher ${i + 1}`,
      role: q,
      tools: ['search_sources', 'record_finding'],
    }));
    return {
      subQuestions: rec.subQuestions,
      research: [...rec.items].sort((a, b) => a.index - b.index),
      trace: {
        beforeApproval: steps(first.steps),
        afterApproval: second ? steps(second.steps) : [],
        firstStatus: first.status,
        researchIterations: first.iterations.length,
      },
      approval: { requested: rec.suspended, decision },
      final,
      citedAnswer,
      agentConversation: {
        agents: [
          { id: 'workflow', name: 'Workflow (orchestrator)', role: 'Fixes the steps; pauses for approval', tools: [] },
          { id: 'lead', name: 'Lead', role: 'Splits the question', tools: [] },
          ...researchers,
          { id: 'synthesizer', name: 'Synthesizer', role: 'Writes the cited answer from the notes only', tools: [] },
          { id: 'fact-checker', name: 'Fact-checker', role: 'Flags unsupported sentences', tools: [] },
        ],
        messages,
        outcome: {
          status: final?.status === 'published' ? 'published' : final ? 'needs-human' : 'failed',
          text: final?.text ?? '',
          issues: (final?.claims ?? [])
            .filter((x) => x.status === 'flagged')
            .map((x) => `${x.sentence} (${x.reasons.join('; ')})`),
        },
      },
      error: second?.error ?? first.error ?? null,
    };
  },

  validate(out, input) {
    const f = out.final;
    const t = out.trace;
    const teamOk =
      t.firstStatus === 'suspended' &&
      JSON.stringify(t.beforeApproval) ===
        JSON.stringify(['plan', 'research', 'pool', 'synthesize', 'fact-check', APPROVE_STEP]) &&
      JSON.stringify(t.afterApproval) === JSON.stringify([APPROVE_STEP, 'publish']) &&
      out.subQuestions.length >= 2 &&
      out.research.length === out.subQuestions.length &&
      t.researchIterations === out.subQuestions.length &&
      new Set(out.research.map((r) => r.researcher)).size === out.research.length &&
      (f?.notes.length ?? 0) > 0;

    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
    const notesOk =
      !!f &&
      f.notes.every((n) => norm(sourceById(n.sourceId)?.text ?? '').includes(norm(n.quote))) &&
      f.notes.every((n, i) => n.n === i + 1);

    const ca = out.citedAnswer;
    const supported = f?.claims.filter((c) => c.status === 'supported') ?? [];
    const published = f?.status === 'published';
    const evidenceOk =
      CitedAnswerSchema.safeParse(ca).success &&
      (!published ||
        (ca.claims.length === supported.length &&
          ca.claims.every(
            (c) =>
              c.citations.length > 0 &&
              c.citations.every((x) => {
                const s = ca.sources[x.sourceId];
                return (
                  !!s &&
                  x.quoteStart < x.quoteEnd &&
                  norm(s.text.slice(x.quoteStart, x.quoteEnd)).toLowerCase() === norm(x.quote).toLowerCase()
                );
              }),
          )));

    const flagged = f?.claims.filter((c) => c.status === 'flagged') ?? [];
    const planted = SLIPS[input.plantedClaim];
    const structural = f ? structuralIssues(f.claims.map((c) => c.sentence).join(' '), f.notes).filter((i) => i.sentence) : [];
    const flaggedOk =
      !!f &&
      flagged.every((c) => c.reasons.length > 0) &&
      structural.every((i) => flagged.some((c) => c.sentence === i.sentence)) &&
      (!planted || flagged.some((c) => c.injected)) &&
      flagged.every((c) => !f.text.includes(c.sentence)) &&
      ca.blocked.length === flagged.length;

    const d = out.approval.decision;
    const approvalOk =
      !!out.approval.requested &&
      !!d &&
      !!f &&
      f.decision.decision === d.decision &&
      (f.status === 'published') === (d.decision === 'approve' && supported.length > 0) &&
      (f.status === 'published' || (f.text === '' && ca.claims.length === 0));

    return summarizeChecks([
      {
        id: 'team-coordinated',
        label: 'Lead → one researcher per sub-question → pool → synthesizer → fact-checker → approval pause → publish',
        passed: teamOk,
        message: `${out.subQuestions.length} sub-question(s); before approval: ${t.beforeApproval.join(' → ')}; after: ${t.afterApproval.join(' → ') || 'not resumed'}`,
      },
      {
        id: 'notes-grounded',
        label: 'Every pooled note quotes its source verbatim',
        passed: notesOk,
        message: `${f?.notes.length ?? 0} pooled notes from ${out.research.map((r) => `${r.researcher} (${r.notes.length})`).join(', ')}`,
      },
      {
        id: 'evidence-surfaced',
        label: 'Every published claim shows its evidence: a quote located in the cited source',
        passed: evidenceOk,
        message: published ? `${ca.claims.length} claim(s), ${Object.keys(ca.sources).length} source(s)` : 'nothing published',
      },
      {
        id: 'unsupported-flagged',
        label: 'Unsupported claims are flagged with a reason and withheld from the published text',
        passed: flaggedOk,
        message: `${flagged.length} flagged${planted ? `; planted claim ${flagged.some((c) => c.injected) ? 'flagged' : 'missed'}` : ''}`,
      },
      {
        id: 'approval-before-publish',
        label: 'The workflow pauses for a human decision and publishes only after approval',
        passed: approvalOk,
        message: d ? `${d.decision} by ${d.reviewer} (${d.source}) → ${f?.status ?? 'no result'}` : 'no decision',
      },
    ]);
  },
};
