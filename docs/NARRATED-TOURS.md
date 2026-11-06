# Guided Narrated Learning Tour

Every lesson offers a tour in **Run**, **Source**, **Infographic Content** and **Exercise Walkthrough**. These readers use prerecorded Inworld MP3s, authored Mastra captions and actual reference-source ranges. They do not submit exercises, change drafts, reveal solutions, record progress or make runtime provider calls.

## Student demonstration

1. Start `npm run dev`, sign in and open `/labs/lab-03?tab=run`.
2. Choose **Start Guided Narrated Learning Tour**, then **Play narration**. The selected exercise paragraph has a red outline; spoken words receive timed red focus.
3. Pause, resume with Play, replay, select a section or change playback speed. Exercise sections wait for your Next action. Close the tour to run the exercise yourself; current inputs and ongoing executions are retained.
4. Open Source and launch its tour. The reader identifies its main declared non-solution TypeScript file and line range, displays the complete coloured file and outlines the narrated lines. **Wrap code** and **Follow narration** control reading. Other reference files and the scratchpad remain available in Source.
5. Open either visual tab and launch the tour. A red SVG rectangle marks the narrated diagram region. Use Fit/100%/zoom to inspect it. With Follow enabled, the image reader scrolls vertically and horizontally to reveal the region. Source and caption readers also follow their timed targets without moving keyboard focus away from the controls.
6. Source/infographic tours offer **Continue after audio**. Previous/Next and section selection remain manual controls. Native audio controls provide seeking. Escape or Close stops playback and returns focus to the launcher. MP3 and transcript downloads are available; MP3 becomes available after verification.

The reader shows a readonly teaching baseline, not a replay of the learner's current run. Tour position resets when closed or when leaving its tab/lesson/account. The separate Exercise Walkthrough practice-phase position retains its existing tab-switch behaviour.

## Exact Inworld settings

The owner requested and authorized these generation parameters:

| Setting | API field |
| --- | --- |
| Voice | `voiceConfig.voiceId: "Yash"` on each script utterance |
| Language | omitted, automatic detection |
| Model | `modelId: "inworld-tts-2"` |
| Enhanced quality | `enhanceGeneration: true` |
| Balanced delivery | `deliveryMode: "BALANCED"` |
| Recorded speed | `audioConfig.speakingRate: 1.25` |
| Download format | `audioConfig.audioEncoding: "MP3"`, `sampleRateHertz: 48000` |
| Caption timing | `timestampType: "WORD"` |
| Independent sections | `outputMode: "PER_UTTERANCE"` |

The files are already recorded at 1.25×. Player speed defaults to **1× recording**; selecting 1.5× multiplies the recorded speed again. No browser speech engine, local substitute voice, voice clone or Claude-specific recording is used.

