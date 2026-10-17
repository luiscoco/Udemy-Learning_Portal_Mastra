# Design

## Context

Verified against the installed `@mastra/core` 1.78.0 with `@mastra/libsql` 1.26.2. The spike used two Node processes on one database file.

- **Suspending.** A step declaring `suspendSchema`/`resumeSchema` that calls `suspend(payload)` ends the run with `status: 'suspended'`, `suspended: [['awaitDocs']]` and `steps.awaitDocs.suspendPayload`. The snapshot is persisted to storage when the workflow is registered on `new Mastra({ workflows, storage })`.
- **Resuming in a new process.** `mastra.getWorkflow(id).createRun({ runId })` followed by `.resume({ step, resumeData })` continued the run:
  - steps before the checkpoint did **not** run again, and the ledger showed `charge` once, from the first process's pid;
  - the suspended step re-entered with `resumeData` and its earlier `suspendData`;
  - later steps ran in the new process.
- **Streaming the resume.** `resumeStream` emits only the resumed steps, with the same chunk types as `stream`.
- **Guards.** Mastra guards resumes itself:

  | Case | Mastra's response | Run afterwards |
  | --- | --- | --- |
  | Invalid resume data | `Invalid resume data` | stays suspended |
  | Wrong step | `This workflow step "x" was not suspended. Available suspended steps: [...]` | — |
  | Completed or unknown run | `This workflow run was not suspended` | — |
  | Two concurrent resumes | one succeeds; the other gets `This suspended workflow run was already resumed by another caller` | — |

- **Inspection.** `getWorkflowRunById(runId)` returns the persisted snapshot (`status`, `steps`, `suspendedPaths`, …). `listWorkflowRuns({ status })` exists.

## Decisions

- **Storage.** The lab opens the existing durable memory service (`services.memory.open('lab-32-workflows')`) and passes `opened.storage` to `new Mastra({ workflows: { … }, storage, logger: false })`. It is closed in `finally`.
- **"Restart" in the demo.** The lab closes the first instance and builds a new `Mastra`, workflow and storage client on the same file, sharing no objects. The run log labels this as an in-process restart. A separate integration test proves a real process restart.
- **Ledger.** The ledger is app-level: a JSON-lines file at `<memoryDir>/lab-32-ledger.jsonl` with entries `{ lineage, workflowRunId, op, pid, at }`. Duplicates are counted per `lineage` (the application), so a rerun under a new workflow run id is still caught.
  - For `start` and `demo`, the lineage is the first workflow run id.
  - In `rerun` style, the replacement run carries the original lineage in its input.
- **Resume errors become typed outcomes:**
  - `UNKNOWN_RUN` when there is no snapshot;
  - `NOT_SUSPENDED`;
  - `INVALID_RESUME_DATA`;
  - `ALREADY_RESUMED`;
  - `WRONG_STEP`.

  Mastra's message is shown, and it contains no paths.
- **Input.** `action`, `applicant { applicationId, name, email, plan }`, `documents` (resume data) and `workflowRunId` (UUID; visible for inspect and resume). `checkpointStyle` is visible for demo only. A UUID is required for resume and inspect.
- **Checks** (demo, and resume where they apply):
  - `suspended-at-checkpoint`;
  - `snapshot-persisted`: the status was read back from a fresh instance;
  - `resumed-from-checkpoint`: the resume trace contains no pre-checkpoint step, and the run succeeded;
  - `no-duplicate-side-effects`;
  - `duplicate-resume-rejected` (demo).
- **Ownership.** The workflow run id is an unguessable UUID, and runs are tagged `resourceId: 'learner'`. Binding runs to authenticated learners is a release gate.

## Risks

- **Windows file locks.** On Windows the libSQL client holds the file until GC. Reopening the same file in-process works, as L21 showed, and tests use `testMemoryDir`.
- **The ledger grows.** It grows per learner action and is local. `inspect` reads only the lines for one lineage.
