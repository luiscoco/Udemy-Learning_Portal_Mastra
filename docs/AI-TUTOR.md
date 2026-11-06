# AI Tutor

Open any available lesson (orientation plus all 75 labs) and select **AI Tutor** in its header. The responsive panel follows the portal theme and supports keyboard focus, Escape/Close, example questions and formatted answers with coloured code and copy controls.

## Student demo

1. Run `npm run dev`, let the local learner session start automatically, open `/labs/lab-01` and select **AI Tutor**.
2. Keep **Offline · free study guide**, select **Give me a hint**, then **Ask tutor**. Guidance streams from this lesson's teaching material without contacting a provider. Try **Debug my approach** for its common mistakes and fixes. Offline text is authored guidance, not generative AI.
3. For custom questions, select **Live** and a configured model, read the cost notice and select **Ask live tutor**. The server must have `MASTRA_MODE=live`, the appropriate provider API key and an enabled `LIVE_MODELS` entry. Existing configured OpenAI, Anthropic and Google models are reused; keys stay in the server `.env`. Configuration presence does not verify model access, credit or billing. No separate tutor environment variables are needed.
4. **Stop receiving** requests abort and retains incomplete partial text. Retry is explicit and can incur another charge. Close/Escape returns focus to the launcher. Navigation, reload or account changes clear temporary answers; reopening within the same lesson/visit retains the answer. **Clear answer** resets the result.

Each question starts fresh with the lesson context and does not continue an earlier provider conversation. Tutor use never marks a lesson read, runs a lab, passes a quiz or changes progress. Treat AI output as advice and check the tested reference source. Code snippets are explanatory and never executed.

## Reference adaptation

