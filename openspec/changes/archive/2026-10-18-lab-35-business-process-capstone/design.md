# Design

## Context

Verified against the installed `@mastra/core` 1.78.0, in a spike with `.parallel → merge → .branch → report` on libSQL storage:

- **Suspend and resume inside a branch.** A step inside `.branch()` can suspend. `resume({ step: 'humanReview', resumeData })` resumes it.
- **Re-suspension.** The step can suspend again on a resume, for example after a control violation. The next resume continues, and `resumeStream` emits only `humanReview` and `report`.
- **The step after `.branch()` receives a key for every branch step.** Branches that did not run are present with the value `undefined`, for example `{ auto: {...}, human: undefined }`. The report must take the defined key. L29's `finalizeRouting` already filters undefined keys, and its COMPATIBILITY row is refined accordingly.
- **Parallel join.** `.parallel()` joins by step id (L28).

## Decisions

- **Deterministic routing, narrative-only agent.** Risk scoring and routing are rules, so every branch is reproducible offline and live. The agent writes only the report summary, from the typed findings, and never decides.
- **Simulated sources** are small in-code datasets (`REGISTRY`, `SANCTIONS`, `HIGH_RISK_COUNTRIES`, media keywords). The trace marks them `source: simulated`.
- **Controls are a pure function.** `checkControls(case, riskLevel, attempt, enforced)` returns violation codes. The step applies it on every resume:
  - with violations, it suspends again with `{ violations, attemptsUsed, remaining }`;
  - with `controls: disabled`, it skips the check. That is the anti-pattern, labelled.
  - When `MAX_ATTEMPTS` (3) is exhausted, the case ends pending, and the report says `pending-review`.
- **Audit trail.** Every attempt is recorded app-side, with reviewer, role, decision, accepted or refused, and violation codes, and included in the report.
- **Batch.** 1–4 cases, each its own run, with `workflowId` = `vendor-due-diligence#<caseId>`. After start, the review phase uses a fresh `Mastra` instance on the same storage, showing that reviews can happen after a restart.
- **Checks:**
  - `correct-branch`: the branch matches `expectBranch`, one of `auto-approved`, `approved`, `rejected`, `blocked` or `pending-review`;
  - `reviewer-controls-enforced`: no accepted attempt has violations, and every refused attempt names its violations;
  - `no-unreviewed-decision`: `approved`/`rejected` only with an accepted human attempt, `auto-approved` only for low, and `blocked` never reviewed;
  - `trace-complete`: each case's trace contains intake, the three research steps, riskReview, its branch step and report, in order;
  - `report-complete`: findings, risk, decision and audit are present, and the summary is not empty.

## Risks

- **Live summaries vary.** Checks assert only that the summary is not empty.
