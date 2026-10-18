import { afterAll, describe, expect, it } from 'vitest';
import type { UploadedFile } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { ingestFile, LIMITS, sanitizeName } from './ingest.js';
import { lab36, type Lab36Output } from './run.js';
import { buildSamples, makePdf } from './samples.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab36]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab36') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab36Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown>) {
  const r = runner.start('lab-36', { input: { ...lab36.definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'complete' || e.type === 'log').slice(-3)));
  return { ...result, events };
}
const upload = (name: string, type: string, bytes: Uint8Array | string): UploadedFile => {
  const b = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes);
  return { name, type, size: b.length, dataBase64: b.toString('base64') };
};
const code = async (f: UploadedFile) => (await ingestFile(f, 'upload')).result.code ?? (await ingestFile(f, 'upload')).result.status;

describe('lab-36 ingestion pipeline (unit): one case per decision', () => {
  it('accepts text, markdown and PDF, and extracts text', async () => {
    const pdf = await ingestFile(upload('a.pdf', 'application/pdf', makePdf([['Page one text'], ['Page two text']])), 'upload');
    expect(pdf.result).toMatchObject({ status: 'ingested', detectedType: 'application/pdf', pages: 2 });
    expect(pdf.text).toContain('Page two text');
    const md = await ingestFile(upload('n.md', '', '\uFEFF# Title\r\nBody'), 'upload');
    expect(md.text).toBe('# Title\nBody'); // BOM stripped, CRLF normalised
  });
  it.each([
    [upload('../../etc/passwd', 'text/plain', 'x'), 'UNSUPPORTED_TYPE'], // path stripped → "passwd", no extension
    [upload('...', 'text/plain', 'x'), 'INVALID_NAME'],
    [upload('a.txt', 'text/plain', ''), 'EMPTY_FILE'],
    [upload('a.txt', 'text/plain', new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 1])), 'EXECUTABLE_CONTENT'],
    [upload('a.txt', 'text/plain', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0])), 'EXECUTABLE_CONTENT'],
    [upload('a.txt', 'text/plain', new Uint8Array([0xc3, 0x28, 0x41])), 'NOT_TEXT'],
    [upload('a.txt', 'text/plain', 'hello\u0000world'), 'NOT_TEXT'],
    [upload('a.txt', 'text/plain', makePdf([['x']])), 'MIME_MISMATCH'],
    [upload('a.txt', 'application/pdf', 'plain'), 'MIME_MISMATCH'],
    [upload('a.pdf', 'application/pdf', '%PDF-1.4\nnot really'), 'MALFORMED_PDF'],
    [upload('a.pdf', 'application/pdf', makePdf([[]])), 'NO_TEXT'],
    [upload('a.txt', 'text/plain', 'x'.repeat(LIMITS.maxBytes + 1)), 'FILE_TOO_LARGE'],
  ])('%# %s → %s', async (f, expected) => {
    expect(await code(f)).toBe(expected);
  });
  it('measures the decoded size, not the declared one', async () => {
    const lying = { ...upload('a.txt', 'text/plain', 'x'.repeat(LIMITS.maxBytes + 10)), size: 10 };
    expect((await ingestFile(lying, 'upload')).result).toMatchObject({ code: 'FILE_TOO_LARGE', declaredSize: 10, measuredSize: LIMITS.maxBytes + 10 });
  });
  it('strict base64 and safe names', async () => {
    expect(await code({ name: 'a.txt', type: 'text/plain', size: 1, dataBase64: 'abc' })).toBe('INVALID_ENCODING');
    expect(sanitizeName('C:\\Users\\x\\report.md')).toBe('report.md');
  });
  it('every built-in fixture has a matching outcome', async () => {
    for (const s of buildSamples('mixed', LIMITS.maxBytes)) {
      const { result } = await ingestFile(s.file, 'sample');
      expect(result.status, s.file.name).toBe(s.expect.status);
      if (s.expect.status === 'rejected') expect(result.code, s.file.name).toBe(s.expect.code);
    }
  });
});

describe('lab-36 document ingestion (DoD)', () => {
  it('fixtures ingested; malformed and oversize files rejected; no raw bytes in the trace', async () => {
    const { output, validation } = await run({});
    expect(validation.passed).toBe(true);
    expect(output.summary).toMatchObject({ ingested: 3, rejected: 7 });
    expect(output.files.find((f) => f.name === 'huge-log.txt')).toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('re-ingesting the same content stores nothing new', async () => {
    await run({ samples: 'valid' });
    const again = await run({ samples: 'valid' });
    expect(again.output.library).toMatchObject({ newDocuments: 0, alreadyStored: 3 });
    expect(again.validation.passed).toBe(true);
  });

  it('uploads go through the same pipeline; the trace never contains their bytes', async () => {
    const mine = upload('my-notes.md', 'text/markdown', `# My notes\n\nOur SLA for priority tickets is ${'four hours. '.repeat(20)}`);
    const disguised = upload('photo.txt', 'text/plain', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]));
    const { output, validation, events } = await run({ samples: 'none', files: [mine, disguised] });
    expect(output.files.map((f) => [f.name, f.status, f.code ?? null])).toEqual([
      ['my-notes.md', 'ingested', null],
      ['photo.txt', 'rejected', 'EXECUTABLE_CONTENT'],
    ]);
    expect(JSON.stringify(events)).not.toContain(mine.dataBase64.slice(0, 40));
    expect(validation.passed).toBe(true);
  });

  it('the server schema bounds the number and encoded size of uploads', () => {
    const f = upload('a.txt', 'text/plain', 'x');
    expect(lab36.inputSchema.safeParse({ samples: 'none', store: false, files: [f, f, f, f] }).success).toBe(false);
    const huge = { ...f, dataBase64: 'A'.repeat(2_000_000) };
    expect(lab36.inputSchema.safeParse({ samples: 'none', store: false, files: [huge] }).success).toBe(false);
  });
});
