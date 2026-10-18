import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DocType } from './ingest.js';

export const LIBRARY_CAPACITY = 100;

export interface LibraryDocument {
  docId: string;
  name: string;
  mime: DocType;
  sha256: string;
  bytes: number;
  chars: number;
  pages: number | null;
  truncated: boolean;
  ingestedAt: string;
  text: string;
}

/**
 * A local document library for the RAG labs: one JSON file per document, named by its SHA-256, so storing
 * is idempotent. Paths stay on the server; callers only see document metadata.
 */
export class DocumentLibrary {
  constructor(readonly dir: string) {}

  private file(sha256: string) {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('invalid document hash');
    return join(this.dir, `${sha256}.json`);
  }

  has(sha256: string) {
    return existsSync(this.file(sha256));
  }

  count() {
    return existsSync(this.dir) ? readdirSync(this.dir).filter((f) => /^[a-f0-9]{64}\.json$/.test(f)).length : 0;
  }

  /** Stores a document once; returns whether it was new, already there, or refused because the library is full. */
  put(doc: LibraryDocument): 'new' | 'existing' | 'skipped (library full)' {
    if (this.has(doc.sha256)) return 'existing';
    if (this.count() >= LIBRARY_CAPACITY) return 'skipped (library full)';
    mkdirSync(this.dir, { recursive: true });
    const target = this.file(doc.sha256);
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(doc));
    renameSync(tmp, target); // atomic on the same volume
    return 'new';
  }

  get(sha256: string): LibraryDocument | null {
    return this.has(sha256) ? (JSON.parse(readFileSync(this.file(sha256), 'utf8')) as LibraryDocument) : null;
  }
}

/** All stored documents, newest first (used by the later RAG labs). */
export function listLibrary(library: DocumentLibrary, limit = LIBRARY_CAPACITY): LibraryDocument[] {
  if (!existsSync(library.dir)) return [];
  return readdirSync(library.dir)
    .filter((f) => /^[a-f0-9]{64}\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(library.dir, f), 'utf8')) as LibraryDocument)
    .sort((a, b) => b.ingestedAt.localeCompare(a.ingestedAt) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** The shared course library (the same directory L36 writes to), for any lab's services. */
export function courseLibrary(services: { memory: { file(name: string): string } }): DocumentLibrary {
  return new DocumentLibrary(join(dirname(services.memory.file('lab-36-library')), 'library'));
}
