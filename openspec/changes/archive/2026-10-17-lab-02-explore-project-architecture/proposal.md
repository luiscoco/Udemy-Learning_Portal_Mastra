# Proposal

## Why

Before writing agents, learners must know where each concern lives in a real Mastra application: browser UI, HTTP API, server-side Mastra runtime, and the Mastra entry point that registers agents — and how secrets stay on the server.

## What Changes

- New lab `lab-02` "Explore project architecture" (Module 01), available in the catalog.
- Run: the learner maps four layers (UI, API, runtime, Mastra entry) to paths; the server inspects this repository read-only through an allowlist, emitting one tool-style event per inspected file, and builds an architecture manifest (workspaces, scripts, entry points, dependencies, agent registration lines, `.env` hygiene by key name only).
- Automated file assertions grade each mapping against evidence (e.g. React + `index.html` for UI, Express + `listen` for API, `@mastra/core` dependency for runtime, `new Mastra(` for the entry).

## Capabilities

### New Capabilities

- `course-labs/lab-02-explore-project-architecture`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-02/`. Offline, zero cost. Reads repository files only; never reads `.env` contents.
