# Proposal

## Why

The Mastra Udemy course needs a reproducible, secure monorepo before any lab can be built. Every later milestone (F02–F04, L01–L75) depends on shared workspaces, pinned dependencies, a health-checked API and CI.

## What Changes

- npm-workspaces monorepo: `apps/web` (React, Vite, TypeScript, Tailwind), `apps/api` (Node.js, Express, TypeScript), `packages/contracts`, `packages/lab-catalog`, `packages/mastra-runtime`.
- OpenSpec installed as a pinned devDependency and initialized for Claude Code, Codex and GitHub Copilot; command variants documented in `AGENTS.md`.
- Root scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `verify`; exact-version lockfile.
- `.env.example` and server-side Zod config validation that fails fast with masked messages.
- `GET /api/health` returning service status, version, uptime, runtime mode and installed Mastra version.
- Lab catalog containing only the zero-cost **Dummy Lab 00**.
- Bundle-secret guard script, README with Windows PowerShell instructions, GitHub Actions CI.

## Capabilities

### New Capabilities

- `dev-foundation`: reproducible install, scripts, configuration validation, secret isolation and CI.
- `api-health`: the health endpoint contract.
- `lab-catalog`: browser-safe registry of course modules and labs.

### Modified Capabilities

(none)

## Impact

New repository. Adds dependencies: express, zod, @mastra/core (server only), react, vite, tailwindcss, vitest, playwright, eslint, typescript, openspec. No lab 01–75 implementation.
