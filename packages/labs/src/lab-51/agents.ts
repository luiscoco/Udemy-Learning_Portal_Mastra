import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import type { PromptView, ScriptedTurn } from '@mlp/mastra-runtime';
import { modelOutput } from '../lab-50/run.js';
import {
  formatNotes,
  mergeIssues,
  parseNotes,
  sentencesOf,
  structuralIssues,
  supportIssues,
  withoutSentences,
  type Issue,
  type Note,
} from './grounding.js';
import { searchSources, SOURCES, sourceById } from './sources.js';

export const MAX_NOTES = 6;
const SOURCE_IDS = SOURCES.map((s) => s.sourceId) as [string, ...string[]];
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The orchestrator-owned notebook: record_finding writes accepted findings here, numbered 1..k. */
export class Notebook {
  readonly notes: Note[] = [];
  readonly rejected: { claim: string; sourceId: string; reason: string }[] = [];

  record(f: {
    claim: string;
    sourceId: string;
    quote: string;
  }): { accepted: true; n: number } | { accepted: false; reason: string } {
    const reject = (reason: string) => (
      this.rejected.push({ claim: f.claim, sourceId: f.sourceId, reason }),
      { accepted: false as const, reason }
    );
    const source = sourceById(f.sourceId);
    if (!source) return reject(`Unknown source ${f.sourceId}.`);
    const quote = norm(f.quote);
    if (!norm(source.text).includes(quote)) return reject(`The quote is not verbatim in ${f.sourceId}; copy it exactly.`);
    if (this.notes.some((n) => n.quote === quote)) return reject('This quote is already recorded.');
    if (this.notes.length >= MAX_NOTES) return reject(`At most ${MAX_NOTES} findings can be recorded.`);
    const n = this.notes.length + 1;
    this.notes.push({ n, claim: norm(f.claim), sourceId: f.sourceId, quote });
    return { accepted: true, n };
  }
}

/** The researcher's tools: search the local source pack and record grounded findings. */
export function researcherTools(notebook: Notebook) {
  return {
    search_sources: createTool({
      id: 'search_sources',
      description: 'Searches the local course source pack and returns the best matching sources with their full text.',
      inputSchema: z.object({ query: z.string().trim().min(2).max(300) }),
      outputSchema: z.object({ results: z.array(z.object({ sourceId: z.string(), title: z.string(), text: z.string() })) }),
      execute: async ({ query }) => ({ results: searchSources(query, 3).map((s) => ({ ...s })) }),
    }),
    record_finding: createTool({
      id: 'record_finding',
      description:
        'Records one finding for the editor: a short claim, the source id and a quote copied exactly from that source. Rejects quotes that are not verbatim.',
      inputSchema: z.object({
        claim: z.string().trim().min(5).max(300),
        sourceId: z.enum(SOURCE_IDS),
        quote: z.string().trim().min(10).max(300),
      }),
      outputSchema: z.object({ accepted: z.boolean(), n: z.number().optional(), reason: z.string().optional() }),
      execute: async (input) => notebook.record(input),
    }),
  };
}

export const RESEARCHER_INSTRUCTIONS =
  'You are the research agent. You find facts; you do not write articles. ' +
  'For a research request: call search_sources, then record 2 to 4 findings with record_finding, each with a short claim, its sourceId and a quote copied exactly from the source text. ' +
  'When asked to review a draft, check every sentence against the notes: report each sentence that cites no note, cites a note that does not exist, or says something its cited note does not support. Approve only when there are no issues.';

export const EDITOR_INSTRUCTIONS =
  'You are the editor agent. You write clear, short explanations for learners, using only the notes you are given. ' +
  'Never add facts that are not in the notes. End every sentence with the number of the note it relies on in square brackets before the full stop, for example "Steps run in order [1]." ' +
  'Answer with the text only: no title, no list, no preamble.';

