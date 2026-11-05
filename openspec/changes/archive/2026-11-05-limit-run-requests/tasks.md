# Tasks

## 1. Bounded admission

- [x] 1.1 Implement atomic owner/network fixed windows, normalization and bounded capacity; verify clock boundaries, denial atomicity, IPv4/IPv6 aliases and expiry/capacity unit tests; document algorithm and limits.

## 2. API and configuration

- [x] 2.1 Add validated configuration and owner-checked route admission; verify HTTP isolation, retry headers, no side effects, cancellation/SSE and SDK error behavior with deterministic tests; document settings and proxy trust.

## 3. Browser behavior

- [x] 3.1 Add offline desktop/mobile scenarios for start/control throttling and unaffected cancellation, with explicit high allowances only on the broad E2E host; verify focused Playwright checks and document demo steps.

## 4. Integration

- [x] 4.1 Run npm run verify then npm run test:e2e, resolve actual failures and record results, changed files, costs and remaining gates.

## Workflow follow-up

- Sync the delta into the main specification, archive the verified change and strictly validate main specs.
