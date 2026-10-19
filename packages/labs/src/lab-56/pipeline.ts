import { z } from 'zod';
import type { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { PromptView, ScriptedTurn } from '@mlp/mastra-runtime';
import { modelOutput } from '../lab-50/run.js';
import { sentencesOf } from '../lab-51/grounding.js';
import { searchSources } from '../lab-51/sources.js';

export const FAULTS = ['none', 'tool-error', 'detached-agent'] as const;
export type Fault = (typeof FAULTS)[number];
export const WORKFLOW_ID = 'traced-pipeline';
export const AGENT_IDS = ['researcher', 'reviewer', 'writer'] as const;
export type AgentId = (typeof AGENT_IDS)[number];
/** Which step calls which agent: the ground truth the trace must reflect. */
export const STEP_AGENT: Record<string, AgentId> = { research: 'researcher', review: 'reviewer', answer: 'writer' };

export const INSTRUCTIONS: Record<AgentId, string> = {
  researcher:
    'You research questions about Mastra. Call search_sources (call it again if it fails once), then answer with two short findings, each ending with its source id in square brackets.',
  reviewer:
    'You review a question before it is answered. Say in one sentence whether it can be answered from course sources without personal data.',
  writer:
    'You answer the question in two sentences from the findings you are given, keeping their source ids in square brackets.',
};

/** search_sources; with the tool-error fault its first call throws (the error must land on that tool span). */
export function searchTool(fault: Fault) {
  let calls = 0;
  return createTool({
    id: 'search_sources',
    description: 'Searches the local course source pack.',
    inputSchema: z.object({ query: z.string().trim().min(2).max(300) }),
    execute: async ({ query }) => {
      calls++;
      if (fault === 'tool-error' && calls === 1) throw new Error('search backend unavailable (simulated 503)');
      return { results: searchSources(query, 2).map((s) => ({ sourceId: s.sourceId, text: s.text })) };
    },
  });
}

export function researcherScript() {
  return (view: PromptView): ScriptedTurn => {
    const results = view.toolResults.filter((r) => r.toolName === 'search_sources');
    const ok = results.map((r) => modelOutput(r.output)).find((o) => Array.isArray(o.results));
    if (!ok && results.length < 2)
      return { text: '', toolCalls: [{ toolName: 'search_sources', input: { query: view.lastUser.slice(0, 300) } }] };
    const hits = (ok?.results ?? []) as { sourceId: string; text: string }[];
    return {
      text: hits.map((h) => `${sentencesOf(h.text)[0]!.replace(/\.$/, '')} [${h.sourceId}].`).join(' ') || 'No findings.',
    };
  };
}
export const reviewerScript = () => (): ScriptedTurn => ({
  text: 'The question can be answered from the course sources and contains no personal data.',
});
export const writerScript =
  () =>
  (view: PromptView): ScriptedTurn => {
    const findings = /FINDINGS:\n([\s\S]+)$/.exec(view.lastUser)?.[1]?.trim() ?? '';
    return { text: findings ? `In short: ${findings}` : 'No answer could be written.' };
  };

export interface CallLogEntry {
  stepId: string;
  agentId: AgentId;
  registered: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = Agent<any, any, any, any, any>;

/**
 * classify → parallel(research, review) → answer. Registered agents are fetched with mastra.getAgent(), so
 * their spans nest under the calling step; under the detached-agent fault the review step uses an Agent
 * that Mastra does not know, which leaves no spans.
 */
export function buildPipeline(deps: { calls: CallLogEntry[]; detachedReviewer: AnyAgent | null; signal: AbortSignal }) {
  const Q = z.object({ question: z.string(), topic: z.string() });
  const classify = createStep({
    id: 'classify',
    description: 'Deterministic: picks a topic (no agent).',
    inputSchema: z.object({ question: z.string() }),
    outputSchema: Q,
    execute: async ({ inputData }) => ({
      question: inputData.question,
      topic: /tool/i.test(inputData.question) ? 'tools' : /agent/i.test(inputData.question) ? 'agents' : 'workflows',
    }),
  });
  const research = createStep({
    id: 'research',
    inputSchema: Q,
    outputSchema: z.object({ findings: z.string() }),
    execute: async ({ inputData, mastra }) => {
      deps.calls.push({ stepId: 'research', agentId: 'researcher', registered: true });
      const r = await mastra.getAgent('researcher').generate(inputData.question, { maxSteps: 4, abortSignal: deps.signal });
      return { findings: r.text.trim() };
    },
  });
  const review = createStep({
    id: 'review',
    inputSchema: Q,
    outputSchema: z.object({ verdict: z.string() }),
    execute: async ({ inputData, mastra }) => {
      const agent = deps.detachedReviewer ?? mastra.getAgent('reviewer');
      deps.calls.push({ stepId: 'review', agentId: 'reviewer', registered: !deps.detachedReviewer });
      const r = await agent.generate(inputData.question, { abortSignal: deps.signal });
      return { verdict: r.text.trim() };
    },
  });
  const answer = createStep({
    id: 'answer',
    inputSchema: z.object({ research: z.object({ findings: z.string() }), review: z.object({ verdict: z.string() }) }),
    outputSchema: z.object({ answer: z.string(), verdict: z.string() }),
    execute: async ({ inputData, mastra, getInitData }) => {
      deps.calls.push({ stepId: 'answer', agentId: 'writer', registered: true });
      const q = (getInitData() as { question: string }).question;
      const r = await mastra
        .getAgent('writer')
        .generate(`QUESTION:\n${q}\n\nFINDINGS:\n${inputData.research.findings}`, { abortSignal: deps.signal });
      return { answer: r.text.trim(), verdict: inputData.review.verdict };
    },
  });
  return createWorkflow({
    id: WORKFLOW_ID,
    inputSchema: z.object({ question: z.string() }),
    outputSchema: z.object({ answer: z.string(), verdict: z.string() }),
  })
    .then(classify)
    .parallel([research, review])
    .then(answer)
    .commit();
}
