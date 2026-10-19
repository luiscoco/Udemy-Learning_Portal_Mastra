import type { PromptView, ScriptedTurn } from '@mlp/mastra-runtime';
import { modelOutput } from '../lab-50/run.js';
import { sentencesOf } from '../lab-51/grounding.js';
import { FAQ_INSTRUCTIONS, faqScript, REFUSAL } from '../lab-58/agent.js';

export const CONFIG_IDS = ['grounded', 'concise', 'no-tools', 'alt-model'] as const;
export type ConfigId = (typeof CONFIG_IDS)[number];

export interface Config {
  id: ConfigId;
  label: string;
  agentId: string;
  instructions: string;
  tools: string[];
  /** 'main' uses the run's model; 'alt' uses the alternative model (live only). */
  model: 'main' | 'alt';
  offline: () => (view: PromptView) => ScriptedTurn;
  description: string;
}

const COURSE_TERMS = /\b(mastra|workflows?|steps?|agents?|tools?|suspend|resume|schemas?|validat\w*)\b/i;

/** Offline: search, then answer in one sentence from the first source. */
function conciseScript() {
  return (view: PromptView): ScriptedTurn => {
    if (!COURSE_TERMS.test(view.userMessages[0] ?? view.lastUser)) return { text: REFUSAL };
    const r = view.toolResults.find((t) => t.toolName === 'search_sources');
    if (!r) return { text: '', toolCalls: [{ toolName: 'search_sources', input: { query: view.lastUser.slice(0, 300) } }] };
    const first = ((modelOutput(r.output).results ?? []) as { sourceId: string; text: string }[])[0];
    return { text: first ? `${sentencesOf(first.text)[0]!.replace(/\.$/, '')} [${first.sourceId}].` : 'No findings.' };
  };
}

/** Offline: no tool, so a generic answer from "memory" (which misses the expected key points). */
function noToolsScript() {
  return (view: PromptView): ScriptedTurn => ({
    text: COURSE_TERMS.test(view.userMessages[0] ?? view.lastUser)
      ? 'Mastra is a TypeScript framework for building AI agents and workflows.'
      : REFUSAL,
  });
}

export const CONFIGS: Record<ConfigId, Config> = {
  grounded: {
    id: 'grounded',
    label: 'Grounded (search, two sources)',
    agentId: 'cfg-grounded',
    instructions: FAQ_INSTRUCTIONS,
    tools: ['search_sources'],
    model: 'main',
    offline: faqScript,
    description: 'The L58 FAQ agent: searches the course sources and answers from them.',
  },
  concise: {
    id: 'concise',
    label: 'Concise (search, one sentence)',
    agentId: 'cfg-concise',
    instructions: `${FAQ_INSTRUCTIONS} Answer in exactly one sentence, using only the most relevant source.`,
    tools: ['search_sources'],
    model: 'main',
    offline: conciseScript,
    description: 'Same tool, but a one-sentence answer from a single source.',
  },
  'no-tools': {
    id: 'no-tools',
    label: 'No tools (answers from memory)',
    agentId: 'cfg-no-tools',
    instructions: `You answer questions about Mastra for course learners from what you know, in two or three sentences. If the question is not about Mastra, workflows, agents or tools, reply exactly: "${REFUSAL}"`,
    tools: [],
    model: 'main',
    offline: noToolsScript,
    description: 'No search tool: the answer cannot be grounded in the course sources.',
  },
  'alt-model': {
    id: 'alt-model',
    label: 'Grounded on the alternative model',
    agentId: 'cfg-alt-model',
    instructions: FAQ_INSTRUCTIONS,
    tools: ['search_sources'],
    model: 'alt',
    offline: faqScript,
    description: 'The grounded configuration on a second model (offline it runs the same scripted model as grounded).',
  },
};
