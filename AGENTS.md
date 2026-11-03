# AGENTS.md — mastra-learning-platform

Persistent instructions for every coding assistant working in this repository.

## MASTER RULES

You are implementing a production-quality educational platform named **mastra-learning-platform** and a 75-lab Mastra TypeScript course.

- Never invent Mastra methods, exports, package names or model identifiers. First inspect installed versions (`node_modules/@mastra/*/package.json`, the `.d.ts` files) and the official version-matched docs (https://mastra.ai/docs, https://mastra.ai/reference). Use documented provider/model strings and do not assume ChatGPT subscriptions provide API access. Pin exact tested versions in the lockfile and note compatibility in `docs/COMPATIBILITY.md`.
- Keep Mastra and credentials on the server. The frontend calls our typed API and receives SSE events. Use accessible React/TypeScript UI; Express/Zod server validation; strict TypeScript, Vitest, Playwright and CI.
- One OpenSpec change per foundation prompt/lab: draft proposal/spec/design/tasks, show decisions, implement only approved scope, test, verify, archive. (The project owner has requested **automated approval**: draft, implement, verify, archive and report without stopping for plan review.)
- Preserve the existing foundation, module order and lab registry. Do not rewrite working labs, modify contracts without migration, expose private keys or claim features absent from the actual Mastra version. Use adapters when capabilities are ecosystem integrations rather than native framework APIs. Lab routes must remain stable: `/labs/lab-XX` and `?lesson=lab-XX` compatibility.
- Every lab must be pedagogically complete: concept, objectives, prerequisite checks, at least one meaningful input, Learn/Run/Source tabs, expected output, incremental execution/log/tool/workflow events where applicable, guided instructions, hints 1–3, common mistakes, challenge, short quiz (3–5 questions), safe readable reference source, automated objective checks, test fixtures, instructor video outline (3–7 minutes) and learner progress persisted. Follow the established `LabDefinition` contract.
- Provide a deterministic offline/mock mode for normal unit tests, and optional live provider mode with user-configured API keys and cost notices. Ensure server-side timeouts, cancellation, input limits, secrets masking and error handling. Never execute student-submitted arbitrary code inside the API process; future remote execution requires an isolated sandbox with network and resource restrictions.
- On finishing each change, report file paths, commands run, test results, demo steps, any model/provider costs, unsupported features and open issues. Do not mark work complete unless tests actually passed.

## Common lab delivery contract

Each `Lxx` change inherits all MASTER RULES. Implement it in the existing monorepo, not as a fresh standalone project. Register its unique ID and title in the shared catalog (`packages/lab-catalog`) under the correct module. Integrate Learn/Run/Source tabs, control panels and SSE events. Make the lab fully testable offline and optionally live. Keep each reference implementation under `packages/labs/src/lab-XX/`. Implement beginner-friendly docs, input/output JSON examples, validation and the instructor outline. Do not silently omit requested capabilities; if they are not native to the installed version, create an explicitly documented app-level implementation or feature detection.

## Repository map

| Path | Purpose |
| --- | --- |
| `apps/web` | React + Vite + TypeScript + Tailwind learner UI. Never imports Mastra or reads secrets. |
| `apps/api` | Express 5 API. Validates with Zod, runs labs, streams SSE. The only process holding credentials. |
| `packages/contracts` | Zod schemas + inferred types shared by web and API (no runtime deps besides zod). |
| `packages/lab-catalog` | Module list, lab metadata registry (titles, ordering, status). Browser-safe. |
| `packages/client` | Typed, browser-safe API SDK (L66): a method per API route, contract-validated responses, resumable SSE. The web app calls the API only through it; it holds no credentials. |
| `packages/mastra-runtime` | Server-only Mastra adapters (model resolution, mock models, storage). |
| `packages/labs` | Server-only lab implementations (`lab-XX/`). Added in F02. |
| `openspec/` | OpenSpec specs and changes. |

## Conventions

- Internal packages are consumed as TypeScript source (`exports` → `src/index.ts`); the API is bundled with tsup for production.
- ESM everywhere (`"type": "module"`). Node ≥ 22.13 (Mastra engine requirement); CI uses Node 24 LTS.
- Exact versions only (`.npmrc` `save-exact=true`). Commit `package-lock.json`.
- Tests: Vitest (`*.test.ts[x]` next to source), Playwright e2e in `e2e/`.
- Before finishing a change run: `npm run verify` and `npm run test:e2e`.

## OpenSpec workflow

`openspec` is a pinned devDependency (`npx openspec ...`). Command spelling per assistant:

| Assistant | Propose | Apply | Archive |
| --- | --- | --- | --- |
| Claude Code | `/opsx:propose` | `/opsx:apply` | `/opsx:archive` |
| Codex | `$openspec-propose` | `$openspec-apply-change` | `$openspec-archive-change` |
| GitHub Copilot | `/opsx-propose` | `/opsx-apply` | `/opsx-archive` |
| Others | run `npx openspec init --tools <tool>` to generate them | | |
| Any (CLI) | create `openspec/changes/<name>/` manually | — | `npx openspec archive <name> -y` |

Validate with `npx openspec validate <change> --strict` before implementing.
