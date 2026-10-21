# Design

## Context

- **Durable lab data goes through `ctx.services`.** There are 23 `memory.file` / `memory.open` call sites. The L36 library (`courseLibrary`) derives its folder from `memory.file('lab-36-library')`, and the L58–L60 dataset stores use `memory.file`.
- **Inside those files, labs use constant ids**: resource ids such as `'learner'`, fixed thread ids, and fixed dataset ids (`course-faq`). Rewriting those ids per learner in about 30 labs would be invasive and easy to miss in a new lab. Partitioning the files is structural instead: a lab cannot leak what it cannot open.
- **Two labs bypass the services** with `dataDir()`: L01 scaffolds (per-run folders, never listed) and L07 comparisons (listed across runs, so a cross-tenant leak today).
- **Module-level state** in labs is constants, plus locks keyed by file path. Partitioned paths make those locks per tenant too.
- **Runs** are owner-bound in the API since L61 (`runner.ownerOf`, 404 for others). The runner passes one `services` object to every run.

## Decisions

- **`partitionOf(ownerId)`** = `sha256('tenant:' + ownerId)`, first 24 hex characters. `null` means `local`, so a run without an owner (CLI, unit tests) is its own partition.
- **`LabServices` additions:**
  - `tenant: { partition: string }`;
  - `files(name)` → `<tenantRoot>/files/<name>`, where `name` must match `^[a-z0-9][a-z0-9-]{0,63}$`;
  - `forTenant(ownerId)` → a new services object that shares the models (stateless) and has a memory service rooted at `<memoryRoot>/tenants/<partition>`.

  `createLabServices(config)` returns the `local` partition view, and the memory root is `config.memoryDir ?? <dataDir>/memory`.
- **Runner:** `RunnerOptions.servicesFor?: (ownerId: string | null) => S`; a run's context gets `servicesFor?.(record.ownerId) ?? services`. The API passes `servicesFor: (o) => services.forTenant(o)`.
- **L01 and L07:** use `ctx.services.files('scaffolds')` and `ctx.services.files('comparisons')`. `comparisonsDir(services)` takes the services. Their tests follow the services.
- **Guard test:** `packages/labs/src/tenancy.test.ts` scans the lab sources for `dataDir(` (outside `paths.ts` and `services.ts`) and fails if any remain.
- **Route audit:**
  - `listRoutes(app)` walks `app.router.stack` (Express 5), including mounted routers, whose base path is reconstructed from the layer matcher.
  - The classification table lives in `apps/api/src/route-classes.ts`, so the audit and the docs share one list.
  - The test fails when a route is missing from the table, or when the table has a route that no longer exists.
- **Isolation tests over HTTP** (`apps/api/src/tenancy.test.ts`): learners A and B sign in with `test-auth.ts` and run, in order:
  - **L21:** each learner chats and the history is recalled; B's recall never contains A's message;
  - **L36:** A stores a document, and B's library listing is empty;
  - **L07:** B's recent comparisons do not include A's;
  - **L58:** A's experiment is not in B's recorded experiments.

  The exact fields are checked from each lab's output.
- **Migration script** (`scripts/migrate-tenant-data.mjs`, no dependencies): it resolves the data dir like `paths.ts` (`MLP_DATA_DIR` or `.data`) and copies `memory/*.db*`, `memory/library/` and `comparisons/` to `memory/tenants/<partition>/` (and `files/comparisons/`). It skips existing targets, reports each file, and with `--move` removes the sources after a successful copy.
- **Lab 62** (`packages/labs/src/lab-62/`):
  - stores via `ctx.services.memory.open`: a shared store (one file) vs `forTenant(A)` / `forTenant(B)`;
  - thread `t1`, resource `learner` for both learners, and A saves a message;
  - B recalls in each setup;
  - run ownership through a nested `LabRunner` with `servicesFor` and the owner check;
  - partition ids, and a hostile owner id `../../etc` resolved inside the tenants root.

  The output includes the paths relative to the tenants root.
