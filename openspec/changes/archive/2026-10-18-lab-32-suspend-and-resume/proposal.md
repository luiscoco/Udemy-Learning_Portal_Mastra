# Proposal

## Why

Workflows often have to wait: for a customer's documents, a signature or a payment. Waiting must not hold a process open. When the input arrives, possibly after a server restart, the workflow must continue from where it stopped, **without repeating** what already happened: an account created twice, a fee charged twice, a model call paid twice. Mastra supports this natively with `suspend()`, persisted snapshots and `resume()`. Learners need to see it work across a restart, and see what goes wrong when "resume" is faked by starting over.

## What Changes

- **New lab `lab-32`** (Module 07): an `account-onboarding` workflow, persisted in libSQL through a `Mastra` instance with storage, at `<dataDir>/memory/lab-32-workflows.db`. Its steps:
  1. `createAccount` (side effect);
  2. `chargeFee` (side effect);
  3. `draftRequest`, an agent call that writes the request-for-documents message (a paid side effect);
  4. `awaitDocuments`, which suspends with `{ required, message }`. On resume it validates the documents, and suspends again with the remaining requirements if any are missing;
  5. `activate` (side effect).
- **Side-effect ledger.** Each side effect appends to a JSON-lines ledger next to the database, keyed by an application lineage id. The checks count side effects from this ledger.
- **Actions** (input `action`):
  - `demo`, the self-contained default:
    1. start, and the run suspends;
    2. "restart": close the store, then build a fresh `Mastra` and storage client on the same file;
    3. inspect the persisted snapshot;
    4. resume with the documents, so the run continues and activates;
    5. try a duplicate resume, which must be rejected.
  - `start`: start and suspend, then return the workflow run id. The learner can restart the API for real.
  - `inspect`: show the snapshot status, suspended step, suspend payload and ledger for a run id.
  - `resume`: resume a persisted run id with the documents.
- **Contrast `checkpointStyle: rerun`** (demo only): "resume" by starting a new run with the documents up front. `createAccount`, `chargeFee` and `draftRequest` run again, the ledger shows duplicates, and the no-duplicate check fails.
- **Real restart test.** A worker script starts the workflow in one Node process and resumes it in another. The test asserts the pre-checkpoint side effects happened once.
- **Release gates.** A new item in `docs/RELEASE-GATES.md`: bind workflow runs to the learner (`resourceId`) before public exposure.

## Capabilities

### New Capabilities

- `course-labs/lab-32-suspend-and-resume`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-32/` and `docs/RELEASE-GATES.md`. Uses the existing durable memory service for storage. Offline is free. Live mode makes one model call per started run; resumes make none.
