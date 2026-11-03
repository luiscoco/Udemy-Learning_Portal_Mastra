# F02 — Typed lab contracts, engine, and events

**Module:** Foundation · **Step 2 of 91**

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [F01](F01-monorepo-openspec-and-developer-foundation.md) · Next: [F03](F03-home-navigation-design-system-and-course-map.md)

## Copy-ready prompt

Implement foundation milestone F02 — Typed lab contracts, engine, and events for the Mastra Udemy learning platform.

Requirements: Implement Zod schemas and TypeScript interfaces LabDefinition, LabModule, LessonGuide, ExecutionRequest, ExecutionEvent (log, token, tool-start, tool-finish, workflow-step, result, error, complete), ValidationResult, QuizQuestion, ProgressRecord, ApiError. Build safe registry and LabRunner with request IDs, correlation IDs, explicit start/stop, AbortController, deadlines, concurrency limits, SSE streaming with cleanup, canonical error mapping and safe logging. Implement deterministic offline Dummy Lab 00. Separate lab orchestration from Mastra adapters.

Definition of done: Validate invalid inputs and unknown labs; run/cancel/stream Dummy Lab 00; disconnect closes stream; tests demonstrate abort, timeout, error and no client secrets.

Before writing code, create the corresponding OpenSpec change (proposal, specs, design, tasks), validate current APIs, and review scope. Then implement, run relevant lint/typecheck/unit/integration/e2e checks, and report files changed and test evidence. Maintain compatibility with the already completed milestones. Do not implement real Lab 01–75 here.
