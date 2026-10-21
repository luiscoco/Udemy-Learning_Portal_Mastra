# Tasks

- [x] policy.ts: schema (fail-closed default), evaluation, approver eligibility; unit tests
- [x] audit.ts: hash-chained per-tenant JSONL log, masking, verification; tamper test
- [x] tools.ts: requireApproval / beforeApproval / execute re-check with argument binding; counters
- [x] run.ts: approval rounds (preset, ask, ineligible approver), decision table, checks
- [x] definition (editable JSON policy), fixtures, solution; register in index and catalog
- [x] lab64 tests, e2e happy path, live check
- [x] COMPATIBILITY row (requireApproval function, beforeApproval); RELEASE-GATES note
- [x] npm run verify, npm run test:e2e, live checks
