import type { UploadedFile } from '@mlp/contracts';

/**
 * Built-in course fixtures, generated in code (no binary files in the repository). Each declares what
 * the ingestion pipeline must do with it, so the checks can prove both acceptance and rejection.
 */
export interface Sample {
  file: UploadedFile;
  expect: { status: 'ingested'; contains: string } | { status: 'rejected'; code: string };
  kind: 'valid' | 'malformed' | 'oversize';
}

const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const file = (name: string, type: string, bytes: Uint8Array): UploadedFile => ({ name, type, size: bytes.length, dataBase64: b64(bytes) });

const escapePdf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** A minimal, valid single-font PDF (one page per entry), with a correct xref table. */
export function makePdf(pages: string[][]): Uint8Array {
  const objs: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((lines, i) => {
    const content = `BT /F1 12 Tf 72 720 Td 14 TL ${lines.map((l) => `(${escapePdf(l)}) Tj T*`).join(' ')} ET`;
    objs[pageIds[i]!] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`;
    objs[pageIds[i]! + 1] = `<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objs.length; id++) {
    offsets[id] = enc.encode(out).length;
    out += `${id} 0 obj\n${objs[id]}\nendobj\n`;
  }
  const xref = enc.encode(out).length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objs.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(out);
}

export const HANDBOOK_MD = `# Support handbook

## Refunds
Customers can request a refund within 30 days of delivery. Refunds go back to the original payment method.

## Escalation
Escalate outages to the on-call engineer within 15 minutes.
`;

export const SHIPPING_TXT = `Shipping guide
Standard shipping takes three to five business days.
Express orders placed before noon arrive the next business day.
`;

export function buildSamples(set: 'mixed' | 'valid' | 'none', maxBytes: number): Sample[] {
  if (set === 'none') return [];
  const valid: Sample[] = [
    { kind: 'valid', file: file('handbook.md', 'text/markdown', enc.encode(HANDBOOK_MD)), expect: { status: 'ingested', contains: 'within 30 days' } },
    { kind: 'valid', file: file('shipping-guide.txt', 'text/plain', enc.encode(SHIPPING_TXT)), expect: { status: 'ingested', contains: 'three to five business days' } },
    {
      kind: 'valid',
      file: file(
        'warranty.pdf',
        'application/pdf',
        makePdf([
          ['Warranty terms', 'Hardware carries a two-year warranty.'],
          ['Accidental damage is not covered.'],
        ]),
      ),
      expect: { status: 'ingested', contains: 'two-year warranty' },
    },
  ];
  if (set === 'valid') return valid;
  const truncated = makePdf([['This document is cut short.']]).slice(0, 120);
  return [
    ...valid,
    { kind: 'malformed', file: file('broken.pdf', 'application/pdf', truncated), expect: { status: 'rejected', code: 'MALFORMED_PDF' } },
    { kind: 'malformed', file: file('blank.pdf', 'application/pdf', makePdf([[]])), expect: { status: 'rejected', code: 'NO_TEXT' } },
    {
      kind: 'malformed',
      file: file('invoice.txt', 'text/plain', new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00])),
      expect: { status: 'rejected', code: 'EXECUTABLE_CONTENT' },
    },
    { kind: 'malformed', file: file('notes.pdf', 'application/pdf', enc.encode('These are plain notes, not a PDF.')), expect: { status: 'rejected', code: 'MIME_MISMATCH' } },
    { kind: 'malformed', file: file('setup.exe', 'application/octet-stream', enc.encode('anything')), expect: { status: 'rejected', code: 'UNSUPPORTED_TYPE' } },
    { kind: 'malformed', file: file('empty.txt', 'text/plain', new Uint8Array()), expect: { status: 'rejected', code: 'EMPTY_FILE' } },
    {
      kind: 'oversize',
      file: file('huge-log.txt', 'text/plain', enc.encode('x'.repeat(maxBytes + 1))),
      expect: { status: 'rejected', code: 'FILE_TOO_LARGE' },
    },
  ];
}
