# Design

## Context

Empty repository on Windows 11 with Node 24.14 LTS. Current registry versions: @mastra/core 1.78.0 (engines `node >=22.13.0`, peer `zod ^3.25 || ^4`), OpenSpec 1.14.2. typescript-eslint 8.71 supports TypeScript `<6.1`, so TypeScript is pinned to 6.0.3 (not 7.x).

## Goals / Non-Goals

**Goals:** one-command dev, strict TS, secrets server-only, CI parity with local `npm run verify`.

**Non-Goals:** lab engine and SSE (F02), design system (F03), lesson workspace (F04).

## Decisions

- **npm workspaces, no Turborepo/Nx.** Requested stack; small enough that a task runner adds little.
- **Internal packages as TS source.** `exports` point at `src/index.ts`; Vite and tsx compile on the fly; the API is bundled with tsup (`noExternal: [/^@mlp\//]`) for `npm start`. Alternative (per-package `tsc` builds) adds build ordering and stale-dist bugs.
- **Package scope `@mlp/*`** (mastra-learning-platform) to avoid colliding with real `@mastra/*` packages.
- **Express 5** (native async error propagation), **Zod 4** shared by web/API.
- **Tailwind v4 via `@tailwindcss/vite`.**
- **Vitest projects** configured at root so `npm test` runs all workspaces; Playwright at root (`e2e/`), starting both servers via `webServer`.
- **Config validation** in `apps/api/src/config.ts` with Zod; `maskSecret()` lives in contracts so logs and diagnostics share it.
- **Secret guard**: `scripts/check-bundle-secrets.mjs` scans `apps/web/dist` for secret env key names (`*_API_KEY`, `*_SECRET`, `*_TOKEN`) and for actual secret values present in the environment/.env.
- **Vite env prefix** restricted to `VITE_PUBLIC_` so accidental `VITE_` secrets are never exposed.
- **@mastra/core installed now** in `packages/mastra-runtime` only; health reports its installed version read from its package.json, proving the server resolves it.

## Risks / Trade-offs

- [OpenSpec pulls `braces` with an unpatched advisory] → dev-only dependency, never shipped; tracked in docs/COMPATIBILITY.md.
- [Very new majors (Vite 8, Vitest 5, ESLint 10)] → pinned exact; CI catches drift.
- [Windows path with spaces and dots] → scripts are Node-based, not shell globbing.

## Migration Plan

N/A (greenfield). Rollback = revert commit.
