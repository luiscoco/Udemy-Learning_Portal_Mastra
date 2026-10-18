import { getEncoding } from 'js-tiktoken';

const enc = getEncoding('cl100k_base');
export const countTokens = (text: string) => enc.encode(text).length;

export type OffsetSource = 'mastra' | 'relocated' | 'unlocated';

export interface LocatedChunk {
  chunkId: string;
  docId: string;
  source: string;
  index: number;
  start: number | null;
  end: number | null;
  offsetSource: OffsetSource;
  chars: number;
  tokens: number;
  overlapWithPrevious: number;
  preview: string;
}

export interface DroppedChunk {
  docId: string;
  rawLength: number;
  reason: 'empty' | 'no letters or digits';
  text: string;
}

/** A chunk is degenerate when, after trimming, it has no letter or digit (e.g. "" or "."). */
export const isDegenerate = (text: string) => !/[\p{L}\p{N}]/u.test(text);

/**
 * Verifies Mastra's startIndex against the source; otherwise relocates the chunk text, searching from
 * the previous chunk's start (chunks come in order, overlaps can start before the previous end).
 */
export function locate(source: string, text: string, reported: unknown, searchFrom: number): { start: number | null; offsetSource: OffsetSource } {
  if (typeof reported === 'number' && reported >= 0 && source.slice(reported, reported + text.length) === text) return { start: reported, offsetSource: 'mastra' };
  const near = source.indexOf(text, Math.max(0, searchFrom));
  if (near >= 0) return { start: near, offsetSource: 'relocated' };
  const anywhere = source.indexOf(text);
  if (anywhere >= 0) return { start: anywhere, offsetSource: 'relocated' };
  return { start: null, offsetSource: 'unlocated' };
}

/** Turns raw chunks of one document into located, filtered chunks plus the dropped ones. */
export function analyseChunks(
  doc: { docId: string; name: string; text: string },
  raw: { text: string; metadata: Record<string, unknown> }[],
  idPrefix: string,
): { chunks: LocatedChunk[]; dropped: DroppedChunk[] } {
  const chunks: LocatedChunk[] = [];
  const dropped: DroppedChunk[] = [];
  let prevStart = 0;
  let prevEnd: number | null = null;
  for (const r of raw) {
    if (isDegenerate(r.text)) {
      dropped.push({ docId: doc.docId, rawLength: r.text.length, reason: r.text.trim() ? 'no letters or digits' : 'empty', text: r.text.slice(0, 20) });
      continue;
    }
    const { start, offsetSource } = locate(doc.text, r.text, r.metadata.startIndex, prevStart);
    const end = start === null ? null : start + r.text.length;
    chunks.push({
      chunkId: `${idPrefix}:${doc.docId}:${chunks.length}`,
      docId: doc.docId,
      source: doc.name,
      index: chunks.length,
      start,
      end,
      offsetSource,
      chars: r.text.length,
      tokens: countTokens(r.text),
      overlapWithPrevious: start !== null && prevEnd !== null ? Math.max(0, prevEnd - start) : 0,
      preview: r.text.replace(/\s+/g, ' ').trim().slice(0, 120),
    });
    if (start !== null) {
      prevStart = start;
      prevEnd = end;
    }
  }
  return { chunks, dropped };
}

/** Share of the source's letters and digits that lie inside at least one located chunk (0–1). */
export function coverage(text: string, chunks: { start: number | null; end: number | null }[]): number {
  const covered = new Uint8Array(text.length);
  for (const c of chunks) if (c.start !== null && c.end !== null) covered.fill(1, c.start, c.end);
  let total = 0;
  let inside = 0;
  for (let i = 0; i < text.length; i++) {
    if (/[\p{L}\p{N}]/u.test(text[i]!)) {
      total++;
      inside += covered[i]!;
    }
  }
  return total === 0 ? 1 : inside / total;
}

export function stats(values: number[]) {
  if (values.length === 0) return { min: 0, avg: 0, max: 0 };
  return { min: Math.min(...values), avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length), max: Math.max(...values) };
}
