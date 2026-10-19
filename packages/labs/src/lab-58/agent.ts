import type { PromptView, ScriptedTurn } from '@mlp/mastra-runtime';
import { researcherScript } from '../lab-56/pipeline.js';

export const AGENT_ID = 'faq-agent';
export const REFUSAL = 'I only answer questions about Mastra.';

export const FAQ_INSTRUCTIONS =
  'You answer questions about Mastra for course learners. Call search_sources first and answer in two or three sentences using only what it returns, keeping the source ids in square brackets. ' +
  `If the question is not about Mastra, workflows, agents or tools, reply exactly: "${REFUSAL}"`;

const COURSE_TERMS = /\b(mastra|workflows?|steps?|agents?|tools?|suspend|resume|schemas?|validat\w*)\b/i;

/** Offline model for the FAQ agent (the mock provider): refuse off-topic questions, else search and answer. */
export function faqScript() {
  const research = researcherScript();
  return (view: PromptView): ScriptedTurn =>
    COURSE_TERMS.test(view.userMessages[0] ?? view.lastUser) ? research(view) : { text: REFUSAL };
}
