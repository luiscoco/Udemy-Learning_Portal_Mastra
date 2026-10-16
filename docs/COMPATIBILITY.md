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
| @fission-ai/openspec | 1.14.2 | dev-only |

## Known issues

| Issue | Impact | Status |
| --- | --- | --- |
| `npm audit`: `braces` (GHSA-vfj7-8cjw-p6xm, high) via `@fission-ai/openspec` → fast-glob → micromatch | Dev-only CLI, not shipped | No patched `braces` release; the suggested fix downgrades OpenSpec to 0.17. Accepted. |
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
