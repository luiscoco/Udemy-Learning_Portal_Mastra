# L64a — Audit integrity, full call coverage and spec hygiene

**Module:** 13 Security and Reliability · **Step 80 of 92** · **OpenSpec change:** `fix-lab-64-audit-integrity-and-coverage`

Follow-up prompt added from the reference build: a change the platform needed that the original prompts did not ask for. Run it in this position. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L64](L64-tool-approval-policies.md) · Next: [L65](L65-timeouts-and-failure-testing.md)

## Copy-ready prompt

Implement platform follow-up L64a — "Audit integrity, full call coverage and spec hygiene".

Why: a review after L64 found that (1) a plain SHA-256 chain can be rebuilt by anyone who can write the file, and removing the last entries leaves a valid chain; (2) a tool call whose input fails the tool schema can reach the approval gate without beforeApproval running, and on resume Mastra rejects it as invalid without calling execute, so it left no complete audit trail and the run failed its own checks; (3) calls still pending after the approval-round cap stayed unresolved; (4) the log had no retention; (5) OpenSpec main specs created by archiving kept the placeholder Purpose ("TBD - created by archiving …"), so strict spec validation failed and verify did not check it.

Requirements:
- Chain entries with a server-held HMAC key (AUDIT_HMAC_KEY of at least 32 characters, or a random key generated once into <dataDir>/secrets, exposed to labs only as a server-side service and redacted from events and logs). Write a keyed head anchor (last seq and hash) next to the log on every append and fail verification on a missing, forged or mismatching anchor, so truncation is detected. Archive legacy unkeyed logs automatically (never trust them) and rotate at a size limit, keeping old files.
- Audit every tool call that ends invalid or with an error and has no policy or execution entry: a policy entry "deny" with rule input-validation and an execution entry "not-invoked".
- Decline (and audit) pending calls beyond the approval-round cap so every call ends with a terminal outcome.
- Write a real Purpose for every main spec, and add `openspec validate --specs --strict` to npm run verify. Whenever a change creates a new capability, fill its Purpose in the main spec right after archiving.
- Document the remaining limit: someone who can restore an older, consistent log-and-anchor pair can roll back; production needs an external, monotonic anchor.

Definition of done: tests show an edited entry, a chain rebuilt without the key, a truncated log and a forged anchor are all detected; a legacy log is archived; an invalid-input call is audited and the run passes; the round cap declines the rest; all specs validate strictly inside verify.

First create an OpenSpec change named fix-lab-64-audit-integrity-and-coverage with proposal, delta specifications, technical design and tasks. Review the current codebase and the installed Mastra version, implement the change, run lint, typecheck, unit/integration and e2e tests, and summarize actual proof of completion and known limitations. Do not change previously completed labs except where this prompt says so.
