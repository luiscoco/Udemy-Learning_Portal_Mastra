# Tasks

## 1. Configuration and persistence

- [x] 1.1 Add additive store configuration and reusable cookie helpers; verify configuration refusal, masking and existing synchronous auth tests; document enabling durable mode.
- [x] 1.2 Implement checked migrations and bounded durable sessions with hashed IDs, integrity/configuration binding, absolute expiry and atomic rotation; verify lifecycle, concurrency, capacity, drift and corruption tests.

## 2. API integration and recovery

- [x] 2.1 Await session verification and durable mutations at the Express boundary and initialization before listening; verify HTTP contracts, failures, cross-instance logout/rotation and unchanged ownership/CSRF behavior; document operational boundaries.
- [x] 2.2 Add distinct-process API recovery tests and a desktop/mobile browser restart/logout scenario; verify cookie and progress restoration without browser credential storage and record migration/rollback instructions.

## 3. Integration verification

- [x] 3.1 Run npm run verify and then npm run test:e2e sequentially; resolve failures and record commands, results, costs, changed files and remaining gates.

## Workflow follow-up

- Sync the auth-boundary delta, archive after successful verification and validate the main specifications strictly.