Inspected [LiveTutor.tsx](https://github.com/luiscoco/Udemy-OpenAI-API-Build-a-Learning-Portal/blob/9eb76ee88b8dd57fe4b086b3810b3631048115b6/src/LiveTutor.tsx) and [openaiTutor.ts](https://github.com/luiscoco/Udemy-OpenAI-API-Build-a-Learning-Portal/blob/9eb76ee88b8dd57fe4b086b3810b3631048115b6/server/openaiTutor.ts). This implementation brings its example questions, streamed answers, separate live provenance, cost disclosure, explicit completion and stop-receiving behavior to every Mastra lesson. It uses this platform's installed Mastra Agent.stream API and model allowlist. It does not create the reference's managed OpenAI Agents sessions or expose remote session IDs. The reference Learning Guide's prerecorded narration is a separate feature, not part of AI Tutor.

The [official Mastra streaming guide](https://mastra.ai/docs/guides/streaming) and installed 1.79.0 declarations/packaged MastraModelOutput reference were inspected. No dependency upgrades were needed.

## Implementation and API

- `packages/contracts/src/tutor.ts`: strict request, settings and ordered SSE contracts. Questions: 1–2,000 characters. Answers: up to 16,000 characters.
- `packages/client/src/client.ts`: `tutor.settings()` and `tutor.answer(subject, request, onEvent, signal)`. Contract-validates events, request identity and provenance; rejects early EOF, malformed/oversized streams and sequence drift; cancels its reader. No automatic retries/replays or provider credentials.
- `apps/api/src/tutor.ts`: `GET /api/tutor/settings` exposes safe model readiness. Authenticated `POST /api/tutor/answer` requires the account-bound `x-run-subject` header and streams `started`, text snapshots, then `complete` or `error`. Each event has requestId and seq. API origin protections and shared start-rate policy apply. At most two tutor requests per learner and min(8, MAX_CONCURRENT_RUNS) globally; separate pool from lab runs. Deadline: min(60 seconds, RUN_MAX_TIMEOUT_MS). Slow-reader buffering is capped. Server drain, client disconnect and deadlines abort work; uncooperative providers are raced against deadline so HTTP observation still terminates.
- `apps/web/src/components/tutor/AiTutor.tsx` and `ai-tutor.css`: accessible native dialog, default offline mode, model/cost notices, fresh requests and lifecycle generation guards. `pages/LabPage.tsx` keys it by lesson and account. It reuses the safe `FormattedResponse`/`CodeBlock` rendering.

Context is built on the server from the selected registered lesson's concept, objectives, prerequisites, procedure, hints and mistakes (up to 12,000 characters). It excludes reference solution files, quiz answer keys, learner notes/uploads and arbitrary filesystem content. The tutor has no tools, execution, browsing, grading or progress writes. Its teaching context and question are treated as untrusted data. Configured secrets are masked in prompts, output and canonical errors, including secret prefixes split between streamed chunks. Prompts and raw provider errors are not logged.

Live uses one model step, at most 2,048 output tokens and zero automatic retries. A provider error, empty answer, token-limit finish, timeout or disconnected stream never counts as complete and never silently falls back to offline. Stop/close requests local/server/provider abort; neither remote cancellation nor avoided charges is guaranteed. No durable tutor history, recovery, voice, web search or managed remote session inspection is included.

## Verification

Offline API tests cover all lesson guidance, server-owned context, typed SDK delivery, unchanged progress, authentication/account/origin/input refusal, configuration, secret masking, provider error/output limits, deadlines, concurrency/rate limits and disconnect abort. The actual Mastra streaming adapter is exercised against ScriptedLanguageModel, including a token-limit finish.

Client tests cover strict requests, event identity/order/provenance, incomplete/malformed streams, abort and no automatic retry. Component tests cover examples, validation, coloured code, stop/late events, explicit retry, close/unmount and transport failure. `e2e/ai-tutor.spec.ts` passed **7 tests including setup** on desktop/mobile: real offline guidance, unchanged progress, both themes, axe WCAG A/AA, 320px width, focus restoration, live formatted-response fixture, stop/retry/navigation. Screenshots: `.data/ai-tutor/`. Live browser fixtures simulate the provider and do not prove paid provider access.

Opt-in paid acceptance passed with `npx cross-env RUN_TUTOR_LIVE_TESTS=1 vitest run apps/api/src/tutor.live.test.ts`: **2 real provider calls**, using `openai/gpt-4o-mini` (306 answer characters, 3.1 seconds) and `anthropic/claude-haiku-4-5` (447 characters, 1.8 seconds). Both reached normal completion through the actual Mastra streaming adapter. This checks usable completed streaming, not semantic answer quality. Provider token billing applies; an exact dollar cost was not calculated. Metadata only (no keys or answer payloads) is in `.data/tutor-live-smoke.json`. The paid tests are skipped unless explicitly enabled.

`npm run verify` passed: lint, strict workspace TypeScript, 90 strict existing specifications, **1,742 tests passed / 84 optional tests skipped**, production API/web builds and browser bundle secrets scan. Evidence: `.data/tutor-verify.log` and `.data/tutor-verify.exit` (0). The opt-in paid-test file added during this run was also checked with ESLint and the API workspace typecheck afterward.

`npm run test:e2e` passed in one full run: **273 passed / 158 optional or viewport-specific skips / zero failures** (11.9 minutes). This covers all 75 lesson examples on desktop and mobile, existing course functionality, both new tutor modes (offline HTTP and deterministic live UI fixture), lifecycle controls, safe formatted code, unchanged progress and accessibility. Evidence: `.data/tutor-e2e.log` and `.data/tutor-e2e.exit` (0).

The change passed strict validation before implementation. The new `lesson-tutor` spec was synced with its Purpose and all four requirements intact; `npx openspec validate --specs --strict --no-interactive` passed all **91 specs**. OpenSpec archive: `openspec/changes/archive/2026-11-06-lesson-ai-tutor/`.

Standard tests are offline and make no paid calls; the separate opt-in acceptance above made two billable calls. Existing large bundle and Tailwind sourcemap build warnings remain. Changes are local and uncommitted.


## Automatic local learner entry

The default local portal enters the sole configured learner automatically. No manual sign-in is needed for runs or AI Tutor. The header shows **Local learner**; progress and notes still belong to that normal server session. Offline Tutor is free; live Tutor requires configured provider credentials and retains its cost notice.

Automatic entry requires the development identity provider, a loopback host, one allowed learner and no passcode. Set `AUTH_LOCAL_AUTO_LOGIN=false` in the repository-root `.env` and restart the API to require explicit sign-in. Passcode, multiple-profile and password-provider configurations always require explicit sign-in. Existing sessions are preserved. Session startup failures offer retry; recovery never submits or replays a Tutor question.
