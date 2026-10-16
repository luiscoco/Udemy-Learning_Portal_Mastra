# Tasks

## 1. Workspace setup

- [x] 1.1 Root package.json with workspaces, scripts, `.npmrc` save-exact, `.nvmrc`, `.gitignore` — verify `npm ci` succeeds
- [x] 1.2 Install and initialize OpenSpec (claude, codex, github-copilot); document command variants in AGENTS.md — verify `npx openspec --version`

## 2. Packages

- [x] 2.1 `packages/contracts` with health schema, ApiError shape and `maskSecret` + unit tests — verify `npm test`
- [x] 2.2 `packages/lab-catalog` with 15-module skeleton and Dummy Lab 00 + catalog validation tests
- [x] 2.3 `packages/mastra-runtime` exposing installed Mastra version detection (server-only) + test

## 3. API

- [x] 3.1 Zod config validation with masked diagnostics + tests for invalid PORT and masking
- [x] 3.2 Express app with `GET /api/health`, JSON 404, error handler + supertest integration tests
- [x] 3.3 tsup production build and `npm start` — verify `npm run build` then health responds

## 4. Web

- [x] 4.1 React + Vite + Tailwind app showing catalog and API health; `/api` dev proxy; `VITE_PUBLIC_` env prefix — verify build
- [x] 4.2 Component test for health display

## 5. Quality and docs

- [x] 5.1 ESLint flat config, strict tsconfig base, typecheck across workspaces — verify `npm run lint` and `npm run typecheck`
- [x] 5.2 Bundle-secret check script — verify fails on planted secret and passes on clean build
- [x] 5.3 Playwright smoke test: web loads and shows API health — verify `npm run test:e2e`
- [x] 5.4 README (Windows PowerShell), `.env.example`, docs/COMPATIBILITY.md, GitHub Actions CI

## Workflow follow-up

- Archive with `npx openspec archive f01-monorepo-foundation -y` and commit.
