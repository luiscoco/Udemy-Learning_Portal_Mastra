import { expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { documentLines, makeDocx, makeInfographic, pdfFromJpegs, xml } from './artifacts';
import type { PublishedAnswer } from './state';
const answer: PublishedAnswer = {
  id: 'answer-original',
  labId: 'lab-03',
  topic: 'Agent <example>',
  question: 'How?',
  mode: 'offline',
  modelId: null,
  at: '2026-11-07T10:00:00.000Z',
  text:
    '## Safe result\n\nRésumé & explanation <script>alert(1)</script>\n\n' +
    String.fromCharCode(96).repeat(3) +
    'typescript\nconst text: string = "<safe>";\n  console.log(text);\n' +
    String.fromCharCode(96).repeat(3),
};
it('produces a valid Word package with complete escaped text, coloured code and provenance', () => {
  const zip = unzipSync(makeDocx(answer));
  expect(Object.keys(zip)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  const document = strFromU8(zip['word/document.xml']!);
  const tick = String.fromCharCode(96);
  const inline = {
    ...answer,
    text: 'Keep ' + tick + '__dirname__' + tick + ' and ' + tick + '[x](y)' + tick + ' literal; **bold** is formatting.',
  };
  const inlineDocument = strFromU8(unzipSync(makeDocx(inline))['word/document.xml']!);
  expect(inlineDocument).toContain('Keep __dirname__ and [x](y) literal; bold is formatting.');
  expect(new DOMParser().parseFromString(document, 'application/xml').querySelector('parsererror')).toBeNull();
  expect(document).toContain('answer-original');
  expect(document).toContain('Résumé &amp; explanation &lt;script&gt;');
  expect(document).toContain('w:val="7046C7"');
  expect(document).toContain('xml:space="preserve"');
  expect(
    documentLines(answer)
      .filter((l) => l.kind === 'code')
      .map((l) => l.spans.map((s) => s.text).join('')),
  ).toEqual(['const text: string = "<safe>";', '  console.log(text);']);
});
it('escapes infographic content, preserves selected identity and labels the bounded excerpt', () => {
  const svg = makeInfographic(answer);
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(document.querySelector('parsererror')).toBeNull();
  expect(document.querySelector('script')).toBeNull();
  expect(document.querySelector('metadata')?.textContent).toContain('answer-original');
  expect(svg).toContain('bounded excerpt');
  expect(svg).toContain('Offline authored guidance');
  expect(document.querySelectorAll('tspan').length).toBeGreaterThan(2);
  expect(xml('"<&>\u0001')).toBe('&quot;&lt;&amp;&gt;');
});
it('writes correct byte-based PDF references across multiple binary image pages', () => {
  const pdf = pdfFromJpegs([new Uint8Array([255, 216, 0, 128, 255, 217]), new Uint8Array([255, 216, 10, 255, 217])]);
  const text = new TextDecoder('latin1').decode(pdf);
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text).toContain('/Count 2');
  const xref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
  expect(new TextDecoder().decode(pdf.slice(xref, xref + 4))).toBe('xref');
  const entries = text.slice(xref).split('\n').slice(3, 11);
  entries.forEach((line, i) => {
    const offset = Number(line.slice(0, 10));
    expect(new TextDecoder().decode(pdf.slice(offset, offset + 12))).toContain(i + 1 + ' 0 obj');
  });
});
