# Proposal

## Why

Lab 01 is the learner's first contact with Mastra: they must see what a working Mastra TypeScript project contains, why it is ESM, which Node version it needs and how it is configured, and prove it builds.

## What Changes

- New lab `lab-01` "Create a Mastra project" (Module 01) registered in the catalog as available.
- Reference template of a minimal Mastra project (`package.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `src/mastra/index.ts`, `src/mastra/agents/assistant-agent.ts`) kept as real, typechecked files following the structure produced by `npm create mastra`.
- Run: validate inputs and environment (Node version, ESM), render the project into a temporary server-side folder, **really typecheck it with the TypeScript compiler against the installed `@mastra/core`** in a worker thread (cancellable), stream bootstrap logs and workflow steps, return the file tree, configuration and root files, then delete the folder.
- Automated checks: build passes, ESM configured, Node engine pinned, entry registers a `Mastra` instance, `.env` secrets excluded.
- Shared: `checkModelId` / `liveModelCatalog` in `@mlp/mastra-runtime` validating model ids against Mastra's provider registry.

## Capabilities

### New Capabilities

- `course-labs/lab-01-create-a-mastra-project`: behaviour of Lab 01.

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-01/`, catalog availability, `typescript` becomes a runtime dependency of `@mlp/labs`. Offline only, zero provider cost.
