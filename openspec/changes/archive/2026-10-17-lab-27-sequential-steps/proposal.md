# Proposal

## Why

Real workflows chain several steps, and each step's output becomes the next step's input. Learners need to see:

- how steps are composed (`.then()` and `.map()`);
- how data and types flow between steps;
- that Mastra checks every transition at runtime against the next step's input schema;
- an ordered event trace for the whole pipeline.

## What Changes

- **New lab `lab-27`** (Module 06): an `invite-workflow` that runs `parse → enrich → map → render` on a free-text event invitation.
  - **`parse`** uses an agent with structured output to produce `{ title, date, time, city, room, organiser }`.
  - **`enrich`** is deterministic. It adds the weekday, days until the event, the IANA time zone, the UTC start time and the venue address from a mock directory. It reads the learner-set reference date from the workflow input through `getInitData()`.
  - **`.map()`** selects and renames the fields the renderer needs. It appears as its own step in the path.
  - **`render`** produces a Markdown card and an `.ics` calendar entry.
- **Toggle `brokenEnrich`.** It returns `daysUntil` as text. The schema-less mapping step passes it on, then Mastra stops the run at `render`'s input with `WORKFLOW_STEP_INPUT_VALIDATION_FAILED`, the trace shows `enrich: success` followed by a failure, and `render`'s execute never runs.
- **Checks:** the exact event order, every transition matching the next step's input schema (re-checked by the lab against the exported schemas), the final output validated (L26 wrapper), and correct dates and times.

## Capabilities

### New Capabilities

- `course-labs/lab-27-sequential-steps`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-27/`. It reuses `shared/workflow-stream.ts`. Offline is free. Live mode makes one structured-output call.
