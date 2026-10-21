# Proposal

## Why

A review after L62 found two gaps in tenant isolation:

- **The migration script misses sidecar files.** `scripts/migrate-tenant-data.mjs` copies only `memory/*.db*`, `memory/library/` and `comparisons/`. L32, L33 and L34 keep an idempotency record next to their workflow store (`lab-32-ledger.jsonl`, `lab-33-payments.jsonl`, `lab-34-charges.jsonl`). Migrating the workflow store without its record lets a resumed workflow record or charge a second time.
- **Browser storage is shared between learners.** Lab progress (`mlp.progress.v1`) and Source-tab scratch notes (`mlp.scratch.<labId>`) are not scoped to the signed-in learner. On a shared browser, the next learner sees the previous learner's progress and private notes.

## What Changes

- **Migration:** the script also copies every regular file in `memory/` whose name ends in `.jsonl`. It still never overwrites and still copies by default. A test covers a workflow store migrated together with its ledger.
- **Per-learner browser scopes:**
  - A storage scope is derived from the session: `guest` when signed out, otherwise `u` + the FNV-1a hex hash of `principal.sub`.
  - Progress uses `mlp.progress.v1` for guest (the existing key, so nothing is lost) and `mlp.progress.v1:<scope>` for a learner. Scratch notes use `mlp.scratch.<labId>` for guest and `mlp.scratch.<scope>.<labId>` for a learner.
  - **Claim once:** when a learner signs in and has no data of their own yet, guest data on that browser (including data saved before this change) moves to the learner and is removed from guest.
  - Signing out switches back to the guest scope, so nothing of the previous learner is shown.
- `ProgressStore` gains an optional `setScope(scope)`. A `ProgressScopeSync` component inside `AuthProvider` applies the session's scope.
- **Docs:** `docs/AUTH.md` explains that browser scoping prevents accidental display on a shared browser but is not a security boundary, because same-origin scripts can read localStorage. Server-side progress remains the release gate.

- **Course prompt pack (`course-prompts/`):** the owner asked that students be able to rebuild the platform from zero. The pack holds the original master rules and all 79 prompts (F01–F04, L01–L75) unchanged, one file per step, plus follow-up prompts for the changes the reference build needed beyond them (including this one as `L62a`). `build-order.md` lists the order, and the README links the pack.

## Out of scope

Server-side learner progress (L71 / release gate). Clearing a learner's browser data on sign-out: learners keep their progress when they return to the same browser.
