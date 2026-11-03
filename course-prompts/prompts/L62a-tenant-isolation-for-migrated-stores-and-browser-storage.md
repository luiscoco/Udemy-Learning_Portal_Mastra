# L62a — Tenant isolation for migrated stores and browser storage

**Module:** 13 Security and Reliability · **Step 76 of 91** · **OpenSpec change:** `fix-tenant-migration-and-browser-storage`

Follow-up prompt added from the reference build: a change the platform needed that the original prompts did not ask for. Run it in this position. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L62](L62-tenant-isolation.md) · Next: [L63](L63-untrusted-input-and-prompt-injection.md)

## Copy-ready prompt

Implement platform follow-up L62a — "Tenant isolation for migrated stores and browser storage".

Why: a review after L62 found two gaps. (1) The legacy-data migration copied store files but not the sidecar records that some labs keep next to them (the L32–L34 idempotency ledgers, *.jsonl), so a migrated workflow could repeat a recorded side effect. (2) Lab progress and Source-tab scratch notes live in browser localStorage without a learner scope, so the next learner on a shared browser sees the previous learner's progress and private notes.

Requirements:
- Migration: copy every store file (*.db, *.db-wal, …) together with its *.jsonl sidecar records; never overwrite; copy by default, delete sources only with --move. Test a workflow store migrated with its ledger.
- Browser scopes: derive a storage scope from the session — guest when signed out, otherwise a short hash of the principal id (no names in keys). Guest keeps the original unscoped keys. Progress and scratch notes use per-scope keys. Claim once: a learner without data of their own takes over the guest data on that browser (including data saved before scoping); existing learner data is never merged. Signing out switches back to guest.
- The progress store adapter gains setScope(scope); a small component inside the auth provider applies the session's scope; the scratchpad remounts per scope.
- Document that browser scoping prevents accidental display but is not a security boundary; server-side progress remains a release gate.

Definition of done: tests show learner A's progress and notes are invisible to learner B and to a signed-out visitor on the same browser, and visible to A again after signing back in; the migration test passes.

First create an OpenSpec change named fix-tenant-migration-and-browser-storage with proposal, delta specifications, technical design and tasks. Review the current codebase and the installed Mastra version, implement the change, run lint, typecheck, unit/integration and e2e tests, and summarize actual proof of completion and known limitations. Do not change previously completed labs except where this prompt says so.
