# Proposal

## Why

F03 shows only a lab overview. Learners need the actual lesson workspace (read, run, inspect source, self-assess) and instructors need recording assets, all driven generically by each `LabDefinition` so the 75 labs plug in without new UI.

## What Changes

- Lesson workspace with accessible **Learn / Run / Source** tabs (deep-linkable via `?tab=`).
- **Learn**: objectives, prerequisites, concept, diagram slot, procedure, prediction (saved), progressive hints 1–3, common mistakes, challenge, "mark lesson read".
- **Run**: preflight checks, dynamic validated input form from `InputField[]`, mode selector with cost notice, Run/Cancel, SSE timeline with token stream, tool and workflow trace, masked errors with field details, output and automated checks.
- **Source**: syntax-highlighted readonly files with pinned versions, copy and download, exercise instructions with a local scratchpad (never executed), solution reveal control.
- **Quiz** (scored, explanations, retake), **self-check** checklist, **notes** (autosaved), **instructor script** panel with JSON export.
- Progress persisted through the existing `ProgressStore` adapter; lab completion requires lesson read + successful run with passing checks + passed quiz.
- `ProgressRecord` gains optional `prediction` (defaulted, backward compatible).

## Capabilities

### New Capabilities

- `lesson-workspace`: learner and instructor experience for an individual lab.

### Modified Capabilities

(none — `web-shell` requirements unchanged; `lab-contracts` gains only an optional defaulted field)

## Impact

`apps/web` new workspace components and SSE client; dependency `prism-react-renderer@2.4.1`. Only Dummy Lab 00 is executable.
