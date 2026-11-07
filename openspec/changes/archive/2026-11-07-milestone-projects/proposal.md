## Why
Students need cumulative projects that connect individual Mastra labs into usable applications. The referenced portal provides Study Coach, Evaluation Studio and Publishing Studio with 22 staged build prompts; this course currently has no milestone project area.

## What Changes
- Add a discoverable projects hub and three dedicated Mastra workspaces inside the existing portal, preserving lesson routes and course progress.
- Deliver 22 ordered build stages with editable/copyable prompts, linked labs, evidence criteria, independent learner-scoped browser progress and downloadable starter material.
- Study Coach provides a course-wide topic path, source inspection, recognition checks and explicit offline/live guidance.
- Evaluation Studio executes registered labs through the existing typed API, showing input, events, checks, cancellation/approval controls and bounded review history.
- Publishing Studio turns selected completed guidance into reviewable Markdown, Word, PDF and SVG/PNG artifacts with explicit provenance and local reference-image styling.
- Keep paid calls explicit and bounded through existing server adapters; no student code execution or process launch endpoint.

## Capabilities
### New Capabilities
- `platform/milestone-projects`: cumulative project workspaces, learning stages, evidence and artifact production.
### Modified Capabilities
None. Existing lesson execution, Tutor, auth and course progress contracts remain unchanged.

## Impact
Browser-safe project catalog, shared React components, routes/navigation, account-scoped local project state, artifact builders and examples/docs/tests. Reuse current SDK/API and pinned Mastra version. Integrated workspaces replace the reference's extra local server-launch machinery; no new public API or credential surface is required.
