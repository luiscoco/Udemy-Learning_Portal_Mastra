# Tasks

## 1. Implementation

- [x] 1.1 Model id validation helpers in `@mlp/mastra-runtime` — verify `models.test.ts`
- [x] 1.2 Reference template files (typechecked by repo) — verify `npm run typecheck`
- [x] 1.3 Renderer (pure) + unit tests for substitutions and roles
- [x] 1.4 Worker-thread typecheck with abort — verify test that a broken file yields diagnostics
- [x] 1.5 Lab definition (concept, objectives, guide, hints, quiz, outline), run, checks, fixtures — verify conformance suite
- [x] 1.6 Catalog: mark lab-01 available — verify API consistency test

## 2. Verification

- [x] 2.1 Integration test: path traversal rejected, cancel removes folder
- [x] 2.2 Playwright happy path for lab-01
- [x] 2.3 `npm run verify` + `npm run test:e2e` green

## Workflow follow-up

- Archive with `npx openspec archive lab-01-create-a-mastra-project -y` and commit.
