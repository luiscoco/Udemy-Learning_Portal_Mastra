import { strToU8, zipSync } from 'fflate';
import type { Token } from 'prismjs';
import { Prism, codeLanguage } from '../../components/workspace/code-languages';
import { PublishedAnswerSchema, type PublishedAnswer } from './state';

export const xml = (value: string) =>
  value
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (code >= 32 && code !== 65534 && code !== 65535) || code === 9 || code === 10 || code === 13;
    })
    .join('')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
export const provenance = (a: PublishedAnswer) =>
  'Answer ' +
  a.id +
  ' | ' +
  a.labId +
  ' | ' +
  (a.mode === 'offline' ? 'Offline authored guidance' : 'Live: ' + a.modelId) +
  ' | ' +
  a.at;
export const answerMarkdown = (a: PublishedAnswer) =>
  '# ' + a.topic + '\n\n' + provenance(a) + '\n\nQuestion: ' + a.question + '\n\n' + a.text;
type Span = { text: string; color: string };
export type DocumentLine = { kind: 'heading' | 'body' | 'code'; spans: Span[] };
const plain = (text: string) =>
  text.replace(
    /\x60([^\x60]+)\x60|!\[[^\]]*\]\([^)]*\)|\[([^\]]+)\]\([^)]*\)|\*\*([^*]+)\*\*|__([^_]+)__/g,
    (_match, code: string | undefined, link: string | undefined, bold: string | undefined, emphasis: string | undefined) =>
      code ?? link ?? bold ?? emphasis ?? '[image omitted]',
  );
