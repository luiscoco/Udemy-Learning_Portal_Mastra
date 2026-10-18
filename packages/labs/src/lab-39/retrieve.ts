import { MDocument } from '@mastra/rag';
import { InMemoryVector } from '@mlp/mastra-runtime';
import { analyseChunks } from '../lab-37/chunks.js';
import { CORPUS } from '../lab-37/corpus.js';
import type { Embedder } from '../lab-38/embedders.js';

export type Chunking = 'sections' | 'recursive-200';

export interface IndexedChunk {
  id: string;
  docId: string;
  source: string;
  start: number;
  end: number;
  text: string;
}

/**
 * Chunking options per document format. "sections" gives one chunk per heading section (heading kept,
 * sections not merged) and one per paragraph for text; "recursive-200" lets headings become their own chunks.
 */
export function chunkParams(chunking: Chunking, markdown: boolean) {
  if (chunking === 'recursive-200') return { strategy: 'recursive', maxSize: 200, overlap: 50 } as const;
  return markdown
    ? ({ strategy: 'markdown', maxSize: 320, overlap: 0 } as const)
    : ({ strategy: 'recursive', maxSize: 250, overlap: 0 } as const);
}

/** Indexes the course corpus in memory with the given embedder (deterministic offline). Used by L39 and L40. */
export async function buildCorpusIndex(embedder: Embedder, chunking: Chunking, signal?: AbortSignal) {
  const chunks: IndexedChunk[] = [];
  for (const d of CORPUS) {
    const markdown = d.format === 'markdown';
    const doc = markdown ? MDocument.fromMarkdown(d.text, { source: d.name }) : MDocument.fromText(d.text, { source: d.name });
    const raw = await doc.chunk({ ...chunkParams(chunking, markdown), addStartIndex: true } as never);
    for (const c of analyseChunks(d, raw as never, chunking).chunks)
      if (c.start !== null && c.end !== null)
        chunks.push({
          id: c.chunkId,
          docId: d.docId,
          source: d.name,
          start: c.start,
          end: c.end,
          text: d.text.slice(c.start, c.end),
        });
  }
  const store = new InMemoryVector();
  const indexName = 'corpus';
  await store.createIndex({ indexName, dimension: embedder.dimensions, metric: 'cosine' });
  const { embeddings, tokens } = await embedder.embed(
    chunks.map((c) => c.text),
    signal,
  );
  await store.upsert({ indexName, vectors: embeddings, ids: chunks.map((c) => c.id), metadata: chunks.map((c) => ({ ...c })) });
  const sources = new Map(CORPUS.map((d) => [d.docId, d.text]));
  return { store, indexName, chunks, sources, tokens };
}

const STOP = new Set(
  'what when where which who whom whose why how does have with from that this they them your yours mine about into over under than then there their will would could should shall must been being were also only just very much many more most some such each other'.split(
    ' ',
  ),
);

/** Query keywords: words of 4+ letters that are not stopwords, lower-cased, unique. */
export const keywordsOf = (q: string) => [
  ...new Set((q.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{3,}/gu) ?? []).filter((w) => !STOP.has(w))),
];

export const SNIPPET_MAX = 220;

/**
 * A window of up to SNIPPET_MAX characters of the chunk, centred on the first query keyword it contains
 * (or the chunk's start), cut at word boundaries. Offsets are absolute in the source document.
 */
export function snippetFor(chunkText: string, chunkStart: number, keywords: string[]) {
  const lower = chunkText.toLowerCase();
  const positions = keywords.map((k) => lower.indexOf(k)).filter((i) => i >= 0);
  const at = positions.length ? Math.min(...positions) : 0;
  let from = Math.max(0, at - Math.floor(SNIPPET_MAX / 3));
  let to = Math.min(chunkText.length, from + SNIPPET_MAX);
  from = Math.max(0, to - SNIPPET_MAX);
  if (from > 0) {
    const ws = chunkText.indexOf(' ', from);
    if (ws >= 0 && ws < at) from = ws + 1;
  }
  if (to < chunkText.length) {
    const ws = chunkText.lastIndexOf(' ', to);
    if (ws > from) to = ws;
  }
  const matched = keywords.filter((k) => lower.slice(from, to).includes(k));
  return { snippet: chunkText.slice(from, to), start: chunkStart + from, end: chunkStart + to, matched };
}

export type Expectation = { docId: string; contains: string } | 'none';

export function meetsExpectation(expect: Expectation | undefined, hits: { docId: string; text: string }[]): boolean | null {
  if (expect === undefined) return null;
  if (expect === 'none') return hits.length === 0;
  const top = hits[0];
  return !!top && top.docId === expect.docId && top.text.toLowerCase().includes(expect.contains.toLowerCase());
}
