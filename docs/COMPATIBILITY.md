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
