# Tasks

- [x] Migration copies `memory/*.jsonl` sidecar files; test with a workflow store and its ledger
- [x] `storage-scope.ts`: `storageScopeOf`, `progressKey`, `scratchKey`, `claimGuest`, with unit tests
- [x] `LocalStorageProgressStore.setScope` and `ProgressScopeSync` in `AuthProvider`; tests for sign-in, sign-out and a second learner
- [x] Scratchpad keyed per learner scope; test that a second learner does not see the first learner's notes
- [x] Document browser scoping and the migration rule in `docs/AUTH.md`
- [x] Course prompt pack in `course-prompts/` (originals, follow-ups including L62a, build order), linked from the README
- [x] `npm run verify`, `npm run test:e2e`, API live suite
