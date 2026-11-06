# Live execution in every lesson

Date: 2026-11-06 (Europe/Madrid). Change: `course-wide-live-checkpoints`.

## Delivered behavior

All 75 lessons plus Lab 00 orientation support Offline and Live. Offline remains the first/default selection and performs no provider call. The existing 63 live-capable lessons keep their implementations. Labs 00, 01, 02, 05, 36, 37, 46–49, 61, 62 and 66 now run their practical exercise and optionally add a real-provider checkpoint answering a lesson-specific question about its result.

The checkpoint is an application-level teaching adapter, not a new Mastra native feature. A recorded Studio response, local MCP fixture, compiler or authentication simulation retains its original meaning; the model's explanation does not certify an external deployment. Original practical checks are retained. The added checkpoint check establishes completion/nonempty text rather than semantic grading, and explicitly reports not applicable in Offline mode.

Only the ignored local `.env` mode was changed to `MASTRA_MODE=live`; committed setup defaults remain offline. The operator replaced a rejected OpenAI key locally. No credentials are included in this report or committed source. Both OpenAI and Anthropic subsequently passed actual live calls.

## Paths

- `packages/labs/src/shared/live-checkpoint-definition.ts`: questions for all 13 affected lessons, optional `liveModelId`, cost/data notice, guide, source references, objective descriptor and bounded execution settings.
- `packages/labs/src/shared/live-checkpoint.ts`: typed execution adapter, schema intersections, model selection, redacted evidence, actual `Agent.generate`, events, usage, completion checking and cancellation/error handling.
- `packages/labs/src/shared/live-checkpoint.md`: learner-facing scope, privacy, billing and interpretation guide, available in each affected Source tab.
- Each affected `packages/labs/src/lab-XX/definition.ts` and `run.ts`: explicit adapter integration; reference exercises, IDs and catalog ordering preserved.
- `packages/labs/src/shared/live-checkpoint.test.ts`: deterministic real-agent/provider-fixture tests and all-76 mode inventory.
- `e2e/live-availability.spec.ts`: API inventory and enabled/selectable Lab 01 Live control on desktop/mobile.
- `apps/api/src/runs.test.ts`, `apps/web/src/workspace.test.tsx`, `e2e/workspace.spec.ts`: updated source and optional-input contracts, selectable Live/cost notice and offline-server refusal surfaced in the UI.
- `packages/labs/src/lab-16/lab16.test.ts`: controlled scripted delays for the existing exact reverse-completion assertion, avoiding real scheduling races without changing the lab implementation or weakening the assertion.
- `docs/STUDENT-GUIDE.md`, `docs/COMPATIBILITY.md`, `openspec/specs/lab-contracts/spec.md`: setup, version-matched API compatibility and behavior contract.

## Boundaries

The server resolves an enabled/configured model before expensive practical work. `auto` prefers the scaffold's chosen provider when configured, otherwise Anthropic then another configured model; explicit enabled IDs are accepted. An empty optional model field also means automatic selection. Unknown/unconfigured models fail rather than falling back to a mock.

At most 6,000 characters of result evidence are sent after masking known server secrets. The cost notice discloses that learner/document text can be transferred; confidential data should not be used. The model has no tools, one generation step, no automatic retry, a 2,048-output-token limit and the existing run abort/deadline. Cancellation, provider rejection and empty output cannot become a fabricated successful answer. Authentication errors identify HTTP 401/403 without exposing the provider's raw error text or key.

The implementation uses installed `@mastra/core` 1.79.0 declarations and the [official Agent.generate reference](https://mastra.ai/reference/agents/generate). No dependency versions changed.

## Actual verification

- `npx vitest run packages/labs/src/shared/live-checkpoint.test.ts`: **7 passed**, repeated on the final adapter after blank-input handling. Covers all 76 mode declarations, retained offline output schemas/checks, actual Mastra generation with a deterministic test provider, selection, bounded/redacted evidence, missing configuration, provider error/empty output and cancellation.
- Targeted API/parallel-request tests: **23 passed**. Targeted workspace/checkpoint tests: **21 passed**.
- `npm run verify`: final exit **0**; **1,706 passed, 82 skipped**, 155 test files passed and 2 skipped, 169.33 seconds. Environment/spec checks, lint, strict types, build and frontend secret scan passed. Evidence: `.data/course-live-verify-final.log` and `.data/course-live-verify-final-exit.txt`. Two configured key values and seven secret key names were absent from frontend output.
- `npm run test:e2e`: broad run **259 passed, 158 skipped**, with two failures caused by old assertions expecting Lab 00 Live to be disabled. These assertions were corrected to exercise selectable Live and the actual offline-server refusal shown in the UI. No production code changed for that correction.
- `npx playwright test e2e/workspace.spec.ts e2e/live-availability.spec.ts --grep "API errors surface|all lesson definitions"`: final exit **0**, **5 passed**, 57.5 seconds, including setup and both desktop/mobile checks. Together with the broad run, all 261 distinct browser cases passed after the two assertion corrections; a second unfiltered full run is not claimed. Evidence: `.data/course-live-e2e.log`, `.data/course-live-e2e-retry.log` and the corresponding exit files.
- `npx openspec validate --specs --strict --no-interactive`: **90 main specs passed** after syncing the additive requirement.

## Real provider evidence and costs

The selected new-path command was `npx cross-env RUN_LIVE_TESTS=1 vitest run packages/labs/src/live.test.ts -t "lab-(00|01|02|05|36|37|46|47|48|49|61|62|66) example runs live"`. It passed 12 Anthropic-backed cases; Lab 01's OpenAI request failed with HTTP 401. A bounded diagnostic confirmed the credential rejection. The operator replaced the key rather than substituting simulated success.

The retry command was `npx cross-env RUN_LIVE_TESTS=1 vitest run packages/labs/src/live.test.ts apps/api/src/live.test.ts -t "lab-01 example runs live|live runs through the API"`. It exited **0**, with **4 passed, 78 skipped**, 18.81 seconds: Lab 01, live preflight and real HTTP/SSE generation on both OpenAI and Anthropic. Evidence: `.data/live-checkpoints-providers.log` (initial attempt) and `.data/course-live-openai-retry.log` / `.data/course-live-openai-retry-exit.txt`.

Every newly added live path therefore has successful real-provider evidence across the initial run and retry. This work made **15 successful generation calls**: 13 new checkpoints and two HTTP provider scenarios. Exact monetary charges were not measured; consult the provider billing dashboards. This is not a $0 live test run. The other 63 existing live paths were not all rerun against paid providers; their offline regression coverage and two-provider API integration passed.

## Demo and remaining limits

Stop any old development command with Ctrl+C, run `npm run dev` from the repository root, wait for `[dev] API ready`, then refresh the lesson and sign in again if prompted. In Lab 01 select Anthropic or OpenAI for the scaffold, leave Live checkpoint model as `auto`, choose Live and Run. Expect the original compiler checks plus the `live-checkpoint` step and `liveCheckpoint.answer`/model in the result. Other newly supported practical lessons follow the same pattern. Other lessons retain their existing native live paths.

Live still requires valid provider credentials, account credit and any lesson-specific inputs or external services (such as Studio or a staging deployment when explicitly selected). A Google-specific run needs its own Google key. Enabling Live does not provision those services or remove their prerequisite checks. No public deployment or new SDK functionality is claimed. Changes and evidence are local; no remote CI or new commit/push is claimed for this change.
