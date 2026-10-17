# Compatibility

Exact versions are locked in `package-lock.json` (`save-exact=true`). This table records what was tested together.

| Component | Version | Notes |
| --- | --- | --- |
| Node.js | 24.14.1 (CI: 24.x) | `@mastra/core` requires `>=22.13.0` |
| npm | 11.12.0 | |
| @mastra/core | 1.78.0 | server-only (`packages/mastra-runtime`); peer `zod ^3.25 \|\| ^4` |
| zod | 4.6.7 | |
| express | 5.3.0 | |
| react / react-dom | 19.3.1 | |
| vite | 8.3.4 | |
| tailwindcss | 4.3.3 | via `@tailwindcss/vite` |
| typescript | 6.0.3 | **not 7.x**: typescript-eslint 8.71.2 supports `<6.1.0` |
| eslint | 10.13.0 | flat config |
| vitest | 5.0.5 | root `projects` config |
| @playwright/test | 1.64.1 | Chromium |
| @fission-ai/openspec | 1.14.3 | dev-only (1.14.3 drops the vulnerable fast-glob → micromatch → braces chain) |

## Known issues

| Issue | Impact | Status |
| --- | --- | --- |
| `npm audit`: `braces` / `micromatch` / `fast-glob` (high) via `mastra` CLI → `@mastra/deployer` → find-workspaces | Dev-only (`npm run studio`), not shipped in the API bundle | No fixed `mastra` release yet (1.34.2 is latest, 2026-10-17). OpenSpec's copy of the chain was removed by upgrading to 1.14.3. Re-check on each Mastra upgrade. |
| `npm audit`: `sprintf-js` (GHSA-hp3w-g68c-fv3c, moderate) via `@mastra/core` → gray-matter → js-yaml 3 → argparse | Server-side transitive; not reachable from request input in this app | Suggested fix downgrades Mastra to 1.0.4. Accepted pending upstream. |
| Tailwind Vite plugin emits a `SOURCEMAP_BROKEN` warning during build | Cosmetic (CSS sourcemap) | Upstream |
| Vite binds `localhost` to IPv6 on some Windows setups | Playwright could not reach it | Dev server pinned to `127.0.0.1` |

## Verified Mastra behaviour (used by labs)

| Fact | Source | Used by |
| --- | --- | --- |
| `Agent` accepts AI SDK `LanguageModelV2` objects and `"provider/model"` router strings | `@mastra/core/dist/llm/model/shared.types.d.ts`; spike test `packages/mastra-runtime/src/spike.test.ts` | offline scripted model, all agent labs |
| `agent.generate()` returns `text`, `toolCalls`, `toolResults`; `agent.stream()` exposes `fullStream` with `text-delta`, `tool-call`, `tool-result` chunks | spike test | L03+, L08 |
| `new Mastra({ agents })`, `getAgent(key)`, `getAgentById(id)`, `listAgents()` | `@mastra/core/dist/mastra/index.d.ts`; spike test | L03 |
| Tools: `createTool({ id, description, inputSchema, outputSchema, execute: (inputData, context) => … })` | `@mastra/core/dist/tools/tool.d.ts` | L11+ |
| Provider registry at runtime: `getProviderConfig`, `parseModelString`, `modelSupportsTemperature`, `modelSupportsStructuredOutput` from `@mastra/core/llm` | runtime probe; `models.test.ts` | model validation |
| API key variables: OpenAI `OPENAI_API_KEY`, Anthropic `ANTHROPIC_API_KEY`, Google `GOOGLE_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` | `getProviderConfig(p).apiKeyEnvVar` | config, L01 |
| `mastra` CLI 1.34.2 project scripts `mastra dev` / `mastra build` / `mastra start`; Studio on `http://localhost:4111` | CLI bundle (`dist/*.js`) | L01, L05 |
| `agent.stream().fullStream` chunks: start, step-start, text-start, **text-delta (`payload.text`)**, text-end, step-finish, finish; aborting the signal ends the loop quietly (no throw) | spike (L08) | L08 |
| An aborted `agent.generate()` **resolves with empty text** instead of rejecting — check the signal yourself | spike (L10) | L10 retry policy |
| `structuredOutput: { schema, errorStrategy }`: strict throws MastraError `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`; warn → `object` undefined; fallback → `fallbackValue` with `usedFallbackValue: true`; JSON inside a json code fence is parsed | spike (L09) | L09 |
| Agent `maxRetries` (default 0) and model fallback arrays `model: [{ model, maxRetries }, …]` | `agent/types.d.ts` | L10 (taught) |
| `openai/gpt-5-mini` live latency is often > 1.5 s per call (reasoning model) | live tests | L10 timeouts guidance |
| Tool `requireApproval: true` (or a function of the input) → stream emits `tool-call-approval { toolCallId, toolName, args }` and ends without `execute()`; `agent.approveToolCall({ runId, toolCallId })` resumes with `tool-call-resumed`, `tool-result` (executes once); `agent.declineToolCall({ runId, toolCallId, reason })` resumes with `tool-output-denied` (never executes; reason shown to the model). Works in memory when the agent is registered on `new Mastra({ agents })` | `agent/agent.d.ts`, `tools/types.d.ts`; spike + live probe (L15) | L15 |
| `instructions` accepts `({ requestContext, mastra }) => string`; `RequestContext` from `@mastra/core/request-context` (`new RequestContext([[k, v]])`, `get`/`set`/`has`); per-call `requestContext` in `generate`/`stream` keeps parallel calls on one agent isolated; `requestContextSchema` rejects invalid context with MastraError `AGENT_REQUEST_CONTEXT_VALIDATION_FAILED` before instructions or the model run. A module variable written before `await generate()` leaks under `Promise.all` (all calls see the last write) | `types/dynamic-argument.d.ts`, `agent/types.d.ts`; spike + live (L16) | L16 |
| Tools get the call's context as `execute(input, context)` → `context.requestContext` (same keys as the agent; Mastra adds none during `generate`); tool `requestContextSchema` failure returns an `{ error: true, message }` tool result (message echoes the context, so never store secrets there) and `execute` does not run; model-supplied keys not in `inputSchema` are stripped before `execute`; `isReservedRequestContextKey` flags `mastra__*` and `__mastra_*` | `tools/types.d.ts`, `request-context/index.d.ts`; spike + live (L17) | L17 |

## Environment notes

| Issue | Symptom | Mitigation |
| --- | --- | --- |
| Windows ephemeral-port exhaustion (16,384 dynamic ports; sockets linger ~2–4 min in TIME_WAIT) | Random `ETIMEDOUT` / `ERR_CONNECTION_TIMED_OUT` in e2e or dev after heavy traffic | E2E uses the single-origin production build (no dev proxy); the Vite dev proxy uses a keep-alive agent. Check with `(Get-NetTCPConnection -State TimeWait).Count`; if near 16k, wait or find the process creating connections. |
| `tsx watch` silently restarting / dev proxy churn | Lost SSE streams in long e2e runs | E2E never uses `npm run dev`; it builds and runs `node apps/api/dist/server.js`. |
