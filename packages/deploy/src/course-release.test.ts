import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { ARCHIVE_ROOT, buildCourseArchive, courseMap, includeCoursePath } from '../../../scripts/course-release.js';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mlp-course-'));
  roots.push(root);
  const candidates: string[] = [];
  function write(path: string, content = 'fixture') {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
    candidates.push(path);
  }
  for (const path of ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'package-lock.json', 'docs/STUDENT-GUIDE.md']) write(path);
  write('package.json', JSON.stringify({ version: '0.1.0' }));
  for (const lab of courseMap()) write(lab.referenceFolder + 'definition.ts');
  return { root, candidates, write };
}
afterAll(() => {
  for (const root of roots) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.split(/[\\/]/).at(-1)!.startsWith('mlp-course-'))
      throw new Error('Refusing unexpected cleanup target');
    rmSync(root, { recursive: true, force: true });
  }
});
const provenance = { revision: 'a'.repeat(40), dirty: true };

it('creates a deterministic ZIP with complete lab mapping, hashes and no private data', () => {
  const f = fixture();
  f.write('.env', 'OPENAI_API_KEY=private-example');
  f.write('.data/private.json');
  f.write('secrets/signing.txt');
  f.write('packages/labs/.env.local');
  f.write('apps/web/dist/index.html');
  f.write('apps/api/src/server.ts');
  f.write('.env.example', 'OPENAI_API_KEY=\n# empty keys are safe\nAUTH_SESSION_SECRET=\n');
  const a = buildCourseArchive(f.root, f.candidates, provenance),
    b = buildCourseArchive(f.root, [...f.candidates].reverse(), provenance);
  expect(a.sha256).toBe(b.sha256);
  expect(a.bytes).toEqual(b.bytes);
  const files = unzipSync(a.bytes);
  for (const path of [
    '.env',
    '.data/private.json',
    'secrets/signing.txt',
    'packages/labs/.env.local',
    'apps/web/dist/index.html',
  ])
    expect(files[ARCHIVE_ROOT + path]).toBeUndefined();
  expect(new TextDecoder().decode(a.bytes)).not.toContain('private-example');
  expect(files[ARCHIVE_ROOT + '.env.example']).toBeDefined();
  const map = JSON.parse(new TextDecoder().decode(files[ARCHIVE_ROOT + 'COURSE-MAP.json']!)) as ReturnType<typeof courseMap>;
  expect(map).toHaveLength(76);
  expect(map.filter((l) => !l.orientation)).toHaveLength(75);
  expect(map.at(-1)?.route).toBe('/labs/lab-75');
  for (const item of a.manifest.files) {
    const bytes = files[ARCHIVE_ROOT + item.path]!;
    expect(bytes.byteLength).toBe(item.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256);
  }
});

it('rejects unsafe path syntax instead of normalizing traversal into an allowed path', () => {
  for (const path of [
    '../package.json',
    'apps/../.env',
    '/package.json',
    'C:/package.json',
    'apps\\private.ts',
    'apps//x.ts',
    'apps/./x.ts',
    'x\0.ts',
  ])
    expect(() => includeCoursePath(path)).toThrow('Unsafe archive path');
  expect(includeCoursePath('unexpected-root-file.txt')).toBe(false);
  expect(includeCoursePath('apps/api/src/private.pem')).toBe(false);
  expect(includeCoursePath('apps/web/public/audio/tours/' + 'a'.repeat(64) + '.mp3')).toBe(true);
  expect(includeCoursePath('apps/web/public/audio/tours/unreviewed.mp3')).toBe(false);
  expect(includeCoursePath('apps/api/private.mp3')).toBe(false);
});

it('refuses selected symbolic paths and oversized files without reading private targets', () => {
  const f = fixture(),
    outside = fixture();
  outside.write('outside.ts', 'private-target');
  mkdirSync(join(f.root, 'apps'), { recursive: true });
  symlinkSync(outside.root, join(f.root, 'apps', 'linked'), 'junction');
  expect(() => buildCourseArchive(f.root, [...f.candidates, 'apps/linked/outside.ts'], provenance)).toThrow('Symbolic');
  f.write('apps/large.ts', 'x'.repeat(4 * 1024 * 1024 + 1));
  expect(() => buildCourseArchive(f.root, f.candidates, provenance)).toThrow('oversized');
});

it('includes only correctly hash-named tour MP3 media in the student ZIP', () => {
  const f = fixture();
  const content = 'MP3 test fixture';
  const sha = createHash('sha256').update(content).digest('hex');
  const path = `apps/web/public/audio/tours/${sha}.mp3`;
  f.write(path, content);
  expect(unzipSync(buildCourseArchive(f.root, f.candidates, provenance).bytes)[ARCHIVE_ROOT + path]).toEqual(
    new TextEncoder().encode(content),
  );
  f.write('apps/web/public/audio/tours/' + 'a'.repeat(64) + '.mp3', 'wrong bytes');
  expect(() => buildCourseArchive(f.root, f.candidates, provenance)).toThrow('Tour audio filename hash mismatch');
});

it('refuses missing release prerequisites and missing lab references', () => {
  const f = fixture();
  expect(() =>
    buildCourseArchive(
      f.root,
      f.candidates.filter((p) => p !== 'LICENSE'),
      provenance,
    ),
  ).toThrow('LICENSE');
  expect(() =>
    buildCourseArchive(
      f.root,
      f.candidates.filter((p) => !p.startsWith('packages/labs/src/lab-75/')),
      provenance,
    ),
  ).toThrow('lab-75');
});

it('refuses credential assignments in shipped configuration examples', () => {
  const f = fixture();
  f.write('.npmrc', '//registry.npmjs.org/:_authToken=private-token');
  expect(() => buildCourseArchive(f.root, f.candidates, provenance)).toThrow('credentials');
  f.write('.npmrc', 'save-exact=true');
  f.write('.env.example', 'OPENAI_API_KEY=private-example');
  expect(() => buildCourseArchive(f.root, f.candidates, provenance)).toThrow('Secret assignment');
});
