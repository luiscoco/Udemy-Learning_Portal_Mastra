# Tasks

## 1. Implementation

- [x] 1.1 Services: `partitionOf`, `tenant`, `files`, `forTenant`; runner `servicesFor`; unit tests (partitions, hashing, traversal)
- [x] 1.2 L01 and L07 onto `ctx.services.files`; guard test against `dataDir(` in labs
- [x] 1.3 API: `servicesFor` wiring; route classification and audit test; cross-tenant negative tests for every tenant route
- [x] 1.4 API isolation tests for L21, L36, L07 and L58 across two learners
- [x] 1.5 Migration script and its test; docs (AUTH, README, RELEASE-GATES, COMPATIBILITY)
- [x] 1.6 Lab 62: definition, run, checks, fixtures, solution; lab62.test.ts, conformance

## 2. Verification

- [x] 2.1 `npm run verify`, `npm run test:e2e`, API live suite, Prettier

## Workflow follow-up

- Archive, commit and push (only after every check has passed).
