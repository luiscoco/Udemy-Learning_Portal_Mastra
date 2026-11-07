## Context
See proposal.md. The reference has three standalone apps, 22 stages, prepared/live modes, local evidence and selected-answer publishing. This repository has 76 stable lab routes, an authenticated SDK, resumable execution events, safe Markdown/code rendering and a bounded Tutor endpoint. Installed Mastra core is 1.79.0; current public docs are checked against installed declarations and tested course examples.

## Goals / Non-Goals
Deliver usable cumulative workspaces and learner build material within the existing monorepo. Preserve independent course grading. No process-launch API, arbitrary submitted-code execution, managed multi-device project sync or automatic claim of mastery. Uploaded images supply local deterministic style; image-aware paid planning and general document ingestion are outside this implementation.

## Decisions
- Integrate /projects and /projects/:projectId under the shared shell instead of launching three extra servers. This preserves local identity, accessibility, typed transport and provider boundaries.
- Use browser-safe catalog metadata for 22 M stages, introductory topics and all registered labs. Source comes from the existing safe source endpoint, not raw repository traversal. Counts are derived, not padded to the reference's unrelated Claude counts.
- Reuse the normal Tutor stream for coach/publishing answers, with per-submit live consent and no paid retry. Label offline authored guidance explicitly. Evaluation reuses useLabRun without course progress actions or recovery pointers; capabilities stay in hook memory.
- Persist versioned, validated and bounded project summaries in a separate per-learner localStorage namespace. Handle quota/disabled storage visibly; JSON export provides backup. Account keys remount all project controllers.
- Generate artifacts locally from an immutable selected completed answer. Use fflate (existing exact version) for valid OpenXML DOCX, canvas-rendered paginated PDF for Unicode and coloured code, and escaped SVG plus canvas PNG for bounded infographic excerpts. Raster PDF pages trade searchable text for reliable font rendering; Word retains editable text.
- PNG styling is local, size/dimension checked, re-encoded and never sent to providers. Templates approximate the reference palette and artwork; no claim of AI image generation.
- Ship cumulative prompt downloads and TypeScript learner starter files using the current tested Mastra generation contract. Offline starter checks make no model calls; explicit live execution remains server-side/local Node only.

## Risks / Trade-offs
Large answers/artifacts can consume browser memory -> bound retained answers, history, input and image dimensions; wrap and paginate exports. Browser storage can fail -> keep current work in memory, report failure and offer backup. Streams can outlive a view -> abort on unmount, cancel active evaluation through the existing capability, guard late callbacks. Version-sensitive examples -> pin installed versions and validate TypeScript/offline starter checks.

## Migration Plan
Additive routes/catalog/state only. No lab contract or progress migration. Existing accounts and course links remain valid. Removing project routes leaves existing lesson data intact; project backups are portable JSON.
