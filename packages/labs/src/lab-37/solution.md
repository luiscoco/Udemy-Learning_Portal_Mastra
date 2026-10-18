# Solution: traceable chunks with Mastra

```ts
import { MDocument } from '@mastra/rag';

const doc = MDocument.fromMarkdown(text, { source: 'handbook.md' });
const raw = await doc.chunk({ strategy: 'recursive', maxSize: 200, overlap: 50, addStartIndex: true });

let from = 0;
const chunks = raw
  .filter((c) => /[\p{L}\p{N}]/u.test(c.text)) // drop empty and "." fragments
  .map((c, i) => {
    const reported = c.metadata.startIndex;
    const start = typeof reported === 'number' && reported >= 0 && text.slice(reported, reported + c.text.length) === c.text
      ? reported
      : text.indexOf(c.text, from); // relocate (token chunks can report -1)
    from = start;
    return { id: `handbook:${i}`, source: 'handbook.md', start, end: start + c.text.length, text: c.text };
  });

for (const c of chunks) expect(text.slice(c.start, c.end)).toBe(c.text);
```

Compare strategies on the same text. Report the chunk count, the min/avg/max size in characters and in tokens (`js-tiktoken`, `cl100k_base`), the total overlap, and the coverage of letters and digits.

**Challenge:** refund rules are short paragraphs under one heading. The `markdown` strategy, or `recursive` at about 200 characters with 50 overlap, keeps each rule whole: overlap only applies where a section had to be cut. Quote the extra cost from `totalOverlapChars`, and check that every rule's sentence appears inside a single chunk.
