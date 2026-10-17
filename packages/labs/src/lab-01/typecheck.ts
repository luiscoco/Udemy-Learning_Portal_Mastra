import { spawn } from 'node:child_process';

export interface TypecheckResult {
  ok: boolean;
  diagnostics: { file: string; line: number; message: string }[];
  durationMs: number;
}

// Plain JS run in a separate Node process: the compiler's large heap and GC pauses never affect the
// API process, and killing the child gives real cancellation. Works the same under tsx, Vitest and
// the bundled API. Input arrives via env, the result is printed as one JSON line on stdout.
const CHILD_SOURCE = `
const { createRequire } = require('node:module');
const path = require('node:path');
const projectDir = process.env.MLP_TC_PROJECT;
const req = createRequire(process.env.MLP_TC_RESOLVE_FROM);
const ts = req('typescript');
const started = Date.now();
const configPath = path.join(projectDir, 'tsconfig.json');
const read = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(read.config || {}, ts.sys, projectDir);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const all = [...(read.error ? [read.error] : []), ...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
const diagnostics = all.slice(0, 50).map((d) => {
  const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : { line: 0 };
  return {
    file: d.file ? path.relative(projectDir, d.file.fileName).split(path.sep).join('/') : 'tsconfig.json',
    line: pos.line + 1,
    message: ts.flattenDiagnosticMessageText(d.messageText, '\\n'),
  };
});
process.stdout.write(JSON.stringify({ ok: all.length === 0, diagnostics, durationMs: Date.now() - started }) + '\\n');
`;

// The compiler is CPU- and memory-heavy: run one build at a time, queueing the rest.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Typechecks a generated project with the TypeScript compiler API in a child Node process.
 * `resolveFrom` is a file path whose node_modules provide `typescript`.
 */
export function typecheckProject(projectDir: string, resolveFrom: string, signal: AbortSignal): Promise<TypecheckResult> {
  const job = queue.then(() => runChild(projectDir, resolveFrom, signal));
  queue = job.catch(() => undefined);
  return job;
}

function runChild(projectDir: string, resolveFrom: string, signal: AbortSignal): Promise<TypecheckResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    // Minimal environment: the child never sees provider keys or other server secrets.
    const child = spawn(process.execPath, ['-e', CHILD_SOURCE], {
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
        MLP_TC_PROJECT: projectDir,
        MLP_TC_RESOLVE_FROM: resolveFrom,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    const onAbort = () => {
      child.kill();
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    child.once('error', (e) => {
      signal.removeEventListener('abort', onAbort);
      reject(e);
    });
    child.once('close', (code) => {
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) return;
      const line = out.trim().split('\n').pop() ?? '';
      try {
        resolve(JSON.parse(line) as TypecheckResult);
      } catch {
        reject(new Error(`TypeScript compiler process exited with code ${code}: ${err.slice(0, 300)}`));
      }
    });
  });
}
