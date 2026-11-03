# F01 — Monorepo, OpenSpec, and developer foundation

**Module:** Foundation · **Step 1 of 92**

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Next: [F02](F02-typed-lab-contracts-engine-and-events.md)

## Copy-ready prompt

Implement foundation milestone F01 — Monorepo, OpenSpec, and developer foundation for the Mastra Udemy learning platform.

Requirements: Create npm-workspaces monorepo apps/web (React, Vite, TypeScript, Tailwind), apps/api (Node.js, Express, TypeScript), packages/contracts, packages/lab-catalog, packages/mastra-runtime. Install and initialize OpenSpec; document coding-assistant command variants. Provide pinned lockfile, scripts dev/build/lint/typecheck/test, .env.example, safe config validation, GET /api/health, README Windows PowerShell instructions, and GitHub Actions CI. Use supported Node LTS and check latest Mastra docs. Only register a zero-cost Dummy Lab 00.

Definition of done: Fresh clone installs reproducibly; npm run dev starts web/API; /api/health responds; lint, typecheck, tests and build pass; secrets never enter client bundle.

Before writing code, create the corresponding OpenSpec change (proposal, specs, design, tasks), validate current APIs, and review scope. Then implement, run relevant lint/typecheck/unit/integration/e2e checks, and report files changed and test evidence. Maintain compatibility with the already completed milestones. Do not implement real Lab 01–75 here.
