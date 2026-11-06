## Context
The existing five-tab workspace keeps panels mounted. Source files arrive through the typed client; solutions are hidden. Visual guides already render original 1920x1080 SVGs and accessible full text. The reference's Guide.tsx uses seven recorded sections and manual action waits; CodeNarration.tsx maps narration to checked source ranges; Infographic.tsx highlights fixed artwork regions and stops when inactive.

## Goals / Non-Goals
Provide actual recorded MP3 playback and visual focus on all requested surfaces and all 76 lessons. No browser speech dependency, copied Claude recordings, new SDK methods, automatic exercise driver, saved completion migration or paid runtime service. No downloadable learner audio generation endpoint. Tours use readonly teaching baselines, not learner drafts or execution results.

## Decisions
- User selected Inworld AI and exact parameters: Yash, inworld-tts-2, enhanceGeneration true, BALANCED, audioConfig.speakingRate 1.25, MP3/48000 Hz, language omitted. Use the documented REST API with the complete Basic credential from ignored .env. Record paid processed-character usage and a price estimate. No browser or local-voice substitution.
- Share exercise narration between Run and the walkthrough poster, with separate source and infographic tours (228 tour entries). Request script PER_UTTERANCE output and WORD timings so each section has independently playable audio and exact end events. Bound each request to 2000 UTF-16 units; cache content/settings-bound successful results for resumable authoring. Playback speed starts at 1.0 because recordings are already at 1.25x.
- Browser-safe models derive captions from actual definitions and source-backed ranges. Source tour uses the main declared non-solution TypeScript reference (prefer run.ts), names it explicitly and highlights bounded ranges in the complete colour-coded file. No server files are statically bundled into JavaScript; reference content uses the existing Source API. All diagram rectangles share the poster's actual coordinates.
- Load per-lesson static manifests only on playback. Bind each recording to current steps/source with SHA-256. Fetch bounded same-origin hash-named MP3s, verify size/digest and create a blob URL before playback. Abort requests and generation-guard late results on section changes/close/unmount. Retain at most the current recording URL and revoke it on cleanup. Do not cache stale media or silently play a mismatched transcript.
- One accessible native dialog reader per active tour provides captions, synchronized range/region focus, step selection, playback/seek controls, replay, speed and optional auto-next (disabled for exercise steps). Tour launch and media playback are explicit user actions. Use no automatic exercise clicks, input updates, solution reveals or progress writes. Close returns to the launcher; underlying Run state remains mounted.
- Preserve poster zoom/download/fullscreen and provide fit/zoom in the tour reader. Source supports wrap/follow and internal scrolling. Text remains available on playback failure. Provider word cues may normalize punctuation/numbers, so retain the full authored caption alongside spoken-word highlighting.

## Risks / Trade-offs
- Provider quota/credits may interrupt generation: retain verified sections and resume without recharging completed content; report missing media honestly.
- Media increases download size: lazy load only the selected clip; expand release-archive media allowances only for hash-named verified tour MP3s and keep bounded total size.
- Source or caption edits invalidate recordings: fail closed on content mismatch and regenerate with the authoring command.
- Async media races or decode failures: abort/generation guards, URL cleanup, explicit error/retry and manual captions.
- Long diagrams/code on phones: internal scrolling, fit/zoom and bounded readable source with matching line labels.

## Migration Plan
Add only web/static media and authoring scripts. No contracts, server routes, runtime or progress data migration. Removing launchers disables the feature without changing existing exercises.

## Timed visual focus
The owner additionally requires timed red rectangles and vertical follow-scrolling. Draw red SVG rectangles on the exact narrated poster region; outline active exercise paragraphs and source line blocks; use provider word times for the current spoken caption text. Default Follow narration to enabled, scroll only the relevant reader to reveal offscreen targets, and preserve keyboard control focus. Disable following for manual inspection. Seeking uses the same audio clock, including changed playback rates.
