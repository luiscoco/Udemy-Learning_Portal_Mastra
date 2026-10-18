import { createHash } from 'node:crypto';
import type { UploadedFile } from '@mlp/contracts';

export const LIMITS = {
  /** Per-file size limit, measured on the decoded bytes. */
  maxBytes: 1_048_576,
  maxUploads: 3,
  maxPages: 50,
  maxChars: 200_000,
  extractTimeoutMs: 10_000,
  maxNameLength: 120,
} as const;

export type DocType = 'text/plain' | 'text/markdown' | 'application/pdf';
export type RejectCode =
  | 'INVALID_NAME'
  | 'UNSUPPORTED_TYPE'
  | 'INVALID_ENCODING'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_FILE'
  | 'EXECUTABLE_CONTENT'
  | 'MIME_MISMATCH'
  | 'NOT_TEXT'
  | 'MALFORMED_PDF'
  | 'ENCRYPTED_PDF'
  | 'TOO_MANY_PAGES'
  | 'NO_TEXT'
  | 'EXTRACTION_TIMEOUT';

export const EXTENSIONS: Record<string, DocType> = { '.txt': 'text/plain', '.md': 'text/markdown', '.markdown': 'text/markdown', '.pdf': 'application/pdf' };
/** Declared (browser) MIME types compatible with each detected type. Empty = the browser did not say. */
const DECLARED_OK: Record<DocType, string[]> = {
  'text/plain': ['text/plain', ''],
  'text/markdown': ['text/markdown', 'text/x-markdown', 'text/plain', ''],
  'application/pdf': ['application/pdf', 'application/x-pdf', ''],
};
const BINARY_SIGNATURES: { name: string; bytes: number[] }[] = [
  { name: 'Windows executable (MZ)', bytes: [0x4d, 0x5a] },
  { name: 'ELF executable', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: 'Mach-O executable', bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { name: 'Java class / Mach-O fat binary', bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { name: 'ZIP archive', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: 'GZIP archive', bytes: [0x1f, 0x8b] },
  { name: 'PNG image', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: 'JPEG image', bytes: [0xff, 0xd8, 0xff] },
  { name: 'GIF image', bytes: [0x47, 0x49, 0x46, 0x38] },
];

export class Rejection extends Error {
  constructor(
    readonly code: RejectCode,
    message: string,
  ) {
    super(message);
  }
}

/** Keeps only the base name, without control characters; never trusts a client path. */
export function sanitizeName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!base || /^\.+$/.test(base) || base.length > LIMITS.maxNameLength) throw new Rejection('INVALID_NAME', 'file name is empty, a path, or too long');
  return base;
}

export const extensionOf = (name: string) => (/\.[a-z0-9]{1,10}$/i.exec(name)?.[0] ?? '').toLowerCase();

export function decodeBase64Strict(data: string): Buffer {
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Rejection('INVALID_ENCODING', 'file data is not valid base64');
  return Buffer.from(data, 'base64');
}

export function binarySignature(bytes: Uint8Array): string | null {
  return BINARY_SIGNATURES.find((s) => s.bytes.every((b, i) => bytes[i] === b))?.name ?? null;
}

export const looksLikePdf = (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, 1024)).includes('%PDF-');

