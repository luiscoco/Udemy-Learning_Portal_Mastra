import { z } from 'zod';
import { MDocument } from '@mastra/rag';
import { summarizeChecks, type CheckResult, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import type { LabServices } from '../services.js';
import { courseLibrary, listLibrary } from '../lab-36/library.js';
import { lab37Definition } from './definition.js';
import { analyseChunks, coverage, stats, type DroppedChunk, type LocatedChunk } from './chunks.js';
import { CORPUS, type CorpusDocument } from './corpus.js';

export const STRATEGIES = ['character', 'recursive', 'token', 'markdown', 'sentence'] as const;
export type Strategy = (typeof STRATEGIES)[number];
export const MAX_RETURNED_CHUNKS = 200;

const ConfigSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    strategy: z.enum(STRATEGIES),
    maxSize: z.number().int().min(10).max(4_000),
    overlap: z.number().int().min(0).max(1_000),
  })
  .refine((c) => c.overlap < c.maxSize, { message: 'overlap must be smaller than maxSize', path: ['overlap'] })
  .refine((c) => (c.strategy === 'token' ? c.maxSize <= 1_000 : c.maxSize >= 20), { message: 'token maxSize is 10–1000; character sizes are 20–4000', path: ['maxSize'] });
export type ChunkConfig = z.infer<typeof ConfigSchema>;

export const Lab37InputSchema = z
  .object({
    source: z.enum(['sample', 'library', 'paste']),
    text: z.string().max(20_000).default(''),
    configs: z
      .array(ConfigSchema)
      .min(1)
      .max(4)
      .refine((c) => new Set(c.map((x) => x.label)).size === c.length, { message: 'labels must be unique' }),
  })
  .refine((v) => v.source !== 'paste' || v.text.trim().length >= 20, { message: 'Paste at least 20 characters', path: ['text'] });
export type Lab37Input = z.infer<typeof Lab37InputSchema>;

export interface ConfigResult {
  config: ChunkConfig;
  unit: 'tokens' | 'characters';
  chunkCount: number;
  returned: number;
  chunks: LocatedChunk[];
  dropped: (DroppedChunk & { strategy: Strategy })[];
  stats: {
    chars: { min: number; avg: number; max: number };
    tokens: { min: number; avg: number; max: number };
    totalOverlapChars: number;
    coverage: number;
    offsets: Record<'mastra' | 'relocated' | 'unlocated', number>;
    overLimit: number;
  };
}

export interface Lab37Output {
  source: Lab37Input['source'];
  documents: { docId: string; name: string; chars: number }[];
  results: ConfigResult[];
  note: string | null;
}

type Doc = Pick<CorpusDocument, 'docId' | 'name' | 'text'> & { markdown: boolean };

