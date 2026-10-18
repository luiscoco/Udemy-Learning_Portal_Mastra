import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import type { PromptView, ScriptedTurn } from '@mlp/mastra-runtime';
import { modelOutput } from '../lab-50/run.js';
import { sentencesOf } from '../lab-51/grounding.js';
import { searchSources } from '../lab-51/sources.js';
import { WORKERS, type Worker } from './budget.js';

export const FAULTS = ['none', 'repeat-delegation', 'runaway'] as const;
export type Fault = (typeof FAULTS)[number];

export const searchTool = createTool({
  id: 'search_sources',
  description: 'Searches the local course source pack and returns the best matching sources.',
  inputSchema: z.object({ query: z.string().trim().min(2).max(500) }),
  execute: async ({ query }) => ({ results: searchSources(query, 2).map((s) => ({ ...s })) }),
});

export const WORKER_DESCRIPTIONS: Record<Worker, string> = {
  researcher: 'Research worker: finds facts in the local source pack and returns cited findings.',
  planner: 'Planning worker: turns a goal and findings into a short numbered rollout plan.',
  analyst: 'Analysis worker: reviews a plan and returns its main risks and a recommendation.',
};
export const WORKER_INSTRUCTIONS: Record<Worker, string> = {
  researcher:
    'You are the research worker. Call search_sources once, then answer with two or three findings, each ending with its source id in square brackets, for example [S1]. No plan, no opinion.',
  planner:
    'You are the planning worker. Answer with a numbered plan of at most four short steps for the goal you are given. No research.',
  analyst:
    'You are the analysis worker. Answer with the two main risks of the plan you are given and a one-sentence recommendation. Be brief.',
};

/** Removed from the instructions while a fault is injected, because it contradicts the fault. */
export const NO_RESEND_RULE = 'Do not resend a task that was already done or refused. ';
export const SUPERVISOR_INSTRUCTIONS =
  'You are a supervisor. You do not do the work yourself: delegate research to agent-researcher, planning to agent-planner and analysis to agent-analyst, in that order, giving each worker everything it needs in the prompt (workers do not see this conversation). ' +
  `Each worker result ends with the budget you have left; a refused delegation starts with [Delegation Rejected]. ${NO_RESEND_RULE}` +
  'When you have the three results, or cannot get more, answer with three short sections: Research, Plan, Analysis.';
export const FAULT_LINES: Record<Exclude<Fault, 'none'>, string> = {
  'repeat-delegation':
    ' Fault injection (a lesson on cycle limits): in the same step as the planning delegation, call agent-researcher again with exactly the same prompt you used the first time.',
  runaway: ' Fault injection: never give a final answer; after the analysis keep delegating new follow-up tasks.',
};
/** The supervisor's instructions for a fault (live models may still decline to follow an injected fault). */
export const supervisorInstructions = (fault: Fault) =>
  fault === 'none' ? SUPERVISOR_INSTRUCTIONS : SUPERVISOR_INSTRUCTIONS.replace(NO_RESEND_RULE, '') + FAULT_LINES[fault];

/** What the supervisor model sees for a delegation: the worker's text (or the rejection), with the budget line. */
export const delegationText = (output: unknown) =>
  typeof output === 'string' ? output : String(modelOutput(output).text ?? JSON.stringify(output));
const stripBudget = (t: string) => t.replace(/\n?\[Budget left:[^\]]*\]\s*$/, '').trim();
export const REJECTED = '[Delegation Rejected]';

/** Offline supervisor: research → plan → analysis → final; the faults change what it delegates. */
export function supervisorScript() {
  return (view: PromptView): ScriptedTurn => {
    const task = view.userMessages[0] ?? view.lastUser;
    const results = view.toolResults
      .filter((r) => r.toolName.startsWith('agent-'))
      .map((r) => ({ worker: r.toolName.slice('agent-'.length) as Worker, text: delegationText(r.output) }));
    const done = (w: Worker) => results.find((r) => r.worker === w && !r.text.startsWith(REJECTED));
    const refused = (w: Worker) => !done(w) && results.some((r) => r.worker === w && r.text.startsWith(REJECTED));
    const research = done('researcher');
    const plan = done('planner');
    const analysis = done('analyst');
    const call = (w: Worker, prompt: string) => ({ toolName: `agent-${w}`, input: { prompt } });
    const researchPrompt = `Research this question: ${task}`;

    if (!research && !refused('researcher')) return { text: '', toolCalls: [call('researcher', researchPrompt)] };
    if (!plan && !refused('planner')) {
      const calls = [call('planner', `Plan a rollout for: ${task}\nFindings:\n${stripBudget(research?.text ?? 'none')}`)];
      if (view.system.includes(FAULT_LINES['repeat-delegation'].trim())) calls.push(call('researcher', researchPrompt));
      return { text: '', toolCalls: calls };
    }
    if (!analysis && !refused('analyst'))
      return { text: '', toolCalls: [call('analyst', `Analyse the risks of this plan:\n${stripBudget(plan?.text ?? 'none')}`)] };
    if (view.system.includes(FAULT_LINES.runaway.trim())) {
      const n = results.length + 1;
      return { text: '', toolCalls: [call(WORKERS[n % WORKERS.length]!, `Follow-up task ${n}: go deeper on ${task}`)] };
    }
    const section = (name: string, w: Worker, r: { text: string } | undefined) =>
      `${name}: ${r ? stripBudget(r.text) : `not available (the ${w} delegation was refused).`}`;
    return {
      text: [
        section('Research', 'researcher', research),
        section('Plan', 'planner', plan),
        section('Analysis', 'analyst', analysis),
      ].join('\n\n'),
    };
  };
}

/** Offline workers. */
export function workerScript(w: Worker) {
  return (view: PromptView): ScriptedTurn => {
    if (w === 'researcher') {
      const r = view.toolResults.find((t) => t.toolName === 'search_sources');
      if (!r) return { text: '', toolCalls: [{ toolName: 'search_sources', input: { query: view.lastUser.slice(0, 500) } }] };
      const hits = (modelOutput(r.output).results ?? []) as { sourceId: string; text: string }[];
      return {
        text: hits.map((h) => `${sentencesOf(h.text)[0]!.replace(/\.$/, '')} [${h.sourceId}].`).join(' ') || 'No findings.',
      };
    }
    if (w === 'planner')
      return {
        text: '1. Pilot one workflow with one team for two weeks. 2. Give every step typed input and output schemas. 3. Stream runs to watch each step. 4. Roll out to all teams after a review.',
      };
    return {
      text: 'Risks: steps without schemas let bad data through; a loop without a bound can run forever. Recommendation: run the two-week pilot with schemas and bounded loops before the rollout.',
    };
  };
}
