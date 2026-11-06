## Context
The reference LiveTutor is a fresh-question programming helper with example prompts, live streaming and stop-receiving semantics. This platform instead uses server-only Mastra Agent, typed Express APIs and SSE, account-scoped progress and reusable safe Markdown. Installed core is 1.79.0; stream, textStream, abortSignal, finishReason and modelSettings are available in its declarations and packaged streaming reference.

## Goals / Non-Goals
Goals: contextual help in every lesson, clear free/live provenance, safe formatted incremental answers, keyboard/mobile access, bounded authenticated server execution and repeatable offline verification.
Non-goals: managed OpenAI session IDs, tutor tools/code execution, web search, speech narration, grading or automatic completion, durable tutor transcripts, or continuing a previous provider conversation. Each question starts fresh, matching the reference tutor.

## Decisions
- Use a new lesson-tutor capability and two additive routes: public GET /api/tutor/settings and authenticated POST /api/tutor/answer streaming SSE. A subject header binds a stale tab to its account; no client-supplied session IDs or prompts/instructions are accepted. No changes to lesson execution contracts or catalog counts.
- Reuse existing ModelService and Mastra Agent.stream. The server builds bounded context from its registered lesson concept, objectives, procedure, hints and common mistakes. No solution source, quiz answer keys, learner notes or arbitrary files enter the prompt. Treat questions/context as untrusted data; expose no tools.
- Offline gives authored guidance derived from the selected lesson and question category, explicitly labelled as deterministic guidance. Live lists configured allowlisted models and never silently falls back. One step, 2,048 output tokens, zero retries, <=60-second server deadline, bounded answer size and shared start-rate policy; separate tutor global/per-user concurrency bounds.
- Typed SSE snapshots with ordered sequence numbers and explicit started/text/complete/error events. Client rejects incomplete EOF and contract/identity drift, bounds its stream, cancels its reader and never automatically retries a paid request. Server aborts on disconnect/deadline/drain and races uncooperative providers against deadline.
- A native modal panel launched from each lesson header provides examples, mode/model selection, question validation, answer formatting, visible status, stop/retry/reset and close. Close, navigation and account changes abort observation and discard late updates. Fresh requests do not change progress or run checks.
- Mask configured secrets in questions sent to providers, output and safe errors; avoid logging prompts/provider payloads. Configuration presence does not assert billing/access. Stopping observation requests server/provider abort but does not confirm remote cancellation.

## Risks / Trade-offs
Live answers may be wrong and incur charges; explain both before submission. Offline guidance is not generative AI. Incomplete Markdown is formatted as it arrives. No recovery/replay for tutor requests avoids accidental duplicate paid calls. Transcripts are temporary and clear on reload/navigation. Existing lab execution quotas are separate from the bounded tutor pool.