/** Prompt builders: the handoff payloads, written by the orchestrator. */
export const prompts = {
  research: (request: string) =>
    `Research request: ${request}\nSearch the sources, then record 2 to 4 findings that answer the request.`,
  draft: (request: string, maxWords: number, notes: readonly Note[]) =>
    `Request: ${request}\nWrite at most ${maxWords} words. Use only these notes and cite every sentence.\n\nNOTES:\n${formatNotes(notes)}`,
  review: (notes: readonly Note[], draft: string) =>
    `Review this draft against your notes.\n\nNOTES:\n${formatNotes(notes)}\n\nDRAFT:\n${draft}`,
  revise: (notes: readonly Note[], draft: string, issues: readonly Issue[]) =>
    `Revise the draft: fix or remove each flagged sentence, keep the other sentences and cite every sentence.\n\nNOTES:\n${formatNotes(notes)}\n\nDRAFT:\n${draft}\n\nISSUES:\n${issues.map((i) => `- "${i.sentence}" (${i.kind}): ${i.problem}`).join('\n')}`,
};

/** Text after "NAME:\n" up to the next blank-line section. */
function section(text: string, name: string): string {
  const start = text.indexOf(`${name}:\n`);
  if (start < 0) return '';
  const rest = text.slice(start + name.length + 2);
  const end = rest.search(/\n\n[A-Z]+:\n/);
  return end < 0 ? rest : rest.slice(0, end);
}

/** Offline researcher: search, record the first sentence of each result, then review drafts deterministically. */
export function researcherScript() {
  return (view: PromptView): ScriptedTurn => {
    if (view.jsonMode) {
      const notes = parseNotes(section(view.lastUser, 'NOTES'));
      const draft = section(view.lastUser, 'DRAFT');
      const issues = mergeIssues(structuralIssues(draft, notes), supportIssues(draft, notes));
      return { text: JSON.stringify({ approved: issues.length === 0, issues }) };
    }
    const searched = view.toolResults.find((r) => r.toolName === 'search_sources');
    if (!searched) {
      const request = /^Research request: (.+)$/m.exec(view.lastUser)?.[1] ?? view.lastUser;
      return { text: '', toolCalls: [{ toolName: 'search_sources', input: { query: request } }] };
    }
    if (!view.toolResults.some((r) => r.toolName === 'record_finding')) {
      const results = (modelOutput(searched.output).results ?? []) as { sourceId: string; text: string }[];
      const toolCalls = results.map((s) => {
        const quote = sentencesOf(s.text)[0]!;
        return { toolName: 'record_finding', input: { claim: quote.replace(/[.!?]$/, ''), sourceId: s.sourceId, quote } };
      });
      return toolCalls.length ? { text: '', toolCalls } : { text: 'No source matches the request.' };
    }
    const accepted = view.toolResults.filter((r) => r.toolName === 'record_finding' && modelOutput(r.output).accepted).length;
    return { text: `Recorded ${accepted} findings for the editor.` };
  };
}

/** Offline editor: one sentence per note within the word budget; a revision drops the flagged sentences. */
export function editorScript() {
  return (view: PromptView): ScriptedTurn => {
    const draft = section(view.lastUser, 'DRAFT');
    if (view.lastUser.startsWith('Revise')) {
      const flagged = [...section(view.lastUser, 'ISSUES').matchAll(/^- "(.+)" \([\w-]+\): /gm)].map((m) => m[1]!);
      return { text: withoutSentences(draft, flagged) };
    }
    const maxWords = Number(/at most (\d+) words/.exec(view.lastUser)?.[1] ?? 120);
    const out: string[] = [];
    let words = 0;
    for (const n of parseNotes(section(view.lastUser, 'NOTES'))) {
      const s = `${n.claim} [${n.n}].`;
      const w = s.split(/\s+/).length;
      if (out.length && words + w > maxWords) break;
      out.push(s);
      words += w;
    }
    return { text: out.join(' ') };
  };
}
