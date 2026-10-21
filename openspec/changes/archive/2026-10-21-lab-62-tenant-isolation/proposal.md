# Proposal

## Why

L61 binds every run to the learner who started it, but the data those runs read and write is still shared:

- **Threads:** every lab's memory database lives at `<dataDir>/memory/<name>.db` with constant resource ids such as `'learner'`.
- **Documents:** the L36 document library is one folder for everyone.
- **Storage records:** suspended workflow runs, datasets, experiments, scores and traces sit in shared lab store files.
- **Saved files:** L07 lists other learners' saved model comparisons.

Learner B can read learner A's conversation history, documents and evaluation history simply by running the same lab.

The DoD asks to enforce ownership scopes across threads, documents, runs and storage records, with cross-tenant negative tests passing across all routes.

## What Changes

- **Partition per tenant, enforced at the service layer.** Every lab reaches durable data through `ctx.services` (`memory.file`, `memory.open`, the library derived from them, and a new `files(name)` for plain files).
  - `LabServices.forTenant(ownerId)` returns services whose roots are `<memoryDir>/tenants/<partition>/`, where `partition` = the first 24 hex digits of SHA-256(`tenant:<ownerId>`). No raw identity ever reaches a path, so a crafted owner id cannot traverse.
  - Learners therefore cannot share a file, whatever resource or thread ids a lab uses inside it.
  - `createLabServices()` itself is the `local` partition (CLI and tests without an owner).
- **The runner gives each run its owner's services:** a new `RunnerOptions.servicesFor(ownerId)`. The API passes `services.forTenant`, so the partition follows the authenticated owner from L61.
- **Labs that bypassed the services:** L07 comparisons and L01 scaffolds move from `dataDir()` to `ctx.services.files(...)`. A test fails if a lab source calls `dataDir()` again.
- **Runs:** owner-bound since L61 (another learner's run → 404). This change covers them in the route audit.
- **Route audit** (`apps/api/src/routes.audit.test.ts`): it enumerates every registered API route from the Express router and requires each to be classified as `public` (no tenant data) or `tenant` (owner-bound), so a new route fails the test until it is classified. For every tenant route it checks: anonymous → 401; learner B with A's run → 404 (cancel and approvals too); A still succeeds.
- **Data isolation tests:**
  - through the API: A and B run L21 (memory thread), L36 (document library), L07 (saved comparisons) and L58 (dataset and experiments), and B's outputs never contain A's data;
  - at the services level: partitions never overlap, owner ids are hashed, and traversal-looking owner ids are harmless.
- **Migration:** `scripts/migrate-tenant-data.mjs --owner <sub> [--move]` copies (or moves) the legacy shared stores (`<dataDir>/memory/*.db*`, `memory/library/`, `comparisons/`) into that owner's partition, and refuses to overwrite. It is documented in `docs/AUTH.md` and README. Nothing migrates silently, so a shared legacy store is never exposed to every learner.
- **New lab `lab-62`** (Module 13): an in-process demonstration. Two learners write a memory thread with the same thread and resource ids:
  - in a **shared** store (the anti-pattern), B reads A's thread;
  - in **partitioned** stores, B does not.

  It also shows a run owned by A refused for B through the runner and owner check, partition ids derived by hashing, and a traversal-looking owner id staying inside the tenants root. One check per defence; offline only.
- **Docs:** `RELEASE-GATES.md` marks per-learner storage and workflow-run ownership done for the local single-process deployment.

## Capabilities

### New Capabilities

- `platform/tenant-isolation`
- `course-labs/lab-62-tenant-isolation`

### Modified Capabilities

(none; `LabServices` gains members additively, and the runner gains an optional `servicesFor`)

## Impact

- **Packages:** `packages/labs` (services, L01, L07, lab-62), `packages/lab-engine` (`servicesFor`), `apps/api` (wiring, route audit and isolation tests), `scripts/`, docs.
- **Behaviour change:** each learner sees only their own stored data. Existing development data stays in the legacy location until it is migrated.
