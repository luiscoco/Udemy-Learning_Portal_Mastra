# Proposal

## Why

Mastra Studio is the primary debugging tool learners will use every day. They must start a real local Studio session, know how it differs from this platform, and never embed it unsafely.

## What Changes

- New workspace `examples/course-project`: a real Mastra project (same files as the Lab 01 template defaults) with the `mastra` CLI; root script `npm run studio` runs `mastra dev` (Studio on http://localhost:4111).
- New lab `lab-05` (Module 01): learners start Studio, open it in a separate tab, and the API server probes `GET <studio>/api/agents` and `/` on **loopback only** (3 s timeout, no redirects; disabled when `NODE_ENV=production`). A recorded real response (captured from `mastra 1.34.2`) supports learning without setup and deterministic tests.
- Result: agent list, selected agent's provider/model/instructions/tools, launch link and a Studio vs LMS comparison. Unreachable Studio completes with failed checks and an actionable hint.

## Capabilities

### New Capabilities

- `course-labs/lab-05-inspect-agent-in-studio`

### Modified Capabilities

(none)

## Impact

New workspace + `mastra@1.34.2` dev dependency; `packages/labs/src/lab-05/`.
