import { createHash } from 'node:crypto';
import { tokenize } from '../lab-42/hybrid.js';
import type { SourcePassage } from '../lab-44/claims.js';
import { listLibrary, type DocumentLibrary, type LibraryDocument } from '../lab-36/library.js';

/** The seeded knowledge base: three short policies, the same for every learner who seeds them. */
const SAMPLES: { name: string; text: string }[] = [
  {
    name: 'refund-policy.md',
    text:
      '# Refund policy\n\n' +
      'Unused items can be returned for a full refund within 30 days of delivery.\n\n' +
      'Refunds are paid to the original payment method within 5 business days after we receive the item.\n\n' +
      'Opened electronics can only be refunded when they are faulty.',
  },
  {
    name: 'shipping-policy.md',
    text:
      '# Shipping policy\n\n' +
      'Standard shipping takes 3 to 5 business days and is free above 50 euros.\n\n' +
      'Express shipping takes 1 business day and costs 9 euros.',
  },
  {
    name: 'warranty.md',
    text:
      '# Warranty\n\n' +
      'Every appliance has a 2-year warranty from the date of delivery.\n\n' +
      'The warranty covers manufacturing faults but not accidental damage.',
  },
];

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
export const SAMPLE_HASHES = new Set(SAMPLES.map((s) => sha(s.text)));

export function sampleDocuments(): LibraryDocument[] {
  return SAMPLES.map((s) => ({
    docId: sha(s.text).slice(0, 12),
    name: s.name,
    mime: 'text/markdown',
    sha256: sha(s.text),
    bytes: Buffer.byteLength(s.text),
    chars: s.text.length,
    pages: null,
    truncated: false,
    ingestedAt: '2026-01-01T00:00:00.000Z',
    text: s.text,
  }));
}

/** Puts the samples into the learner's own library (idempotent: documents are stored by content hash). */
export function seedSamples(library: DocumentLibrary): { added: number; existing: number } {
  let added = 0;
  let existing = 0;
  for (const d of sampleDocuments()) {
    const r = library.put(d);
    if (r === 'new') added += 1;
    else if (r === 'existing') existing += 1;
  }
  return { added, existing };
}

export const documentsOf = (library: DocumentLibrary) => listLibrary(library);

/** Paragraph passages with stable ids "<name>#<n>" (headings are skipped). */
export function passagesOf(docs: LibraryDocument[]): SourcePassage[] {
  return docs.flatMap((d) =>
    d.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p && !p.startsWith('#'))
      .map((text, i) => ({
        id: `${d.name.replace(/\.[a-z]+$/, '')}#${i + 1}`,
        title: d.name,
        location: `paragraph ${i + 1}`,
        text,
      })),
  );
}

/** Keyword retrieval: passages ranked by how many distinct query words they contain. */
export function search(query: string, passages: SourcePassage[], k = 4): SourcePassage[] {
  const q = new Set(tokenize(query));
  return passages
    .map((p) => ({ p, score: new Set(tokenize(p.text).filter((t) => q.has(t))).size }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
    .slice(0, k)
    .map((x) => x.p);
}
