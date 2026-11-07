import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { MILESTONE_PROJECTS } from '@mlp/lab-catalog';
import { starterFiles, starterZip } from './starters';
import { unzipSync } from 'fflate';

it('ships every cumulative prompt and runs all three starter offline checks against pinned Mastra types', () => {
  const paths: string[] = [];
  for (const project of MILESTONE_PROJECTS) {
    const root = fileURLToPath(new URL('../../../../../.data/milestone-starters/' + project.id + '/', import.meta.url));
    const files = starterFiles(project);
    expect(Object.keys(unzipSync(starterZip(project))).filter((p) => p.startsWith('prompts/'))).toHaveLength(
      project.stages.length,
    );
    for (const [name, content] of Object.entries(files)) {
      const target = resolve(root, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
      if (name.endsWith('.ts')) paths.push(target);
    }
    const output = execFileSync(process.execPath, ['--experimental-strip-types', '--test', 'src/coach.test.ts'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 20000,
    });
    expect(output).toContain('pass 3');
    expect(JSON.parse(files['package.json']!).dependencies['@mastra/core']).toBe('1.79.0');
  }
  const program = ts.createProgram(paths, {
    strict: true,
    types: ['node'],
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    allowImportingTsExtensions: true,
  });
  const errors = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  expect(errors).toEqual([]);
}, 90000);