export function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Rejection('NOT_TEXT', 'not valid UTF-8 text');
  }
  if (text.includes('\u0000')) throw new Rejection('NOT_TEXT', 'contains NUL bytes (binary data)');
  // eslint-disable-next-line no-control-regex
  const controls = (text.match(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g) ?? []).length;
  if (controls / Math.max(1, text.length) > 0.01) throw new Rejection('NOT_TEXT', 'too many control characters for a text file');
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').normalize('NFC');
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Rejection('EXTRACTION_TIMEOUT', `extraction took longer than ${ms / 1000} s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Extracts PDF text with pdf.js (via unpdf): no font loading, no code generation, bounded pages, chars and time. */
export async function extractPdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await withTimeout(
      // pdf.js 6.1 has no eval/new Function path at all (checked in the bundle); fonts are not loaded.
      getDocumentProxy(new Uint8Array(bytes), { disableFontFace: true, useSystemFonts: false, verbosity: 0 }),
      LIMITS.extractTimeoutMs,
    );
    if (pdf.numPages < 1) throw new Rejection('MALFORMED_PDF', 'the PDF has no pages');
    if (pdf.numPages > LIMITS.maxPages) throw new Rejection('TOO_MANY_PAGES', `${pdf.numPages} pages; at most ${LIMITS.maxPages}`);
    const { text } = await withTimeout(extractText(pdf, { mergePages: false }), LIMITS.extractTimeoutMs);
    return { text: text.map((t) => t.trim()).join('\n\n').normalize('NFC'), pages: pdf.numPages };
  } catch (e) {
    if (e instanceof Rejection) throw e;
    const name = (e as { name?: string }).name ?? '';
    if (name === 'PasswordException') throw new Rejection('ENCRYPTED_PDF', 'the PDF is password-protected');
    throw new Rejection('MALFORMED_PDF', 'the PDF could not be parsed');
  } finally {
    // pdf.js 6: the document is released through its loading task (PDFDocumentProxy.destroy is gone).
    await pdf?.loadingTask.destroy().catch(() => {});
  }
}

export interface IngestResult {
  name: string;
  origin: 'sample' | 'upload';
  declaredType: string;
  declaredSize: number;
  measuredSize: number | null;
  detectedType: DocType | null;
  status: 'ingested' | 'rejected' | 'duplicate';
  code?: RejectCode;
  reason?: string;
  sha256?: string;
  chars?: number;
  pages?: number | null;
  truncated?: boolean;
  preview?: string;
}

/** The whole per-file pipeline. Returns the result and (when ingested) the full text, kept app-side. */
export async function ingestFile(f: UploadedFile, origin: IngestResult['origin']): Promise<{ result: IngestResult; text: string | null }> {
  const base: IngestResult = {
    name: f.name.slice(0, LIMITS.maxNameLength),
    origin,
    declaredType: f.type,
    declaredSize: f.size,
    measuredSize: null,
    detectedType: null,
    status: 'rejected',
  };
  try {
    const name = sanitizeName(f.name);
    base.name = name;
    const expected = EXTENSIONS[extensionOf(name)];
    if (!expected) throw new Rejection('UNSUPPORTED_TYPE', `extension ${extensionOf(name) || '(none)'} is not allowed`);
    const bytes = decodeBase64Strict(f.dataBase64);
    base.measuredSize = bytes.length;
    if (bytes.length > LIMITS.maxBytes) throw new Rejection('FILE_TOO_LARGE', `${bytes.length} bytes; the limit is ${LIMITS.maxBytes}`);
    if (bytes.length === 0) throw new Rejection('EMPTY_FILE', 'the file is empty');
    const sig = binarySignature(bytes);
    if (sig) throw new Rejection('EXECUTABLE_CONTENT', `content is a ${sig}, whatever the name says`);
    const isPdf = looksLikePdf(bytes);
    if (expected === 'application/pdf' && !isPdf) throw new Rejection('MIME_MISMATCH', 'named .pdf but the content is not a PDF');
    if (expected !== 'application/pdf' && isPdf) throw new Rejection('MIME_MISMATCH', 'the content is a PDF but the name says text');
    if (!DECLARED_OK[expected].includes(f.type.toLowerCase())) throw new Rejection('MIME_MISMATCH', `declared type "${f.type}" does not match ${expected}`);
    base.detectedType = expected;
    let text: string;
    let pages: number | null = null;
    if (expected === 'application/pdf') ({ text, pages } = await extractPdf(bytes));
    else text = decodeText(bytes);
    if (!text.trim()) throw new Rejection('NO_TEXT', expected === 'application/pdf' ? 'no extractable text (scanned or blank pages?)' : 'the file has no text');
    const truncated = text.length > LIMITS.maxChars;
    if (truncated) text = text.slice(0, LIMITS.maxChars);
    return {
      result: {
        ...base,
        status: 'ingested',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        chars: text.length,
        pages,
        truncated,
        preview: text.replace(/\s+/g, ' ').trim().slice(0, 160),
      },
      text,
    };
  } catch (e) {
    const r = e instanceof Rejection ? e : new Rejection('MALFORMED_PDF', 'unexpected error while reading the file');
    return { result: { ...base, status: 'rejected', code: r.code, reason: r.message }, text: null };
  }
}
