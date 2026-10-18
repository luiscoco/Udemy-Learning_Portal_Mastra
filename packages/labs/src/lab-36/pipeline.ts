import { z } from 'zod';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { UploadedFile } from '@mlp/contracts';
import { ingestFile, type DocType, type IngestResult } from './ingest.js';
import type { DocumentLibrary } from './library.js';

/** What a workflow step sees about a file: metadata only. The bytes stay in an app-side map. */
export const FileRefSchema = z.object({
  index: z.number().int(),
  name: z.string(),
  declaredType: z.string(),
  declaredSize: z.number().int(),
  origin: z.enum(['sample', 'upload']),
});
export type FileRef = z.infer<typeof FileRefSchema>;

const ResultSchema = z.record(z.string(), z.unknown());

export interface PipelineDeps {
  /** Raw files by index (never passed through the workflow). */
  files: Map<number, UploadedFile>;
  /** Extracted texts by index (kept app-side; the trace only carries previews). */
  texts: Map<number, string>;
  library: DocumentLibrary | null;
}

export interface CatalogueEntry extends IngestResult {
  index: number;
  stored: 'new' | 'existing' | 'skipped (library full)' | 'not stored' | null;
}

export function buildIngestionWorkflow(deps: PipelineDeps) {
  const ingest = createStep({
    id: 'ingestFile',
    description: 'Validates one file (name, type, size, content) and extracts its text on the server.',
    inputSchema: FileRefSchema,
    outputSchema: ResultSchema,
    execute: async ({ inputData: ref }) => {
      const file = deps.files.get(ref.index)!;
      const { result, text } = await ingestFile(file, ref.origin);
      if (text !== null) deps.texts.set(ref.index, text);
      return { index: ref.index, ...result } as Record<string, unknown>;
    },
  });
  const catalogue = createStep({
    id: 'catalogue',
    description: 'Marks duplicate content within the batch and stores new documents in the library.',
    inputSchema: z.array(ResultSchema),
    outputSchema: z.object({ entries: z.array(ResultSchema) }),
    execute: async ({ inputData }) => {
      const seen = new Set<string>();
      const entries = (inputData as unknown as (IngestResult & { index: number })[]).map((r): CatalogueEntry => {
        if (r.status !== 'ingested' || !r.sha256) return { ...r, stored: null };
        if (seen.has(r.sha256)) return { ...r, status: 'duplicate', reason: 'same content as an earlier file in this batch', stored: null };
        seen.add(r.sha256);
        if (!deps.library) return { ...r, stored: 'not stored' };
        const stored = deps.library.put({
          docId: r.sha256.slice(0, 16),
          name: r.name,
          mime: r.detectedType as DocType,
          sha256: r.sha256,
          bytes: r.measuredSize ?? 0,
          chars: r.chars ?? 0,
          pages: r.pages ?? null,
          truncated: r.truncated ?? false,
          ingestedAt: new Date().toISOString(),
          text: deps.texts.get(r.index) ?? '',
        });
        return { ...r, stored };
      });
      return { entries: entries as unknown as Record<string, unknown>[] };
    },
  });
  return createWorkflow({ id: 'document-ingestion', inputSchema: z.array(FileRefSchema), outputSchema: catalogue.outputSchema })
    .foreach(ingest, { concurrency: 2 })
    .then(catalogue)
    .commit();
}
