import { Worker } from 'node:worker_threads';

export interface TypecheckResult {
  ok: boolean;
  diagnostics: { file: string; line: number; message: string }[];
  durationMs: number;
}

// Plain JS evaluated in a worker so the compiler never blocks the API event loop and can be
// terminated on cancel. Works the same under tsx, Vitest and the bundled API.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { createRequire } = require('node:module');
const path = require('node:path');
const req = createRequire(workerData.resolveFrom);
const ts = req('typescript');
const started = Date.now();
const configPath = path.join(workerData.projectDir, 'tsconfig.json');
const read = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(read.config || {}, ts.sys, workerData.projectDir);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const all = [...(read.error ? [read.error] : []), ...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
const diagnostics = all.slice(0, 50).map((d) => {
  const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : { line: 0 };
  return {
    file: d.file ? path.relative(workerData.projectDir, d.file.fileName).split(path.sep).join('/') : 'tsconfig.json',
    line: pos.line + 1,
    message: ts.flattenDiagnosticMessageText(d.messageText, '\\n'),
  };
});
parentPort.postMessage({ ok: all.length === 0, diagnostics, durationMs: Date.now() - started });
`;

// The compiler is CPU- and memory-heavy: run one build at a time, queueing the rest.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Typechecks a generated project with the TypeScript compiler API in a worker thread.
 * `resolveFrom` is a file path whose node_modules provide `typescript`.
 */
export function typecheckProject(projectDir: string, resolveFrom: string, signal: AbortSignal): Promise<TypecheckResult> {
  const job = queue.then(() => runWorker(projectDir, resolveFrom, signal));
  queue = job.catch(() => undefined);
  return job;
}

function runWorker(projectDir: string, resolveFrom: string, signal: AbortSignal): Promise<TypecheckResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { projectDir, resolveFrom } });
    const onAbort = () => {
      void worker.terminate();
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    worker.once('message', (m: TypecheckResult) => {
      signal.removeEventListener('abort', onAbort);
      void worker.terminate();
      resolve(m);
    });
    worker.once('error', (err) => {
      signal.removeEventListener('abort', onAbort);
      reject(err);
    });
  });
}
