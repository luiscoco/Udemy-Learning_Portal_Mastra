# Infographic Content and Exercise Walkthrough

Every available lesson has two additional tabs after Learn, Run and Source:

- **Infographic Content** (`?tab=infographic`): a lesson-specific four-stage concept map, actual reference-code excerpt, objectives, input labels and expected evidence.
- **Exercise Walkthrough** (`?tab=walkthrough`): a separate six-phase poster and guided practice sequence: understand the goal, prepare, run a baseline, inspect evidence, change one scenario, explain and record.

The original three tabs and default Learn selection remain unchanged. Legacy links such as `/?lesson=lab-03&tab=infographic` retain the requested tab. New course-map exports include both links.

## Visual and content references

Reviewed [the reference portal](https://github.com/luiscoco/Udemy-Claude-Agent-SDK-Student-Rebuild/tree/777d8479b62fddf5cd62df86fb048d589ed43a7c), particularly `src/Infographic.tsx`, `src/App.tsx` and its course visuals. The owner also supplied six approved Lesson 3 infographic images. Their white canvas, pale blue/mint/violet panels, numbered flows, illustrated icons/robot and dark code windows guide the new artwork.

These are original scalable SVG teaching posters, not reused Claude SDK images. Each uses this portal's stable lab number, registered Mastra teaching content and reference code. The supplied video Lesson 3 discusses project setup; the portal's **Lab 03** is **Create and register a first agent**, so its poster teaches agent registration rather than renumbering the course. Compatibility remains tied to the portal's installed and tested versions.

## Use the guides

Both visual tabs also offer an original prerecorded Inworld **Guided Narrated Learning Tour**, with timed red region/word highlighting and follow-scrolling. It uses this portal's Mastra content; see [NARRATED-TOURS.md](NARRATED-TOURS.md).

1. Start `npm run dev`, sign in and open `/labs/lab-03?tab=infographic`.
2. Use **Fit**, **Zoom in/out** or **100%**. Zoomed diagrams scroll within a focusable viewport; use arrow keys, scrollbars or pointer dragging. **Fullscreen** opens a native dialog; Escape/Close returns focus to its launcher.
3. Download a self-contained **SVG**, full-HD **PNG** (1920 × 1080), or full **text** summary. Image text uses short excerpts; the readable summary below the poster retains the complete teaching content and code. Export failures are reported accessibly and alternate formats remain available.
4. Open **Exercise Walkthrough**, select a phase or use Previous/Next. Its actions open Learn, Run, Source or My notes. Phase 3 shows the actual example input; phase 4 lists the lab's real checks; phase 5 uses its challenge and success criteria.

Reading, zooming, downloading or stepping through guidance makes no provider calls, starts no execution and changes no progress or scores. Opening Run preserves current inputs and ongoing runs; learners press Run themselves. Live execution can incur charges as disclosed in Run. Source links preserve the existing hidden-solution reveal control. Walkthrough phase position survives tab changes during the current lesson/account visit; it is not saved across reloads.

## Content and implementation

`apps/web/src/features/visual-guides/content.ts` defines 76 distinct four-stage editorial flows, aligned to actual module/lab topics, and derives six-phase guidance from each validated LabDefinition. It uses objectives, concept, prerequisites, procedure, example input, expected evidence, check descriptors and challenge. No Mastra methods, model identifiers or execution capabilities are invented by this layer.

Code is selected through the existing typed Source API, from declared non-solution TypeScript/JSON reference files. Excerpts identify the path and starting line, clearly say surrounding setup is omitted, use syntax colours in the poster and a copyable code block in the readable view, and link to the full source. No server implementation/configuration files are bundled into frontend JavaScript to implement snippets. Root `.env` and learner scratch code are never read or executed.

`LessonPoster.tsx` renders original vector artwork with escaped text and no external images, fonts or embedded HTML. `PosterViewer.tsx` provides bounded zoom, scrolling, panning, native fullscreen and export. `VisualStudyTab.tsx` combines the viewer with source-load recovery, full summaries and learner-controlled phase navigation. `visual-guides.css`, `LabWorkspace.tsx` and the legacy-link helper integrate the responsive five-tab layout. The progress schema, runtime, server routes and existing lab implementations are unchanged.

This implementation does not copy the reference portal's Claude-specific recorded narration or introduce a separate graded workbook, saved walkthrough-completion system or automatic exercise driver. The diagrams are teaching aids, not execution traces or proof of provider access. They require no new dependencies or paid generation.

## Verification

Content tests check all 76 registered lessons for distinct flows, six complete phases and source-backed non-solution excerpts. Component/integration tests cover escaped coloured SVG text, zoom limits, fullscreen/focus, export failure cleanup, unchanged inputs/progress, phase retention and source-load retry.

- `npm run verify` with `VITEST_MAX_WORKERS=2`: **passed**, including lint, all workspace TypeScript checks, **1,751 passing / 84 skipped tests**, production builds and the browser-bundle secrets scan. All **91 specifications** also pass strict validation after the four new workspace requirements were synced. The first unrestricted run had three timing failures in existing L21 subprocess, L46 connection-deadline and L65 cancellation tests; all passed unchanged in the complete bounded repeat. Logs: `.data/visual-guides-verify.log` and `.data/visual-guides-verify-bounded.log`.
- Focused browser coverage passed for both desktop and mobile: both themes, labs 03/26/75, 320px layout, WCAG scans, legacy deep links, actual active-run cancellation/state preservation, hidden-solution controls, phase retention and notes focus. SVG, 1920 × 1080 PNG and Markdown downloads succeeded in both projects. Native poster exports and screenshots were visually inspected.
- Full `npm run test:e2e`: **passed, 279 passing / 158 intentionally skipped**, across desktop and mobile (14.1 minutes), including all six new visual-guide browser cases. Log: `.data/visual-guides-e2e.log`.
- `git diff --check`: passed. Existing build warnings concern bundle size and Tailwind source maps; they do not fail the build.

Screenshots and export evidence are stored under `.data/visual-guides/`. Main implementation paths are `apps/web/src/features/visual-guides/content.ts`, `apps/web/src/components/workspace/{LessonPoster,PosterViewer,VisualStudyTab}.tsx`, `visual-guides.css`, `LabWorkspace.tsx`, `apps/web/src/components/layout/AppShell.tsx` and `scripts/course-release.ts`. Tests are `packages/labs/src/visual-guides.test.ts`, `apps/web/src/components/workspace/PosterViewer.test.tsx`, `apps/web/src/workspace.test.tsx` and `e2e/visual-guides.spec.ts`.

Provider/model usage for this change: **zero calls, zero paid generation**. No new unsupported Mastra capability or dependency is introduced. Recorded narration and saved phase completion are outside this change's scope; the documented phase reset on reload remains its main study-navigation limitation.
