# Mastra milestone projects

Run the normal portal with npm run dev, then open /projects or choose **Milestone projects** on Home or in the sidebar. The three applications share the local portal server, learner session, theme and typed API. No extra process launcher or additional provider-key store is needed.

This adapts the three-project learning flow and 22 cumulative stages reviewed in [the reference student procedure](https://github.com/luiscoco/Udemy-Claude-Agent-SDK-Student-Rebuild/blob/main/docs/Milestone_Projects_Student_Procedure.md). All examples and lesson mappings are for this Mastra course. The reference's Claude-specific catalog counts and APIs are not copied.

| Project | Build stages | Working reference |
| --- | --- | --- |
| Study Coach | M01-M07 | /projects/study-coach |
| Agent Evaluation Studio | M08-M14 | /projects/evaluation-studio |
| Agent Publishing Studio | M15-M22 | /projects/publishing-studio |

## Build a stage

Open **Build stages and evidence**. Select a stage, read its goal, inspect the linked labs, and copy or download its build prompt. Download the learner starter ZIP for a small Node/TypeScript foundation, exact dependency versions, offline tests and that project's cumulative prompts. It is a starting point for your own implementation, not a completed submission of every stage. Build the browser UI in the same monorepo using the linked reference screens.

Use Node 24 LTS for the starter. Run npm install, npm test, npm run typecheck and npm run demo in the extracted folder. Keep and commit its generated package-lock.json. The portal root lockfile pins the tested runtime: @mastra/core 1.79.0, TypeScript 6.0.3 and Node types 24.19.2. The starter's opt-in local Node live demo requires --live --confirm-live and a privately configured provider environment. Its one-step/time/output bounds are not a billing cap.

Check evidence only after inspecting your own code and actual test results. Keep notes and export the project's JSON evidence. Project criteria, practice feedback and reference executions never complete course lessons.

## Study Coach

Browse 81 topics: five authored foundations and all 76 registered course labs, including orientation, across 17 sections. Search and section filters narrow the selector; Previous/Next follow matching topics. Counts describe teaching activities, not framework feature counts.

Each topic identifies its linked lesson, teaching concept, objectives and safe source reference. Ten editable question shortcuts fill the question field without sending it. Offline answers use authored lesson guidance and a clearly labelled minimal agent teaching excerpt; they are not tailored model answers. Recognition checks reuse a linked lesson question as separate project practice and do not submit a course quiz.

Live uses the existing bounded Tutor stream grounded in the selected lesson's server-owned teaching context. It does not execute tools or verify every feature discussed in a question. Configure a supported provider in the repository-root private .env and set MASTRA_MODE=live, then restart the portal and refresh the project. Select Live and authorize each paid answer. Provider keys alone do not enable the server live-mode gate. Stop, navigation and account changes abort observation; no request is automatically retried.

## Agent Evaluation Studio

Choose one of the 76 registered lab cases and edit its example input JSON. Run Offline for actual deterministic execution events, objective checks and results through the normal authenticated runner. The timeline and tool/workflow inspector show emitted events; human-approval cases expose the existing approval controls. Cancel uses the normal run capability held only in memory.

Live follows that case's own provider/model input, configured readiness and server limits. Selecting a prompt or a case does not enable additional tools. Review and authorize each paid evaluation. Failed, cancelled and successful observed runs remain distinguishable. A successful objective check is not proof of practical mastery.

The last 40 attempt summaries are stored for this learner in this browser. The distinct-case counter describes this retained history, not a lifetime total. Output summaries are excerpts bounded to 12,000 characters; check summaries are bounded to 6,000. Run tokens and session credentials are never stored. Manual review checkboxes remain separate from automatic checks. Full retained execution data remains subject to the normal API run-retention policy.

## Agent Publishing Studio

Ask for guidance, then select a completed answer. Only valid completed streams enter the last-ten-answer library. Editing a new question or selecting another mode does not relabel or replace a retained answer.

Downloads use the selected response's immutable identity, lesson, time and offline/live provenance:

- Markdown preserves the complete teaching response.
- Word is valid OpenXML with editable text, headings and coloured code.
- PDF wraps and paginates the complete response as image-based pages, preserving Unicode and code colours. It is not searchable or tagged for PDF accessibility; use Word/Markdown when editable or accessible text is needed.
- SVG and PNG are 1600 x 900 blue/mint/violet infographics with concept text, an explanatory flow and a bounded, labelled code excerpt. Use Word/PDF for the full answer.

An optional PNG reference is inspected and re-encoded locally, at most 2 MB, 4096 pixels per side and 16 megapixels. Its sampled palette and artwork provide approximate deterministic styling. The image never goes to a provider, is not retained across navigation, and does not authorize an AI planning or image-generation call.

## Persistence and boundaries

Project evidence is versioned, bounded and stored per learner and project under a separate browser namespace. Text size is saved per project; the shared theme uses the portal preference. Storage failure or malformed data produces a visible warning and leaves current work available for JSON export. Browser profiles are not a secure shared-device vault: keep backups private and use separate OS/browser profiles when necessary.

There is no managed multi-device project sync, file-ingestion service, image-aware paid planning or standalone server-launch API. These are explicit differences from the reference apps. The reference workspaces reuse the existing typed SDK and protected server APIs; no student-supplied TypeScript executes in the API process. Provider credentials remain on the server.

## Implementation and verification

The catalog and stages are in packages/lab-catalog/src/projects.ts. Routes and navigation point to apps/web/src/pages/ProjectsPage.tsx. Project state, answer controls, actual evaluation, artifact builders and downloadable starter generation live in apps/web/src/features/projects/.

Focused tests cover catalog/lesson mappings, versioned learner isolation, malformed or blocked storage, Word/XML escaping and code colours, PDF byte offsets, starter offline execution and Mastra type compatibility, paid consent, incomplete/stopped streams and session recovery. Browser coverage is in e2e/milestone-projects.spec.ts.

Verification evidence:

- npm run verify passed lint, strict TypeScript, 1,788 tests (84 optional skips), production builds and the browser bundle-secret scan. Evidence: .data/milestone-verify.log and .data/milestone-verify.exit (0).
- npm run test:e2e passed the complete course suite: 297 passed, 158 optional/viewport skips, exit 0. Evidence: .data/milestone-e2e.log and .data/milestone-e2e.exit.
- The focused milestone acceptance passed 9 tests including setup across desktop/mobile: real offline success/failure/cancellation/approval, unchanged lesson progress, learner isolation, incomplete-stream refusal, fresh live consent and all artifact downloads. Both Study Coach themes passed serious/critical WCAG A/AA checks and viewport overflow checks.
- All 92 main specifications passed strict validation. Generated starter tests execute 9 native offline checks and semantically compile against the pinned Mastra declarations.
- Downloaded PDFs were parsed and rendered with the available PDF engine; every page of the two-page sample and the PNG infographic were visually inspected. The review corrected code clipping, word wrapping and a header-control contrast problem. A final regression assertion preserves inline identifiers such as __dirname__ and literal Markdown-shaped code.

Normal tests and exports made no paid provider calls. Live browser tests use deterministic SSE fixtures; real provider access/billing and image-aware AI layout planning are not verified by these tests. Project artifacts remain browser-local, and PDF pages are image-based as described above. Screenshots, downloads and rendered review pages are under the ignored .data/milestone-qa directory.

The final formatter correction passed the export regression assertions in .data/milestone-inline-tests.log. The final npm run verify rerun passed all 1,788 tests and all other gates, exit 0 (.data/milestone-verify-final.log and .exit). A rebuilt desktop/mobile publishing smoke test passed all 3 selected cases including setup, exit 0 (.data/milestone-publishing-final.log and .exit). No new unsupported capabilities or unresolved implementation failures were found beyond the explicit boundaries above. The completed OpenSpec change is archived under openspec/changes/archive/2026-11-07-milestone-projects/.
