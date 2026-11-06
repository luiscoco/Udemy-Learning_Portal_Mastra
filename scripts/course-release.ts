import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { catalog } from '../packages/lab-catalog/src/index.js';

export const ARCHIVE_ROOT = 'mastra-learning-platform/';
const ROOT_FILES = new Set([
  'package.json',
  'package-lock.json',
  'README.md',
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
  'AGENTS.md',
  'CLAUDE.md',
  'Dockerfile',
  'compose.yaml',
  'eslint.config.js',
  'playwright.config.ts',
  'vitest.config.ts',
  'tsconfig.json',
  'tsconfig.tools.json',
  'tsconfig.base.json',
  '.env.example',
  '.gitignore',
  '.gitattributes',
  '.dockerignore',
  '.npmrc',
  '.nvmrc',
  '.prettierignore',
  '.prettierrc.json',
]);
const EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yaml',
  '.yml',
  '.html',
  '.css',
  '.svg',
  '.txt',
  '.sql',
  '.sh',
]);
const PRIVATE_PARTS = new Set([
  'node_modules',
  'dist',
  'coverage',
  'secrets',
  '.data',
  '.git',
  '.auth',
  '.mastra',
  '.vite',
  '.vscode',
  '.codex',
  '.agents',
  '.aws',
  'test-results',
  'playwright-report',
]);
const PREFIXES = [
  'apps/',
  'packages/',
  'examples/',
  'scripts/',
  'docs/',
  'course-prompts/',
  'openspec/',
  'e2e/',
  '.github/workflows/',
  'regression/',
];
const BUDGET = { files: 5000, fileBytes: 4 * 1024 * 1024, totalBytes: 512 * 1024 * 1024 };
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export function includeCoursePath(path: string): boolean {
  if (!path || path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:/.test(path))
    throw new Error('Unsafe archive path');
  const parts = path.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..')) throw new Error('Unsafe archive path');
  if (parts.some((p) => PRIVATE_PARTS.has(p) || (p.startsWith('.env') && p !== '.env.example'))) return false;
  if (ROOT_FILES.has(path)) return true;
  if (!PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  if (path.startsWith('regression/evidence/') || path === 'regression/REPORT.md') return false;
  if (/^docs\/.*-IMPLEMENTATION\.md$/.test(path)) return false;
  if (/^apps\/web\/public\/audio\/tours\/[a-f0-9]{64}\.mp3$/.test(path)) return true;
  return EXTENSIONS.has(extname(path)) || ['.env.example', '.gitignore', 'Dockerfile'].includes(parts.at(-1)!);
}

export function courseMap() {
  if (catalog.labs.length !== 76 || catalog.labs.some((lab) => lab.status !== 'available'))
    throw new Error('Course catalog is incomplete');
  return catalog.labs.map((lab) => ({
    id: lab.id,
    title: lab.title,
    moduleId: lab.moduleId,
    module: catalog.modules.find((module) => module.id === lab.moduleId)!.title,
    orientation: lab.number === 0,
    prerequisites: lab.prerequisites,
    route: `/labs/${lab.id}`,
    legacyRoute: `/?lesson=${lab.id}`,
    learn: `/labs/${lab.id}?tab=learn`,
    run: `/labs/${lab.id}?tab=run`,
    source: `/labs/${lab.id}?tab=source`,
    infographic: `/labs/${lab.id}?tab=infographic`,
    walkthrough: `/labs/${lab.id}?tab=walkthrough`,
    referenceFolder: `packages/labs/src/${lab.id}/`,
  }));
}

export function buildCourseArchive(
  root: string,
  candidates: readonly string[],
  provenance: { revision: string; dirty: boolean },
) {
  const files: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  const selected = [...new Set(candidates)].filter(includeCoursePath).sort();
  if (selected.length > BUDGET.files) throw new Error('Course file-count budget exceeded');
  let totalBytes = 0;
  for (const path of selected) {
    let current = resolve(root);
    for (const part of path.split('/')) {
      current = join(current, part);
      if (lstatSync(current).isSymbolicLink()) throw new Error(`Symbolic course path refused: ${path}`);
    }
    const stat = lstatSync(current);
    if (!stat.isFile() || stat.size > BUDGET.fileBytes) throw new Error(`Invalid or oversized course file: ${path}`);
    totalBytes += stat.size;
    if (totalBytes > BUDGET.totalBytes) throw new Error('Course byte budget exceeded');
    const content = readFileSync(current);
    const tourHash = /^apps\/web\/public\/audio\/tours\/([a-f0-9]{64})\.mp3$/.exec(path)?.[1];
    if (tourHash && digest(content) !== tourHash) throw new Error(`Tour audio filename hash mismatch: ${path}`);
    if (
      path.endsWith('.env.example') &&
      /^[ \t]*[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*[ \t]*=[ \t]*\S+/m.test(content.toString('utf8'))
    )
      throw new Error(`Secret assignment refused in example: ${path}`);
    if (path === '.npmrc' && /(?:_authToken|_auth|password)[ \t]*=[ \t]*\S+/i.test(content.toString('utf8')))
      throw new Error('Private npm credentials refused');
    files[path] = new Uint8Array(content);
  }
  for (const required of ['package.json', 'package-lock.json', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'docs/STUDENT-GUIDE.md'])
    if (!files[required]) throw new Error(`Required course file missing: ${required}`);
  for (const lab of courseMap())
    if (!Object.keys(files).some((path) => path.startsWith(lab.referenceFolder)))
      throw new Error(`Lab references missing: ${lab.id}`);
  const version = (JSON.parse(new TextDecoder().decode(files['package.json'])) as { version: string }).version;
  if (typeof version !== 'string' || version.length > 100 || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error('Invalid course version');
  files['COURSE-MAP.json'] = strToU8(JSON.stringify(courseMap(), null, 2) + '\n');
  const entries = Object.keys(files)
    .sort()
    .map((path) => ({ path, bytes: files[path]!.byteLength, sha256: digest(files[path]!) }));
  const manifest = {
    format: 1,
    version,
    license: 'MIT',
    sourceRevision: provenance.revision,
    sourceDirty: provenance.dirty,
    sourceTreeSha256: digest(strToU8(JSON.stringify(entries))),
    labs: 75,
    orientationLabs: 1,
    files: entries,
  };
  files['COURSE-MANIFEST.json'] = strToU8(JSON.stringify(manifest, null, 2) + '\n');
  const zipped: Zippable = Object.create(null) as Zippable;
  for (const path of Object.keys(files).sort())
    zipped[ARCHIVE_ROOT + path] = path.endsWith('.mp3') ? [files[path]!, { level: 0 }] : files[path]!;
  const bytes = zipSync(zipped, { level: 6, mtime: new Date(1980, 0, 1) });
  const unpacked = unzipSync(bytes);
  for (const entry of entries)
    if (digest(unpacked[ARCHIVE_ROOT + entry.path]!) !== entry.sha256) throw new Error('Archive verification failed');
  return { bytes, sha256: digest(bytes), manifest };
}

export function releaseCourse(root = resolve(import.meta.dirname, '..')) {
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const candidates = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  const artifact = buildCourseArchive(root, candidates, {
    revision: git(['rev-parse', 'HEAD']).trim(),
    dirty: git(['status', '--porcelain']).trim().length > 0,
  });
  const output = resolve(root, '.data', 'course-release');
  mkdirSync(output, { recursive: true });
  const destination = join(output, `mastra-learning-platform-${artifact.manifest.version}.zip`);
  const temporary = join(dirname(destination), `${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, artifact.bytes, { flag: 'wx' });
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
  writeFileSync(destination + '.sha256', `${artifact.sha256}  ${destination.split(sep).at(-1)}\n`);
  return { destination, sha256: artifact.sha256, files: artifact.manifest.files.length, dirty: artifact.manifest.sourceDirty };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(releaseCourse(), null, 2));
  } catch (err) {
    console.error(`[course-release] ${err instanceof Error ? err.message : 'Packaging failed'}`);
    process.exitCode = 1;
  }
}
