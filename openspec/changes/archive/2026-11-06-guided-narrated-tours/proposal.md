## Why
Learners can read Mastra exercises, source and posters but cannot yet listen to a guided explanation with synchronized visual focus. The reference portal demonstrates separate narrated exercise, code and infographic tours that should be adapted to this platform's actual content.

## What Changes
- Add an explicit Guided Narrated Learning Tour launcher in Run, Source, Infographic Content and Exercise Walkthrough for all 76 lessons.
- Explain actual exercise inputs/evidence, source-backed TypeScript sections with line ranges, and highlighted infographic regions with full captions.
- Provide learner-controlled start, pause, resume, replay, previous/next, step selection, speed and close controls in an accessible responsive reader.
- Bundle original prerecorded English MP3s from Inworld AI with matching captions and integrity manifests. Use the owner's exact Yash/TTS-2/Enhanced/Balanced/1.25x/48kHz settings with language omitted. Playback requires no provider key or browser speech engine.
- Stop narration on view/lesson/account changes, close and unmount; preserve drafts, solutions, executions and progress.

## Capabilities
### New Capabilities
None.
### Modified Capabilities
- `lesson-workspace`: guided narrated study across exercises, source and visual diagrams.

## Impact
Browser-only playback, teaching models, shared reader, highlighting, tests and docs. A server-side authoring script uses Inworld AI with the ignored credential; playback makes no provider calls. No new dependencies, server routes or progress-contract changes. Mastra core 1.79.0 and MCP 2.8.0 stay unchanged. Reference files: Guide.tsx, CodeNarration.tsx, ExcerptNarration.tsx, Infographic.tsx and useInfographicNarration.ts.
