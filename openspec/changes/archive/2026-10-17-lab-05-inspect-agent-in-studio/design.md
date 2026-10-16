# Design

## Context

Verified by running `mastra dev` (mastra 1.34.2, @mastra/core 1.78.0) in the reference project: Studio serves `<title>Mastra Studio</title>` at `/`, the API at `/api`, and `GET /api/agents` returns an object keyed by agent id with `name`, `instructions`, `provider`, `modelId`, `tools`. Only one dev server may run per project (the CLI refuses a second instance).

## Decisions

- **Reference project as a workspace** (`examples/course-project`) so learners can run Studio without creating anything; tests keep it byte-identical to the Lab 01 template defaults.
- **Server-side probe, not browser fetch**: avoids CORS issues and keeps the learner's browser from being used against local ports; inputs are restricted to loopback origins.
- **Recorded fixture** captured from the real server; a test ties it to the reference project's agent file.
- **Launch link** returned in the result; Learn tab instructs opening Studio in a new tab. No iframe anywhere.

## Risks / Trade-offs

- [Loopback probe is still a small SSRF surface on a shared server] → disabled in production, fixed paths only, response summarised (raw body not returned).
- [Studio API shape may change in future Mastra versions] → recorded-response test + live verification steps in docs.
