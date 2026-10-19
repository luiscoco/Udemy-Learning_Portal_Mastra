import { z } from 'zod';
import type { PromptView, ScriptedTurn } from '@mlp/mastra-runtime';
import { NoteSchema } from '../lab-51/grounding.js';

export const PlanSchema = z.object({ subQuestions: z.array(z.string().trim().min(5).max(200)).min(2).max(3) });
export type Plan = z.infer<typeof PlanSchema>;

export const ItemSchema = z.object({ index: z.number().int().min(1), subQuestion: z.string() });
export const ResearchItemSchema = ItemSchema.extend({
  researcher: z.string(),
  notes: z.array(NoteSchema),
  rejected: z.number().int(),
});
export type ResearchItem = z.infer<typeof ResearchItemSchema>;
export const PooledNoteSchema = NoteSchema.extend({ from: z.string() });
export type PooledNote = z.infer<typeof PooledNoteSchema>;

export const LEAD_INSTRUCTIONS =
  'You are the lead of a research team. Split the question into two or three short, independent sub-questions that together answer it. Each sub-question must be answerable on its own from course notes about Mastra. Do not answer them.';
export const FACT_CHECKER_INSTRUCTIONS =
  'You are the fact-checker. Check every sentence of the draft against the numbered notes. Report each sentence that cites no note, cites a note that does not exist, or says something its cited notes do not support, with the kind and a short problem. Approve only when there are no issues.';

const TOPICS: [RegExp, string][] = [
  [/\bsteps?\b|\bsequenc|\border\b/i, 'How does a Mastra workflow run its steps?'],
  [/\bpause|\bhuman\b|\bapprov|\bsuspend/i, 'How can a workflow pause for a human?'],
  [/\brepeat|\bloop|\bretr/i, 'How does a workflow repeat a step safely?'],
  [/\bparallel|\bat the same time/i, 'How do workflows run steps in parallel?'],
  [/\bagents?\b|\btools?\b/i, 'How do agents use tools?'],
];
/** Offline lead: topic keywords → sub-questions, in a fixed order, at most three. */
export function planOffline(question: string): Plan {
  const subs = TOPICS.filter(([r]) => r.test(question))
    .map(([, q]) => q)
    .slice(0, 3);
  // Fewer than two topics: research the question itself, and (with no topic at all) how Mastra workflows run.
  if (subs.length < 2) subs.push(question.slice(0, 200));
  if (subs.length < 2) subs.push(TOPICS[0]![1]);
  return { subQuestions: subs };
}
export const leadScript =
  () =>
  (view: PromptView): ScriptedTurn => ({ text: JSON.stringify(planOffline(view.lastUser)) });

/** Merges the researchers' notes: duplicate quotes from the same source are kept once, then renumbered 1..k. */
export function poolNotes(items: readonly ResearchItem[]): PooledNote[] {
  const seen = new Set<string>();
  const out: PooledNote[] = [];
  for (const item of [...items].sort((a, b) => a.index - b.index))
    for (const n of item.notes) {
      const key = `${n.sourceId}|${n.quote}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...n, n: out.length + 1, from: item.researcher });
    }
  return out;
}
