# Tasks

## 1. Contracts

- [x] 1.1 Lab definition, lesson guide, input field, quiz, instructor outline, exercise schemas with invariants — verify unit tests reject 2 hints / 6 quiz questions / bad correct index
- [x] 1.2 Execution request/event union, run snapshot, validation result, preflight, progress record; `retryable` on ApiError — verify event parsing tests

## 2. Engine (`@mlp/lab-engine`)

- [x] 2.1 `LabError`, `toApiError` with secret redaction — verify mapping tests
- [x] 2.2 `LabRegistry` validating definitions, source paths and example input — verify registration tests
- [x] 2.3 `RunStore` with bounded events, subscribers, TTL sweep — verify unit tests
- [x] 2.4 `LabRunner`: start, cancel, deadline, concurrency, disconnect grace, single terminal event — verify abort/timeout/error/concurrency tests

## 3. Labs (`@mlp/labs`)

- [x] 3.1 Dummy Lab 00 definition + deterministic implementation + fixtures — verify determinism test
- [x] 3.2 Conformance suite applied to every registered lab — verify `npm test`
- [x] 3.3 Catalog consistency test (registry ids/titles match `@mlp/lab-catalog`)

## 4. API

- [x] 4.1 Request/correlation id middleware; config keys for limits — verify header test
- [x] 4.2 Lab discovery, source and preflight routes — verify supertest
- [x] 4.3 Run start/snapshot/cancel routes and SSE stream with replay, Last-Event-ID, heartbeat, close cleanup — verify integration tests over real HTTP (stream, cancel, disconnect, timeout)
- [x] 4.4 Secret leakage test: configured key absent from every response and event

## 5. Integration

- [x] 5.1 `npm run verify` and `npm run test:e2e` green; docs updated (README API section)

## Workflow follow-up

- Archive with `npx openspec archive f02-lab-contracts-engine -y` and commit.
