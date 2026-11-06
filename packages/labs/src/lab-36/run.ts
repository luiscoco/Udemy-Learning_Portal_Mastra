import { withLiveCheckpoint } from '../shared/live-checkpoint.js';
import { z } from 'zod';
import { summarizeChecks, uploadedFilesSchema, type CheckResult, type LabDefinition, type UploadedFile } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import type { LabServices } from '../services.js';
import { runTypedWorkflow } from '../shared/workflow-stream.js';
import { lab36Definition } from './definition.js';
import { LIMITS } from './ingest.js';
import { courseLibrary, LIBRARY_CAPACITY } from './library.js';
import { buildIngestionWorkflow, type CatalogueEntry, type FileRef } from './pipeline.js';
import { buildSamples, type Sample } from './samples.js';

export const Lab36InputSchema = z.object({
  samples: z.enum(['mixed', 'valid', 'none']),
  files: uploadedFilesSchema({ maxBytes: LIMITS.maxBytes, maxFiles: LIMITS.maxUploads }).default([]),
  store: z.boolean(),
});
export type Lab36Input = z.infer<typeof Lab36InputSchema>;

export interface FileOutcome extends CatalogueEntry {
  /** For built-in samples: what the pipeline was expected to do, and whether the text had the expected phrase. */
  expected?: Sample['expect'];
  kind?: Sample['kind'];
  containsExpected?: boolean;
}

export interface Lab36Output {
  samples: Lab36Input['samples'];
  workflowStatus: string;
  files: FileOutcome[];
  summary: { ingested: number; rejected: number; duplicates: number; byCode: Record<string, number> };
  library: { stored: boolean; newDocuments: number; alreadyStored: number; documentsInLibrary: number; capacity: number; recordsPerHash: Record<string, number> };
  limits: typeof LIMITS;
}

