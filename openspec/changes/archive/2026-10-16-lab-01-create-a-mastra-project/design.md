# Design

## Context

The official bootstrap is `npm create mastra@latest`, which produces `src/mastra/index.ts` exporting a `Mastra` instance, an agents folder, ESM `package.json` scripts using the `mastra` CLI and a `.env` for provider keys. Running `npm create` or `npm install` per learner run is slow, needs network and would execute third-party scripts, so the lab renders the same structure from a pinned template instead and proves it builds with the compiler.

## Decisions

- **Template as real files** in `packages/labs/src/lab-01/template/`. Its `.ts` files are covered by the repo typecheck, so the template can never rot. Tokens are valid TypeScript (`assistantAgent`, `'assistant-agent'`, `'openai/gpt-5-mini'`) replaced by the renderer.
- **Real build**: `ts.createProgram` + `getPreEmitDiagnostics` with the template's tsconfig options. Output folder is `<repo>/.data/scaffolds/<runId>/<name>` so module resolution finds the workspace's real `@mastra/core` types. Measured ≈5 s.
- **Worker thread** (`new Worker(code, { eval: true })`) runs the compiler so the API event loop stays responsive; `worker.terminate()` on abort gives real cancellation. Eval'd JS avoids loader differences between tsx, Vitest and the tsup bundle.
- **Model id** per provider from `DEFAULT_MODEL_BY_PROVIDER`, validated with `checkModelId` against the installed Mastra registry.
- **Cleanup** in `finally` (`rm -r`), so cancellation and failures never leave files.
- Offline only (no model call); `typescript@6.0.3` added as a dependency of `@mlp/labs`.

## Risks / Trade-offs

- [Not a byte-for-byte `create mastra` output] → Learn tab shows the official command and explains the equivalence; Lab 05 runs a real `mastra dev`.
- [Compiler is CPU-heavy] → worker thread, concurrency cap from the engine, 60 s deadline.
