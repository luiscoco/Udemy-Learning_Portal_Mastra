# Proposal

## Why

Labs that call `agent.generate()` (for example lab 06, Basic text generation) return the whole answer at once and emit no token events. The Run tab's Live output panel still promised "Streamed tokens appear here" and stayed empty, although the answer existed in the result. A learner reported this as missing tokens.

## What Changes

- Live output shows streamed tokens when there are any, as before.
- When a run finishes without tokens and its result has a top-level `text` or `answer` string, Live output shows that complete answer with a note that it was not streamed.
- Otherwise, after the run, the panel says that no tokens were streamed.
- Before a run, the placeholder explains both behaviours.

## Capabilities

### Modified Capabilities

- `lesson-workspace`

## Impact

`apps/web` only (`RunTab.tsx`, `run-state.ts`), with a unit test and an e2e test. No contract or API change.
