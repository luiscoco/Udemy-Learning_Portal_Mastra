/** A small local source pack: the researcher's only knowledge (no web access in this lab). */
export interface Source {
  sourceId: string;
  title: string;
  text: string;
}

export const SOURCES: readonly Source[] = [
  {
    sourceId: 'S1',
    title: 'Workflows overview',
    text:
      'A Mastra workflow is a typed graph of steps that runs in a fixed, explicit order. ' +
      'You build it with createWorkflow, chain steps, and call commit before running it. ' +
      'Each run is started with createRun and can be streamed to watch every step.',
  },
  {
    sourceId: 'S2',
    title: 'Steps and sequencing',
    text:
      'A step is created with createStep and declares an input schema, an output schema and an execute function. ' +
      'With then, the output of one step becomes the input of the next step. ' +
      'Mastra validates the workflow input against its schema before the first step runs.',
  },
  {
    sourceId: 'S3',
    title: 'Parallel branches and loops',
    text:
      'In a workflow, the parallel method runs independent steps at the same time and joins their outputs by step id. ' +
      'The dountil method repeats a step until a condition returns true, so the condition must guarantee that the loop ends. ' +
      'Branches should not share mutable state.',
  },
  {
    sourceId: 'S4',
    title: 'Suspend and resume',
    text:
      'A step can call suspend to pause a workflow run until a human or another system provides data. ' +
      'The run is resumed with resume, and the suspended step receives the resume data.',
  },
  {
    sourceId: 'S5',
    title: 'Agents',
    text:
      'A Mastra agent combines a model, instructions and optional tools. ' +
      'An agent decides which tool to call at each step of its loop, while a workflow fixes the order of steps in code.',
  },
  {
    sourceId: 'S6',
    title: 'Tools',
    text:
      'A tool is created with createTool and has an input schema that Mastra validates before execute runs. ' +
      'Tools give an agent controlled access to data and actions.',
  },
];

const STOP = new Set(
  'the and for with that this from into your you are can its how what does when then than they them their have has will a an of to in on is it be by or as at do'.split(
    ' ',
  ),
);

/** Lower-case content words with a light stem (plural / -ing / -ed), for overlap scoring. */
export function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9]+/g) ?? [])
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => w.replace(/(ing|ed|es|s)$/, '') || w);
}

/** Ranks sources by how many distinct query words they contain (ties keep pack order). */
export function searchSources(query: string, limit = 3): Source[] {
  const q = new Set(contentWords(query));
  return SOURCES.map((s, i) => ({ s, i, score: new Set(contentWords(`${s.title} ${s.text}`).filter((w) => q.has(w))).size }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((r) => r.s);
}

export const sourceById = (id: string) => SOURCES.find((s) => s.sourceId === id);