const baseLab36: LabImplementation<Lab36Input, Lab36Output, LabServices> = {
  definition: lab36Definition as LabDefinition,
  inputSchema: Lab36InputSchema,

  async run(ctx, input) {
    const samples = buildSamples(input.samples, LIMITS.maxBytes);
    const all: { file: UploadedFile; origin: FileRef['origin']; sample?: Sample }[] = [
      ...samples.map((s) => ({ file: s.file, origin: 'sample' as const, sample: s })),
      ...input.files.map((f) => ({ file: f, origin: 'upload' as const })),
    ];
    const files = new Map(all.map((a, i) => [i, a.file]));
    const texts = new Map<number, string>();
    const library = input.store ? courseLibrary(ctx.services) : null;
    const refs: FileRef[] = all.map((a, i) => ({ index: i, name: a.file.name.slice(0, 120), declaredType: a.file.type, declaredSize: a.file.size, origin: a.origin }));
    ctx.log('info', `Ingesting ${samples.length} built-in fixture(s) and ${input.files.length} upload(s); raw bytes stay out of the workflow trace.`);

    const workflow = buildIngestionWorkflow({ files, texts, library });
    const res = await runTypedWorkflow(
      ctx as RunContext<unknown>,
      'document-ingestion',
      await workflow.createRun(),
      refs,
      z.object({ entries: z.array(z.record(z.string(), z.unknown())) }),
    );
    const entries = (res.typed?.entries ?? []) as unknown as CatalogueEntry[];
    const outcomes: FileOutcome[] = entries.map((e) => {
      const sample = all[e.index]?.sample;
      if (!sample) return e;
      const text = texts.get(e.index) ?? '';
      return { ...e, expected: sample.expect, kind: sample.kind, ...(sample.expect.status === 'ingested' ? { containsExpected: text.includes(sample.expect.contains) } : {}) };
    });
    for (const o of outcomes)
      ctx.log(
        o.status === 'ingested' ? 'info' : 'warn',
        o.status === 'ingested'
          ? `${o.name}: ingested (${o.detectedType}, ${o.chars} chars${o.pages ? `, ${o.pages} page(s)` : ''}); library: ${o.stored}`
          : `${o.name}: ${o.status}${o.code ? ` ${o.code}` : ''} (${o.reason})`,
      );

    const byCode: Record<string, number> = {};
    for (const o of outcomes) if (o.code) byCode[o.code] = (byCode[o.code] ?? 0) + 1;
    const recordsPerHash: Record<string, number> = {};
    if (library) for (const o of outcomes) if (o.status === 'ingested' && o.sha256) recordsPerHash[o.sha256.slice(0, 16)] = library.has(o.sha256) ? 1 : 0;
    return {
      samples: input.samples,
      workflowStatus: res.status,
      files: outcomes,
      summary: {
        ingested: outcomes.filter((o) => o.status === 'ingested').length,
        rejected: outcomes.filter((o) => o.status === 'rejected').length,
        duplicates: outcomes.filter((o) => o.status === 'duplicate').length,
        byCode,
      },
      library: {
        stored: input.store,
        newDocuments: outcomes.filter((o) => o.stored === 'new').length,
        alreadyStored: outcomes.filter((o) => o.stored === 'existing').length,
        documentsInLibrary: library?.count() ?? 0,
        capacity: LIBRARY_CAPACITY,
        recordsPerHash,
      },
      limits: LIMITS,
    };
  },

  validate(out, input, { events }) {
    const checks: CheckResult[] = [];
    const sampleOut = out.files.filter((f) => f.origin === 'sample');
    const valid = sampleOut.filter((f) => f.kind === 'valid');
    const malformed = sampleOut.filter((f) => f.kind === 'malformed');
    const oversize = sampleOut.filter((f) => f.kind === 'oversize');
    const codeOk = (f: FileOutcome) => f.expected?.status === 'rejected' && f.status === 'rejected' && f.code === f.expected.code;
    if (valid.length) {
      const bad = valid.filter((f) => f.status !== 'ingested' || !f.containsExpected);
      checks.push({
        id: 'fixtures-ingested',
        label: 'The valid fixtures were ingested and their text was extracted',
        passed: bad.length === 0,
        message: bad.length ? bad.map((f) => `${f.name}: ${f.status}${f.code ? ` ${f.code}` : ''}`).join('; ') : valid.map((f) => `${f.name} (${f.chars} chars)`).join(', '),
      });
    }
    if (malformed.length) {
      const bad = malformed.filter((f) => !codeOk(f));
      checks.push({
        id: 'malformed-rejected',
        label: 'Malformed, disguised, mismatched and empty files were rejected with the right reason',
        passed: bad.length === 0,
        message: bad.length
          ? bad.map((f) => `${f.name}: ${f.status} ${f.code ?? ''} (expected ${f.expected?.status === 'rejected' ? f.expected.code : '?'})`).join('; ')
          : malformed.map((f) => `${f.name} → ${f.code}`).join(', '),
      });
    }
    if (oversize.length) {
      const bad = oversize.filter((f) => !codeOk(f));
      checks.push({
        id: 'oversize-rejected',
        label: 'Files over the size limit were rejected (measured on the decoded bytes)',
        passed: bad.length === 0,
        message: bad.length ? `${bad.map((f) => f.name).join(', ')} not rejected as FILE_TOO_LARGE` : oversize.map((f) => `${f.name}: ${f.measuredSize} bytes`).join(', '),
      });
    }
    const uploads = out.files.filter((f) => f.origin === 'upload');
    const undecided = uploads.filter((f) => !(f.status === 'ingested' ? (f.chars ?? 0) > 0 : f.status === 'duplicate' || !!f.code));
    checks.push({
      id: 'uploads-decided',
      label: 'Every uploaded file was either ingested with text or rejected with a reason',
      passed: out.workflowStatus === 'success' && undecided.length === 0 && out.files.length === buildSamples(out.samples, LIMITS.maxBytes).length + input.files.length,
      message: uploads.length ? uploads.map((f) => `${f.name}: ${f.status}${f.code ? ` ${f.code}` : ''}`).join('; ') : 'no uploads in this run',
    });
    const blobs = [...buildSamples(out.samples, LIMITS.maxBytes).map((s) => s.file), ...input.files]
      .map((f) => f.dataBase64.slice(0, 48))
      .filter((p) => p.length >= 24);
    const trace = JSON.stringify(events);
    const leaked = blobs.filter((p) => trace.includes(p));
    checks.push({
      id: 'no-raw-bytes-in-trace',
      label: 'No raw file bytes appeared in the workflow trace or events',
      passed: leaked.length === 0,
      message: leaked.length ? `${leaked.length} file(s) leaked into the trace` : `${blobs.length} file(s) checked against ${events.length} event(s)`,
    });
    if (out.library.stored) {
      const missing = Object.entries(out.library.recordsPerHash).filter(([, n]) => n !== 1);
      checks.push({
        id: 'library-deduplicated',
        label: 'Each ingested document is stored exactly once in the library (by content hash)',
        passed: missing.length === 0,
        message: missing.length
          ? `not stored: ${missing.map(([h]) => h).join(', ')}`
          : `${out.library.newDocuments} new, ${out.library.alreadyStored} already stored; ${out.library.documentsInLibrary} document(s) in the library`,
      });
    }
    return summarizeChecks(checks);
  },
};

export const lab36 = withLiveCheckpoint(baseLab36);
