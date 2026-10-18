# Proposal

## Why

Module 07 ends with a capstone that combines the workflow patterns into one realistic business process: parallel research, conditional routing, a durable human approval with enforced reviewer controls, and a report with a full trace. Learners should finish the module able to build such a process and prove two things: every branch behaves correctly, and the reviewer cannot bypass the controls.

## What Changes

- **New lab `lab-35`** (Module 07): a `vendor-due-diligence` workflow on a libSQL-backed `Mastra` instance (`lab-35-workflows`). Its steps:
  1. **`intake`** normalises and validates the vendor request.
  2. **`.parallel([registryLookup, sanctionsScreen, mediaScan])`** queries simulated sources: a company registry, a sanctions list and adverse-media keywords. The data is deterministic and labelled as simulated.
  3. **`riskReview`** applies a deterministic score:
     - +2 when the vendor is not in the registry;
     - +2 for a high-risk country;
     - +2 for adverse media;
     - +1 when spend is above 100,000;
     - a sanctions hit means `blocked`.

     The score maps to a risk level of `low` (0–1), `medium` (2–3), `high` (4+) or `blocked`.
  4. **`.branch()`** with mutually exclusive predicates:
     - `autoApprove` (low);
     - `humanReview` (medium or high), which suspends;
     - `autoBlock` (blocked).
  5. **`report`**: a typed record plus an agent-written summary for the file.
- **Reviewer controls,** enforced inside `humanReview` on every resume:
  - **SOD:** the reviewer must not be the requester;
  - **AUTHORITY:** medium needs `manager` or `senior`, and high needs `senior`;
  - **RATIONALE:** at least 20 characters.

  A violating attempt is refused: the step suspends again with the violations, and the attempt is kept in the audit trail. The review must also finish within 3 attempts.
- **Input.** Each case lists ordered `reviewAttempts`. The example covers every branch:
  - low, auto-approved;
  - medium, where a self-approval is refused and then a manager approves;
  - high, where a manager is refused and then a senior rejects;
  - blocked.
- **Contrast `controls: disabled`:** the self-approval is accepted, and the controls check fails.
- **Checks:**
  - `correct-branch`;
  - `reviewer-controls-enforced`;
  - `no-unreviewed-decision`;
  - `trace-complete`;
  - `report-complete`.

## Capabilities

### New Capabilities

- `course-labs/lab-35-business-process-capstone`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-35/`. `docs/COMPATIBILITY.md` gains a refinement of the L29 `.branch()` row: non-executed branch keys are present with `undefined`. Offline is free. Live mode makes one model call per case (the report summary).
