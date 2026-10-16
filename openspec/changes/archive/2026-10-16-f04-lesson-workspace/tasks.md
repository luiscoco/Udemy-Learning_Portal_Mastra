# Tasks

## 1. Client foundations

- [x] 1.1 SSE stream parser + run API client (start, cancel, stream with reconnect) — verify unit tests incl. malformed frames
- [x] 1.2 `useLabRun` reducer — verify reducer tests (tokens, tool pairing, terminal states)
- [x] 1.3 `useProgressActions` + `prediction` field — verify tests

## 2. Workspace UI

- [x] 2.1 Tabs component (ARIA, keyboard, `?tab=`) — verify tests
- [x] 2.2 Learn tab (concept, diagram, procedure, prediction, hints, mistakes, challenge, mark read) — verify tests
- [x] 2.3 Run tab (preflight, dynamic form, mode/cost notice, run/cancel, timeline, trace, result/checks, errors) — verify tests with stubbed streams
- [x] 2.4 Source tab (highlighting, pinned versions, copy, download, exercise scratchpad, solution reveal, error+retry) — verify tests
- [x] 2.5 Quiz, self-check, notes, instructor panel + JSON export — verify tests

## 3. End-to-end

- [x] 3.1 Playwright dummy scenario: read lesson, run, cancel, inspect source, quiz, reload persistence, axe scans — verify `npm run test:e2e`
- [x] 3.2 `npm run verify` green; README updated

## Workflow follow-up

- Archive with `npx openspec archive f04-lesson-workspace -y` and commit.
