# Mastra Learning Platform

Interactive learning platform for the **Mastra AI Agents 2026** Udemy course: a React web app, an Express API that runs Mastra server-side, and 75 hands-on labs (delivered incrementally, see the catalog).

| Workspace | What it is |
| --- | --- |
| `apps/web` | React + Vite + TypeScript + Tailwind UI (http://127.0.0.1:5173) |
| `apps/api` | Express API, the only process that touches Mastra or API keys (http://127.0.0.1:8787) |
| `packages/contracts` | Shared Zod schemas and types |
| `packages/lab-catalog` | Modules and labs registry |
| `packages/mastra-runtime` | Server-only Mastra adapters |

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
| `npm start` | Run the built API |
| `npm run lint` | ESLint, zero warnings |
| `npm run typecheck` | `tsc` in every workspace |
| `npm test` | Vitest unit + integration tests (offline, deterministic) |
| `npm run test:e2e` | Playwright desktop + mobile (first time: `npx playwright install chromium`) |
| `npm run check:bundle-secrets` | Fails if secret names/values appear in `apps/web/dist` |
| `npm run verify` | lint → typecheck → test → build → secret scan (what CI runs) |

## Offline vs live mode

- `MASTRA_MODE=offline` (default): labs use deterministic mock models, no network, zero cost. All automated tests use this.
- `MASTRA_MODE=live`: labs may call real providers **if** you set a provider key in `.env` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`). Live calls are billed by the provider. A ChatGPT or Claude.ai subscription does **not** include API access; create an API key in the provider console.

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
| `POST /api/labs/:labId/runs` | Start a run: `{ input, mode: "offline" \| "live", timeoutMs? }` → `202 { runId, correlationId, requestId }` |
| `GET /api/runs/:runId` | Run snapshot |
| `GET /api/runs/:runId/events` | Server-Sent Events (`log`, `token`, `tool-start`, `tool-finish`, `workflow-step`, `result`, `error`, `complete`); supports `Last-Event-ID` |
| `POST /api/runs/:runId/cancel` | Cancel a run |

Try it from PowerShell:

```powershell
$run = Invoke-RestMethod -Method Post -ContentType 'application/json' `
  -Uri http://127.0.0.1:8787/api/labs/lab-00/runs `
  -Body '{"input":{"message":"Hello Mastra","delayMs":100}}'
curl.exe -N "http://127.0.0.1:8787/api/runs/$($run.runId)/events"
```

Limits (env): `MAX_CONCURRENT_RUNS` (4), `RUN_MAX_TIMEOUT_MS` (120000), `SSE_DISCONNECT_GRACE_MS` (5000) — a run whose last viewer disconnects is cancelled after the grace period.

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
