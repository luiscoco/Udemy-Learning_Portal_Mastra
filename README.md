# Mastra Learning Platform

Interactive learning platform for the **Mastra AI Agents 2026** Udemy course: a React web app, an Express API that runs Mastra server-side, and 75 hands-on labs (delivered incrementally, see the catalog).

| Workspace | What it is |
| --- | --- |
| `apps/web` | React + Vite + TypeScript + Tailwind UI (http://127.0.0.1:5173) |
| `apps/api` | Express API, the only process that touches Mastra or API keys (http://127.0.0.1:8787) |
| `packages/contracts` | Shared Zod schemas and types |
| `packages/lab-catalog` | Modules and labs registry |
| `packages/mastra-runtime` | Server-only Mastra adapters |

> **Local, single-learner use only for now.** Before exposing the platform publicly (a public host or a shared network), complete [docs/RELEASE-GATES.md](docs/RELEASE-GATES.md). Run authorization comes first.

## Requirements

- Node.js **24 LTS** (minimum 22.13, required by `@mastra/core`)
- npm 10+
- Git

## Quick start (Windows PowerShell)

```powershell
# 1. Install exact locked dependencies
npm ci

# 2. Create your local config (offline mode works without any API key)
Copy-Item .env.example .env

# 3. Start API + web together
npm run dev
```

Open http://127.0.0.1:5173. The **Platform status** card shows `ok` when the API is reachable. Check the API directly:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/health
```

macOS/Linux: same commands, use `cp .env.example .env`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | API (tsx watch) + web (Vite) with `/api` proxy |
| `npm run build` | Bundle API (tsup) and web (Vite) |
| `npm start` | Run the built API (set `WEB_DIST_DIR=apps/web/dist` to also serve the web app on the same origin) |
| `npm run lint` | ESLint, zero warnings |
| `npm run typecheck` | `tsc` in every workspace |
| `npm test` | Vitest unit + integration tests (offline, deterministic) |
| `npm run test:e2e` | Playwright desktop + mobile against the production build (API serves the web app; first time: `npx playwright install chromium`) |
| `npm run test:live` | **Live, costs money:** Vitest runs live-capable labs and the HTTP/SSE API against real providers using keys in `.env` |
| `npm run test:e2e:live` | **Live, costs money:** Playwright runs labs in the browser with Live mode selected |
| `npm run check:bundle-secrets` | Fails if secret names/values appear in `apps/web/dist` |
| `npm run verify` | lint → typecheck → test → build → secret scan (what CI runs) |

## Mastra Studio (reference project)

`examples/course-project` is a real Mastra project (the Lab 01 template with default names). Start Studio with:

```powershell
npm run studio   # runs `mastra dev` → Studio at http://localhost:4111, API at http://localhost:4111/api
```

Open Studio in its own browser tab. Chatting with agents in Studio needs a provider key in `examples/course-project/.env` (copy its `.env.example`). Only one `mastra dev` may run per project; stop it with Ctrl+C.

## Offline vs live mode

- `MASTRA_MODE=offline` (default): labs use deterministic mock models, no network, zero cost. All automated tests use this.
- `MASTRA_MODE=live`: labs that support it may call real providers **if** their key is set in `.env` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`). Restart the API after changing `.env`, then pick **Live** in a lab's Run tab; the cost notice appears before you run. Models offered live come from `LIVE_MODELS` (validated against the installed Mastra registry). Live calls are billed by the provider. A ChatGPT or Claude.ai subscription does **not** include API access; create an API key in the provider console.
- Live tests never run in `npm test` or CI; run `npm run test:live` / `npm run test:e2e:live` explicitly.

Keys are read only by `apps/api`. The web bundle only receives variables prefixed `VITE_PUBLIC_`.

## API reference

All bodies are JSON validated with the Zod schemas in `packages/contracts`. Errors use `{ error: { code, message, retryable?, details?, requestId } }`.

| Method & path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness, mode, installed Mastra version |
| `GET /api/catalog` | Modules and lab index |
| `GET /api/labs` · `GET /api/labs/:labId` | Lab summaries · full `LabDefinition` |
| `GET /api/labs/:labId/source` | Readonly reference source + pinned versions |
| `GET /api/labs/:labId/preflight` | Environment checks for the lab |
| `POST /api/labs/:labId/runs` | Start a run: `{ input, mode: "offline" \| "live", timeoutMs? }` → `202 { runId, correlationId, requestId, runToken }` |
| `GET /api/runs/:runId` | Run snapshot |
| `GET /api/runs/:runId/events` | Server-Sent Events (`log`, `token`, `tool-start`, `tool-finish`, `workflow-step`, `approval-request`, `approval-resolved`, `result`, `error`, `complete`); supports `Last-Event-ID` |
| `POST /api/runs/:runId/cancel` | Cancel a run (header `X-Run-Token`; 403 without it) |
| `POST /api/runs/:runId/approvals/:approvalId` | Approve or decline a pending tool call: `{ "decision": "approve" \| "decline", "reason"? }` (header `X-Run-Token`; 403 wrong or missing token, 404 unknown run, 409 not pending) |

Try it from PowerShell:

```powershell
$run = Invoke-RestMethod -Method Post -ContentType 'application/json' `
  -Uri http://127.0.0.1:8787/api/labs/lab-00/runs `
  -Body '{"input":{"message":"Hello Mastra","delayMs":100}}'
curl.exe -N "http://127.0.0.1:8787/api/runs/$($run.runId)/events"
```

Limits (env): `MAX_CONCURRENT_RUNS` (4), `RUN_MAX_TIMEOUT_MS` (120000), `SSE_DISCONNECT_GRACE_MS` (5000) — a run whose last viewer disconnects is cancelled after the grace period; `APPROVAL_TIMEOUT_MS` (300000) — a run waiting for a human approval auto-declines after this (the run deadline is paused while waiting); `MAX_PENDING_APPROVALS` (20) — runs waiting for a human do not use a `MAX_CONCURRENT_RUNS` slot, but at most this many may wait at once (further approval requests are auto-declined).

Run token: `POST /api/labs/:labId/runs` returns a secret `runToken`. Cancelling a run or deciding its approvals requires it in the `X-Run-Token` header, so only the client that started a run can change it. Reading a run (snapshot, events) needs only the run id. The platform has no user accounts; the token protects each run, not each person.

## Learner experience

- `/` — Home, course progress, course map (15 modules, locked previews for unreleased labs).
- `/labs/lab-XX` (or legacy `/?lesson=lab-XX`) — lesson workspace with **Learn / Run / Source** tabs (`?tab=run`, `?tab=source`), quiz, self-check, notes and an instructor script with JSON export.
- Progress is stored in the browser (`localStorage`, key `mlp.progress.v1`) through the `ProgressStore` adapter in `apps/web/src/lib/progress-store.ts`. A lab is completed when the lesson is marked read, a run succeeds with all checks passing and the quiz is passed (≥ 70%).
- Keyboard: `/` focuses search, arrow keys move through the sidebar and tabs, `Esc` closes the mobile menu.

## Adding a lab

Each lab lives in `packages/labs/src/lab-XX/` (`definition.ts`, `run.ts`, `fixtures.ts`, optional `solution.md`), is appended to `allLabs` in `packages/labs/src/index.ts` and marked `available` in `packages/lab-catalog`. The conformance suite (`packages/labs/src/conformance.test.ts`) then enforces the pedagogical contract and runs every fixture offline.

## OpenSpec workflow

Every foundation milestone and lab is an OpenSpec change under `openspec/changes/`, archived into `openspec/specs/` when done. See [AGENTS.md](AGENTS.md) for assistant-specific command spelling (`/opsx:propose` in Claude Code, `$openspec-propose` in Codex, `/opsx-propose` in Copilot).

```powershell
npx openspec list            # in-flight changes
npx openspec list --specs    # current capabilities
npx openspec validate <change> --strict
```

## Troubleshooting (Windows)

- **Port in use**: change `PORT` in `.env` (and set `API_PROXY_TARGET=http://127.0.0.1:<port>` for the web dev server).
- **`npm ci` fails with EBADENGINE**: upgrade Node to 24 LTS (`winget install OpenJS.NodeJS.LTS`).
- **Playwright browser missing**: `npx playwright install chromium`.

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for pinned versions and known issues.
