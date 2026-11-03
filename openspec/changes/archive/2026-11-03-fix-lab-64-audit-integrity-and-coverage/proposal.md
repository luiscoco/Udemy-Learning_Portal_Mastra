# Proposal

## Why

A review after L64 found gaps in the audit and in the project's specs:

1. **Rebuilt or truncated logs pass verification.** The chain uses plain SHA-256, so anyone who can write the file can rebuild a valid chain after editing it. Removing the last entries also leaves a valid chain, because nothing records where the log should end.
2. **Calls with invalid arguments are not audited.** A call whose input fails the tool schema can reach the approval gate without `beforeApproval` running; on resume Mastra rejects it as `invalid` without calling `execute` (verified: a `changeEmail` with `a..b@customer.example` produced an approval and an `invalid` trace, but no policy or execution entry). The run then fails `audit-complete`, `policy-fail-closed` and `denied-never-invoked` for a call that never ran.
3. **The approval-round cap leaves calls suspended.** After `MAX_APPROVAL_ROUNDS`, any remaining pending calls are neither approved nor declined, and their outcome stays `unknown`.
4. **The log grows without bound.** There is no retention rule.
5. **A recurring L50 flake.** During full `verify` runs, L50 occasionally reported both healthy loopback MCP servers as timed out: its 1.5 s per-server discovery bound is too tight on a busy machine. It now uses 5 s, like L47. A server that is down is a closed port and still fails at once.
6. **Spec Purposes are placeholders.** Fourteen main specs (L51–L60, L62–L64 and `platform/tenant-isolation`) still had the `TBD` Purpose that `openspec archive` writes, so `openspec validate --specs --strict` failed, and `npm run verify` did not check it.

## What Changes

- **Keyed chain and head anchor.**
  - `hash = HMAC-SHA256(key, prevHash + canonical(entry))`. Entries carry `v: 2`.
  - The key is server-only, from `AUDIT_HMAC_KEY` or a key generated once into `<dataDir>/secrets/audit-hmac.key`, exposed to labs as `services.auditKey()` and never stored with the log.
  - After each append, `<log>.anchor.json` records `{ seq, hash, mac }`. Verification fails when the log ends before or after the anchored head, when the anchor is missing for a non-empty log, or when the anchor's MAC is wrong.
  - A legacy unkeyed log is archived automatically on first use, with a warning, and never trusted.
  - **Documented limit:** someone who can also restore an older, consistent log-and-anchor pair can roll back. Production still needs an external, monotonic anchor (release gate).
- **Invalid-input calls are audited.** After each stream segment, a tool call without an audit entry gets one: a `policy` entry with decision `deny`, rule `input-validation` and the validation message, plus an `execution` entry `not-invoked`.
- **Approval cap.** Pending calls beyond `MAX_APPROVAL_ROUNDS` are declined with the reason `approval round limit reached`, audited, and resumed, so every call ends with a terminal outcome.
- **Retention.** The log rotates automatically when it exceeds 5,000 entries. The old file is kept.
- **Specs.**
  - Purposes are written for the 14 specs.
  - `npm run check:specs` (`openspec validate --specs --strict`) is part of `npm run verify`.
  - The course prompts note in follow-up `L64a` that archived capabilities need a real Purpose.
- **Tests:**
  - HMAC rebuild detected;
  - truncation detected;
  - anchor tampering detected;
  - legacy log archived;
  - invalid-input call audited and the run passes;
  - round cap declines the rest;
  - rotation at the size limit.