Verified against the official [synthesis API](https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech), [script synthesis](https://docs.inworld.ai/tts/capabilities/script-synthesis) and [voice catalog](https://docs.inworld.ai/api-reference/voiceAPI/voiceservice/list-voices). A live catalog request confirmed voice ID Yash (listed with primary language en-IN); the requested language field remains omitted. Reference implementations reviewed in [the Claude portal](https://github.com/luiscoco/Udemy-Claude-Agent-SDK-Student-Rebuild): Guide.tsx, CodeNarration.tsx, ExcerptNarration.tsx, Infographic.tsx, useInfographicNarration.ts and lesson-concept-tours.ts. These new recordings and diagrams explain this portal's stable Mastra lab numbers and content.

## Instructor authoring

Only the instructor needs a complete Inworld Basic credential in the ignored root `.env` as `INWORLD_API_KEY`. Never prefix it with VITE_, expose it to the web app, paste it into recordings or commit it. Students need no Inworld key for the included pack.

```powershell
npm run narration:generate -- --dry-run
npm run narration:generate -- --lesson=lab-03
npm run narration:generate
```

Generation uses the pinned local tsx runner, Node fetch and an installed **ffprobe** for audio validation. It creates three tour entries per lesson; the exercise recording is shared by Run and the walkthrough poster. Requests obey the 2,000 UTF-16-unit synthesis limit. Each returned utterance is independently verified as 48 kHz MP3. Content/settings-addressed response caches under `.data/narration-inworld/` allow interrupted generation to resume. Do not remove the cache before a resume. `--shard=0/3`, `1/3` and `2/3` partition independent lessons for bounded parallel authoring.

Authoring is a paid external API operation. Dry-run character estimates use the published **$25 per million characters** TTS-2 on-demand rate, checked November 6, 2026; your plan/credits, retries and provider billing determine actual charges. [Inworld pricing](https://inworld.ai/pricing). Processed-character usage is retained in the ignored `.data/narration-inworld/usage.jsonl`, without credentials.

## Identity, timing and recovery

`apps/web/src/features/narration/content.ts` derives six exercise phases, four source sections and five infographic sections from validated lab definitions and declared non-solution source. `tourIdentityText` binds recordings to exact captions and the complete narrated source file. `media.ts` validates per-lesson manifests, requested settings, caption hashes, clip identity, bounded size, audio SHA-256 and timing ranges before producing a playable blob URL.

Recorded files and per-lesson manifests live under `apps/web/public/audio/tours/`; audio filenames are their SHA-256. Only the current section loads on Play. Aborts and generation tokens prevent obsolete requests from starting audio after navigation; close/unmount releases blob URLs and stops playback. Static playback is independent of Inworld availability and never sends learner text or source to the provider. Only the instructor authoring command sends the authored lesson narration.

Full authored transcripts remain visible. Inworld word alignment may normalize punctuation, numbers or abbreviations; the separately labelled spoken caption follows provider word times. The red source range is a section-level mapping to the actual code, not a claim that each spoken word corresponds to a TypeScript token. Diagram outlines use their original SVG coordinates. Follow scrolling stays inside the relevant reader and does not steal focus. No artificial word timing is substituted if metadata is missing.

Missing, stale, corrupt or blocked audio leaves captions and manual navigation usable, with a retry message. Changing teaching content or reference code requires regeneration of matching media before playback can resume. Browsers may require another explicit Play after asynchronous media loading. There is no automatic microphone permission, live TTS endpoint or saved tour-completion grading.

The sanitized source ZIP includes only hash-named MP3s from the tour directory. Its bounded total size allowance is increased to 512 MiB for the prerecorded media; per-file, path, credential, symlink and checksumming restrictions remain enforced. Existing distributions can be updated by replacing the source/media together.

## Verification

Focused component/media and course ZIP tests passed (**15 tests**). They cover explicit playback, red timed words/ranges, automatic diagram transitions at audio end, focus restoration, pause/replay/speed, manual exercise progression, corrupt/stale media, bounded responses, late-load aborts, scroll following and hash-checked MP3 packaging. The all-lesson pack audit passed (**2 tests**): all 76 definitions, source ranges, 228 content identities, 1,140 MP3 hashes and all timing arrays match.

The completed pack contains **76 manifests, 228 tour entries and 1,140 independently playable MP3s**, totalling **267,285,504 audio bytes** (about 255 MiB). All were generated through Inworld, Yash/TTS-2, using the exact settings above and verified at 48 kHz. The successful authoring ledger records **228 requests and 261,731 processed characters**, an estimated **$6.54** at the on-demand list rate. This is not an invoice: plan credits/discounts and any provider-billed requests interrupted before a response can affect the actual total. Initial connection resets were resumed from cached responses without regenerating completed tours.

Browser scenarios exercise real MP3 decoding, both themes, mobile/internal scrolling, active-run preservation, scratch drafts, solution boundaries, corrupt-audio recovery and timed automatic region transitions. The full `npm run test:e2e` regression passed **285 tests / 158 skipped** (19.0 minutes). After the mobile following refinement, the final `npm run test:e2e -- e2e/narrated-tours.spec.ts` passed **9 tests**, including actual clip-end-driven diagram/source changes and mobile reader visibility. All sampled WCAG/theme checks passed; desktop and mobile source/diagram/following screenshots were visually inspected under `.data/narrated-tours/`.

An earlier browser startup attempt timed out before tests; the standalone production build and both subsequent browser runs passed. Strict checking also caught test-fixture annotations; these were corrected before the complete successful release-check repeat.

- `npm run verify` with `VITEST_MAX_WORKERS=2`: **passed**. Lint, all workspace TypeScript checks, **1,763 passing / 84 skipped unit tests**, production builds and the bundle-secrets scan passed. The scan confirms all three configured secret values and eight forbidden server key names are absent from the web distribution, including static media metadata. Log: `.data/narration-verify-final.log`.
- `npm run test:e2e`: **285 passed / 158 skipped**, followed by **9 passing final tour checks** after the mobile follow-scrolling refinement. Logs: `.data/narration-e2e-full.log` and `.data/narration-e2e-final.log`.
- `npm run release:course`: **passed**, building a checksummed student ZIP with **2,805 allowlisted files**, including the complete recording pack. This was a working-tree validation artifact (`sourceDirty: true`), not a separately published release. Log: `.data/narration-release.log`.
- All **91 main specifications** pass strict validation after syncing the four narrated-study requirements. `git -c core.safecrlf=false diff --check` passed.

No unresolved implementation or test failures remain. Existing bundle-size/Tailwind source-map build warnings remain non-fatal. Playback is a recorded study aid, not an execution trace; source highlights map explanation sections rather than individual TypeScript tokens. Saved tour position/completion and runtime TTS generation are intentionally outside this change. Changes and generated media remain local until committed.

Main paths: `apps/web/src/features/narration/{content,media}.ts`, `apps/web/src/components/narration/{NarratedTour.tsx,narration.css}`, `apps/web/src/components/workspace/{CodeBlock,LessonPoster,LabWorkspace,SourceTab,VisualStudyTab}.tsx`, `scripts/generate-tour-audio.ts`, `scripts/course-release.ts` and `apps/web/public/audio/tours/`. Tests: `packages/labs/src/narration.test.ts`, `apps/web/src/features/narration/media.test.ts`, `apps/web/src/components/narration/NarratedTour.test.tsx`, `packages/deploy/src/course-release.test.ts` and `e2e/narrated-tours.spec.ts`.
