# Design

- **`services.ts`:** `auditKey(): Buffer`. It uses `env.AUDIT_HMAC_KEY` (at least 32 characters) when set. Otherwise it reads or creates `<dataDir>/secrets/audit-hmac.key` (32 random bytes, hex), with mode `0o600` where supported. The key is cached per process, is the same for every tenant view, and its value never appears in events or outputs.
- **`audit.ts`:**
  - `new AuditLog(file, { key, now?, maxEntries? })`. Hashing is `hmac(key, prevHash + canonical(base))`.
  - `append` writes the line, then the anchor `{ seq, hash, mac: hmac(key, 'anchor:' + seq + ':' + hash) }`, both under the per-file lock.
  - `verify` checks the chain, the version, then the anchor:
    - the last entry must equal the anchor (`seq` and `hash`) with a valid MAC;
    - an empty log with an anchor is a truncation;
    - a non-empty log without an anchor is broken.
  - `brokenAt` points to the first bad entry, or to `entries + 1` for truncation (reason `truncated`).
  - `prepare()` runs before a run: it archives a legacy unkeyed log (entries without `v: 2`), or a log over `maxEntries`, with `rotate()`, and returns why.
- **`run.ts`:**
  - `auditUnaudited(traces)` appends the policy and execution entries for traces that have no entry in this run.
  - The approval loop runs while calls are pending, at most `MAX_APPROVAL_ROUNDS + 8` times. Rounds after `MAX_APPROVAL_ROUNDS` are forced declines.
- **`package.json`:** `check:specs`; `verify` runs it after `check:env-example`.
- **Course prompts:** follow-up `L64a` describes the same hardening.
