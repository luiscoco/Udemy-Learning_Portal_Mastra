# Design

## Decisions

- **Inspect the real platform repo** (this monorepo) because it is a complete Mastra application: `apps/web` (UI), `apps/api` (HTTP), `packages/mastra-runtime` (server-only Mastra adapters) and the reference Mastra project entry from Lab 01 (`packages/labs/src/lab-01/template/src/mastra/index.ts`).
- **Enumerated inputs** (selects of candidate directories/files) instead of free text, so path traversal is impossible by construction; the server still resolves under the repo root and re-checks.
- **Evidence rules** per layer are data (`LAYER_RULES`), each rule a file + predicate; an "inspectFile" `tool-start`/`tool-finish` pair is emitted per file so learners see the inspection trace.
- **Repo root** = `labsPackageDir()/../..`.
- `.env`: only `existsSync` and `.gitignore` lines are checked.

## Risks / Trade-offs

- [Repo restructuring changes evidence] → the lab's fixtures run in CI; a move breaks tests immediately.