const colors: Record<string, string> = {
  keyword: '7046C7',
  string: '117B55',
  comment: '5F6B79',
  number: 'A94B10',
  function: '075FA7',
  boolean: '7046C7',
  operator: '37516A',
  punctuation: '37516A',
  property: '075FA7',
  'class-name': '075FA7',
};
export function codeSpans(text: string, language: string): Span[] {
  const grammar = Prism.languages[codeLanguage(language)];
  if (!grammar) return [{ text, color: '172D43' }];
  const flatten = (tokens: (string | Token)[], inherited = '172D43'): Span[] =>
    tokens.flatMap((token): Span[] => {
      if (typeof token === 'string') return [{ text: token, color: inherited }];
      const color = colors[token.type] ?? inherited;
      return typeof token.content === 'string'
        ? [{ text: token.content, color }]
        : flatten(Array.isArray(token.content) ? token.content : [token.content], color);
    });
  return flatten(Prism.tokenize(text, grammar));
}
export function documentLines(answer: PublishedAnswer): DocumentLine[] {
  PublishedAnswerSchema.parse(answer);
  let language = '',
    code = false;
  return answerMarkdown(answer)
    .split(/\r?\n/)
    .flatMap((line): DocumentLine[] => {
      const fence = /^\s*\x60{3}([\w-]*)/.exec(line);
      if (fence) {
        code = !code;
        language = fence[1] ?? '';
        return [];
      }
      if (code) return [{ kind: 'code', spans: codeSpans(line.replace(/\t/g, '  '), language) }];
      const heading = /^#{1,6}\s+/.test(line);
      return [
        {
          kind: heading ? 'heading' : 'body',
          spans: [{ text: plain(line.replace(/^#{1,6}\s+/, '')), color: heading ? '074D9B' : '172D43' }],
        },
      ];
    });
}
const zipText = (text: string) => new Uint8Array(strToU8(text));
export function makeDocx(answer: PublishedAnswer): Uint8Array {
  const paragraphs = documentLines(answer)
    .map(
      (line) =>
        '<w:p><w:pPr><w:spacing w:after="100"/></w:pPr>' +
        line.spans
          .map(
            (span) =>
              '<w:r><w:rPr><w:color w:val="' +
              span.color +
              '"/><w:rFonts w:ascii="' +
              (line.kind === 'code' ? 'Courier New' : 'Calibri') +
              '" w:hAnsi="' +
              (line.kind === 'code' ? 'Courier New' : 'Calibri') +
              '"/><w:sz w:val="' +
              (line.kind === 'heading' ? '30' : line.kind === 'code' ? '18' : '22') +
              '"/>' +
              (line.kind === 'heading' ? '<w:b/>' : '') +
              '</w:rPr><w:t xml:space="preserve">' +
              xml(span.text) +
              '</w:t></w:r>',
          )
          .join('') +
        '</w:p>',
    )
    .join('');
  return zipSync({
    '[Content_Types].xml': zipText(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': zipText(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': zipText(
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        paragraphs +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr></w:body></w:document>',
    ),
  });
}
const bytesFromDataUrl = (url: string) => Uint8Array.from(atob(url.split(',')[1]!), (char) => char.charCodeAt(0));
function concat(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
/** Image-page PDF. Byte offsets remain correct; Unicode is rendered rather than mis-encoded in a core font. */
export function pdfFromJpegs(images: Uint8Array[]): Uint8Array {
  if (!images.length || images.length > 100) throw new Error('Invalid PDF page count.');
  const objects: Uint8Array[] = [
    strToU8('<< /Type /Catalog /Pages 2 0 R >>'),
    strToU8('<< /Type /Pages /Count ' + images.length + ' /Kids [' + images.map((_, i) => 3 + i * 3 + ' 0 R').join(' ') + '] >>'),
  ];
  images.forEach((image, i) => {
    const imageId = 4 + i * 3,
      contentId = 5 + i * 3;
    objects.push(
      strToU8(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ' +
          imageId +
          ' 0 R >> >> /Contents ' +
          contentId +
          ' 0 R >>',
      ),
    );
    objects.push(
      concat([
        strToU8(
          '<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
            image.length +
            ' >>\nstream\n',
        ),
        image,
        strToU8('\nendstream'),
      ]),
    );
    const commands = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
    objects.push(strToU8('<< /Length ' + commands.length + ' >>\nstream\n' + commands + '\nendstream'));
  });
  const parts = [strToU8('%PDF-1.4\n% Mastra selected-answer raster document\n')],
    offsets = [0];
  let length = parts[0]!.length;
  objects.forEach((object, i) => {
    offsets.push(length);
    const part = concat([strToU8(i + 1 + ' 0 obj\n'), object, strToU8('\nendobj\n')]);
    parts.push(part);
    length += part.length;
  });
  parts.push(
    strToU8(
      'xref\n0 ' +
        (objects.length + 1) +
        '\n0000000000 65535 f \n' +
        offsets
          .slice(1)
          .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
          .join('') +
        'trailer\n<< /Size ' +
        (objects.length + 1) +
        ' /Root 1 0 R >>\nstartxref\n' +
        length +
        '\n%%EOF\n',
    ),
  );
  return concat(parts);
}
export async function makePdf(answer: PublishedAnswer, signal?: AbortSignal): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = 1240;
  canvas.height = 1754;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PDF rendering needs browser canvas.');
  const pages: Uint8Array[] = [];
  let y = 85;
  const clear = () => {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1240, 1754);
  };
  const finish = () => {
    context.fillStyle = '#405873';
    context.font = '16px sans-serif';
    context.fillText('Mastra Learning | ' + answer.id + ' | page ' + (pages.length + 1), 80, 1710, 1080);
    pages.push(bytesFromDataUrl(canvas.toDataURL('image/jpeg', 0.94)));
    clear();
    y = 85;
  };
  clear();
  for (const line of documentLines(answer)) {
    signal?.throwIfAborted();
    let x = 80;
    const size = line.kind === 'heading' ? 29 : line.kind === 'code' ? 20 : 23;
    const font = (line.kind === 'heading' ? 'bold ' : '') + size + 'px ' + (line.kind === 'code' ? 'monospace' : 'sans-serif');
    const step = size + 12;
    const next = () => {
      y += step;
      x = 80;
      if (y > 1630) {
        finish();
        context.font = font;
      }
    };
    if (y > 1630 - step) finish();
    context.font = font;
    for (const span of line.spans) {
      context.fillStyle = '#' + span.color;
      for (const word of span.text.split(/(\s+)/).filter(Boolean)) {
        const width = context.measureText(word).width;
        if (x > 80 && x + width > 1160) {
          next();
          context.fillStyle = '#' + span.color;
        }
        if (x === 80 && line.kind !== 'code' && /^\s+$/.test(word)) continue;
        if (width <= 1080) {
          context.fillText(word, x, y);
          x += width;
        } else
          for (const char of word) {
            const charWidth = context.measureText(char).width;
            if (x + charWidth > 1160) {
              next();
              context.fillStyle = '#' + span.color;
            }
            context.fillText(char, x, y);
            x += charWidth;
          }
      }
    }
    next();
    if (pages.length > 95) throw new Error('Document exceeds the safe page bound.');
  }
  finish();
  await Promise.resolve();
  signal?.throwIfAborted();
  return pdfFromJpegs(pages);
}
export interface ImageStyle {
  image: string;
  accent: string;
}
export async function readImageStyle(file: File): Promise<ImageStyle> {
  if (file.size < 24) throw new Error('Choose a complete PNG reference.');
  if (file.size > 2 * 1024 * 1024) throw new Error('Reference PNG must be at most 2 MB.');
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (file.type !== 'image/png' || signature.join(',') !== '137,80,78,71,13,10,26,10')
    throw new Error('Choose a valid PNG reference.');
  const header = new DataView(await file.slice(16, 24).arrayBuffer());
  const width = header.getUint32(0),
    height = header.getUint32(4);
  if (!width || !height || width > 4096 || height > 4096 || width * height > 16000000)
    throw new Error('Reference dimensions must be at most 4096 px and 16 megapixels.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image styling needs canvas.');
    context.drawImage(bitmap, 0, 0, 320, 180);
    const pixels = context.getImageData(0, 0, 320, 180).data;
    const palette = new Map<string, number>();
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i]!,
        g = pixels[i + 1]!,
        b = pixels[i + 2]!;
      if (pixels[i + 3]! < 160 || Math.max(r, g, b) - Math.min(r, g, b) < 35) continue;
      const color =
        '#' +
        [r, g, b]
          .map((n) => Math.round(n / 32) * 32)
          .map((n) => Math.min(255, n).toString(16).padStart(2, '0'))
          .join('');
      palette.set(color, (palette.get(color) ?? 0) + 1);
    }
    return { image: canvas.toDataURL('image/png'), accent: [...palette].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#087cff' };
  } finally {
    bitmap.close();
  }
}
function wrapped(text: string, limit: number, maxLines: number) {
  const words = text.trim().split(/\s+/),
    lines: string[] = [];
  let line = '';
  for (const word of words) {
    for (let start = 0; start < word.length; start += limit) {
      const part = word.slice(start, start + limit);
      if (line.length + part.length + 1 > limit && line) {
        lines.push(line);
        line = '';
      }
      line += (line ? ' ' : '') + part;
    }
  }
  if (line) lines.push(line);
  const cut = lines.length > maxLines;
  return lines.slice(0, maxLines).map((value, i) => (cut && i === maxLines - 1 ? value.slice(0, -3) + '...' : value));
}
export function makeInfographic(answer: PublishedAnswer, style?: ImageStyle): string {
  PublishedAnswerSchema.parse(answer);
  if (style && (!/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(style.image) || style.image.length > 500000)) style = undefined;
  const wrapCode = (lines: DocumentLine[]) => {
    const rows: Span[][] = [];
    for (const line of lines.filter((item) => item.kind === 'code')) {
      let row: Span[] = [],
        length = 0;
      for (const span of line.spans)
        for (const char of span.text) {
          if (length >= 60) {
            rows.push(row);
            row = [];
            length = 0;
          }
          const last = row.at(-1);
          if (last?.color === span.color) last.text += char;
          else row.push({ text: char, color: span.color });
          length++;
        }
      rows.push(row);
    }
    return rows.slice(0, 14);
  };
  const lines = documentLines(answer);
  const body = lines
    .filter((l) => l.kind === 'body' && l.spans.some((s) => s.text.trim()))
    .map((l) => l.spans.map((s) => s.text).join(''))
    .slice(2)
    .join(' ');
  const excerpt = wrapped(body, 51, 12);
  const code = wrapCode(lines);
  const accent = style && /^#[a-f0-9]{6}$/i.test(style.accent) ? style.accent : '#087cff';
  const codeContent = code.length
    ? code
        .map(
          (line, i) =>
            '<text x="845" y="' +
            (380 + i * 24) +
            '" font-size="17" font-family="monospace" xml:space="preserve">' +
            line.map((s) => '<tspan fill="#' + s.color + '">' + xml(s.text) + '</tspan>').join('') +
            '</text>',
        )
        .join('')
    : '<text x="845" y="410" fill="#19344d" font-size="24">Read the linked Source tab.</text><text x="845" y="455" fill="#19344d" font-size="22">No code was present in this answer.</text>';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900" role="img" aria-labelledby="title desc"><title id="title">' +
    xml(answer.topic) +
    '</title><desc id="desc">Selected Mastra answer infographic excerpt. ' +
    xml(provenance(answer)) +
    '</desc><metadata>' +
    xml(
      JSON.stringify({
        answerId: answer.id,
        labId: answer.labId,
        mode: answer.mode,
        modelId: answer.modelId,
        at: answer.at,
        excerpt: true,
      }),
    ) +
    '</metadata><rect width="1600" height="900" fill="#ffffff"/><circle cx="1510" cy="60" r="240" fill="#eaf7ff"/><text x="60" y="58" fill="' +
    accent +
    '" font-family="sans-serif" font-size="25" font-weight="700" letter-spacing="4">MASTRA AI AGENTS · LEARN AND BUILD</text>' +
    wrapped(answer.topic, 43, 2)
      .map(
        (line, i) =>
          '<text x="60" y="' +
          (125 + i * 58) +
          '" fill="#101b46" font-family="sans-serif" font-size="46" font-weight="700">' +
          xml(line) +
          '</text>',
      )
      .join('') +
    (style
      ? '<image href="' + xml(style.image) + '" x="1280" y="50" width="250" height="140" preserveAspectRatio="xMidYMid meet"/>'
      : '<rect x="1340" y="65" width="180" height="115" rx="28" fill="#00cbb2"/><text x="1390" y="138" fill="white" font-size="42" font-family="monospace">&lt;/&gt;</text>') +
    '<rect x="50" y="240" width="730" height="510" rx="28" fill="#eafff5"/><rect x="810" y="240" width="740" height="510" rx="28" fill="#eef6ff"/><text x="85" y="300" fill="#101b46" font-size="30" font-weight="700" font-family="sans-serif">Understand the concept</text>' +
    excerpt
      .map(
        (line, i) =>
          '<text x="85" y="' +
          (350 + i * 29) +
          '" fill="#19344d" font-size="23" font-family="sans-serif">' +
          xml(line) +
          '</text>',
      )
      .join('') +
    '<text x="845" y="300" fill="#101b46" font-size="30" font-weight="700" font-family="sans-serif">Teaching code · bounded excerpt</text><rect x="830" y="340" width="700" height="390" rx="18" fill="#ffffff"/>' +
    codeContent +
    '<rect x="50" y="775" width="1500" height="70" rx="20" fill="#f1edff"/><text x="80" y="819" fill="#24375d" font-family="sans-serif" font-size="23">Read → Inspect source → Run offline → Review evidence</text><text x="60" y="875" fill="#405873" font-family="sans-serif" font-size="16">' +
    xml(
      (answer.mode === 'offline' ? 'Offline authored guidance' : 'Live ' + answer.modelId) +
        ' | ' +
        answer.labId +
        ' | ' +
        answer.id +
        ' | Excerpt: complete answer in Word/PDF',
    ) +
    '</text></svg>'
  );
}
export async function infographicPng(svg: string): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Infographic image could not render.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 900;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG export needs canvas.');
    context.drawImage(image, 0, 0);
    return bytesFromDataUrl(canvas.toDataURL('image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