function loadDocuments(input: Lab37Input, services: LabServices): { docs: Doc[]; note: string | null } {
  if (input.source === 'paste') return { docs: [{ docId: 'pasted', name: 'pasted text', text: input.text, markdown: /^#{1,6} /m.test(input.text) }], note: null };
  if (input.source === 'library') {
    const stored = listLibrary(courseLibrary(services), 5);
    if (stored.length === 0) return { docs: [], note: 'The course library is empty: ingest documents in lab 36 first, or choose the built-in documents.' };
    return { docs: stored.map((d) => ({ docId: d.docId, name: d.name, text: d.text, markdown: d.mime === 'text/markdown' })), note: null };
  }
  return { docs: CORPUS.map((d) => ({ docId: d.docId, name: d.name, text: d.text, markdown: d.format === 'markdown' })), note: null };
}

export const lab37: LabImplementation<Lab37Input, Lab37Output, LabServices> = {
  definition: lab37Definition as LabDefinition,
  inputSchema: Lab37InputSchema,

  async run(ctx, input) {
    const { docs, note } = loadDocuments(input, ctx.services);
    if (note) ctx.log('warn', note);
    const results: ConfigResult[] = [];
    for (const config of input.configs) {
      ctx.throwIfAborted();
      ctx.emit({ type: 'workflow-step', stepId: `chunk:${config.label}`, status: 'running', input: config });
      const started = Date.now();
      const chunks: LocatedChunk[] = [];
      const dropped: ConfigResult['dropped'] = [];
      let covered = 0;
      for (const d of docs) {
        const doc = d.markdown ? MDocument.fromMarkdown(d.text, { source: d.name }) : MDocument.fromText(d.text, { source: d.name });
        const raw = await doc.chunk({ strategy: config.strategy, maxSize: config.maxSize, overlap: config.overlap, addStartIndex: true } as never);
        const analysed = analyseChunks(d, raw as { text: string; metadata: Record<string, unknown> }[], config.label);
        chunks.push(...analysed.chunks);
        dropped.push(...analysed.dropped.map((x) => ({ ...x, strategy: config.strategy })));
        covered += coverage(d.text, analysed.chunks) * d.text.length;
      }
      const unit = config.strategy === 'token' ? 'tokens' : 'characters';
      const sizeOf = (c: LocatedChunk) => (unit === 'tokens' ? c.tokens : c.chars);
      const offsets = { mastra: 0, relocated: 0, unlocated: 0 };
      for (const c of chunks) offsets[c.offsetSource]++;
      const totalChars = docs.reduce((n, d) => n + d.text.length, 0);
      const result: ConfigResult = {
        config,
        unit,
        chunkCount: chunks.length,
        returned: Math.min(chunks.length, MAX_RETURNED_CHUNKS),
        chunks: chunks.slice(0, MAX_RETURNED_CHUNKS),
        dropped,
        stats: {
          chars: stats(chunks.map((c) => c.chars)),
          tokens: stats(chunks.map((c) => c.tokens)),
          totalOverlapChars: chunks.reduce((n, c) => n + c.overlapWithPrevious, 0),
          coverage: totalChars ? Math.round((covered / totalChars) * 1000) / 1000 : 1,
          offsets,
          overLimit: chunks.filter((c) => sizeOf(c) > config.maxSize).length,
        },
      };
      results.push(result);
      ctx.emit({
        type: 'workflow-step',
        stepId: `chunk:${config.label}`,
        status: 'success',
        durationMs: Date.now() - started,
        output: { chunks: result.chunkCount, dropped: dropped.length, avgChars: result.stats.chars.avg, avgTokens: result.stats.tokens.avg, offsets },
      });
      ctx.log(
        dropped.length ? 'warn' : 'info',
        `${config.label} (${config.strategy}, max ${config.maxSize} ${unit}, overlap ${config.overlap}): ${chunks.length} chunk(s), avg ${result.stats.chars.avg} chars / ${result.stats.tokens.avg} tokens${dropped.length ? `; dropped ${dropped.length} degenerate chunk(s)` : ''}; offsets ${offsets.mastra} from Mastra, ${offsets.relocated} relocated${offsets.unlocated ? `, ${offsets.unlocated} UNLOCATED` : ''}`,
      );
    }
    return { source: input.source, documents: docs.map((d) => ({ docId: d.docId, name: d.name, chars: d.text.length })), results, note };
  },

  validate(out) {
    const all = out.results.flatMap((r) => r.chunks);
    const checks: CheckResult[] = [
      {
        id: 'no-empty-chunks',
        label: 'No empty or degenerate chunk is returned (they are dropped and reported)',
        passed: all.length > 0 && all.every((c) => /[\p{L}\p{N}]/u.test(c.preview)),
        message: all.length
          ? `${all.length} chunk(s) returned; ${out.results.reduce((n, r) => n + r.dropped.length, 0)} degenerate chunk(s) dropped`
          : (out.note ?? 'no chunks were produced'),
      },
      {
        id: 'offsets-traceable',
        label: 'Every chunk shows its source document and verified start/end offsets',
        passed: all.length > 0 && all.every((c) => c.start !== null && c.end !== null && c.source.length > 0),
        message: out.results.map((r) => `${r.config.label}: ${r.stats.offsets.mastra} Mastra, ${r.stats.offsets.relocated} relocated, ${r.stats.offsets.unlocated} unlocated`).join('; '),
      },
      {
        id: 'sizes-within-limit',
        label: 'Every chunk is within its configuration’s maxSize (tokens for token chunking, characters otherwise)',
        passed: out.results.every((r) => r.stats.overLimit === 0),
        message: out.results.map((r) => `${r.config.label}: max ${r.unit === 'tokens' ? r.stats.tokens.max : r.stats.chars.max}/${r.config.maxSize} ${r.unit}`).join('; '),
      },
      {
        id: 'source-covered',
        label: 'The chunks cover all of the source text’s letters and digits (nothing lost)',
        passed: out.results.length > 0 && out.results.every((r) => r.stats.coverage === 1),
        message: out.results.map((r) => `${r.config.label}: ${(r.stats.coverage * 100).toFixed(1)} %`).join('; '),
      },
    ];
    return summarizeChecks(checks);
  },
};
