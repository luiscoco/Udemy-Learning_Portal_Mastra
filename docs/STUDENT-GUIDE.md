# Start here: your local learning platform

This course runs on your own computer. Start offline: no provider account, payment card, cloud deployment or Docker is required. Your progress and sample documents stay in your local data directory. Refunds and customer cases in the lessons are simulations.

## Install

1. Install Node.js 24 LTS, npm (included with Node) and Git. Use `node --version`, `npm --version` and `git --version` to check. Native SQLite dependencies need a supported 64-bit operating system; a platform without a prebuilt binary may need its compiler toolchain. CI checks release tooling on Windows, Linux and macOS; the instructor release report states which full installation drills actually ran.
2. Download the course source ZIP and extract it to a writable local folder. Open a terminal in `mastra-learning-platform`, where `package.json` is located. Keep the supplied lockfile.
3. Run `npm ci`. Internet is needed to install packages. The lessons themselves can then use deterministic offline models at no provider cost.
4. Windows PowerShell: `Copy-Item .env.example .env`. macOS/Linux: `cp .env.example .env`. Keep `MASTRA_MODE=offline`, `HOST=127.0.0.1` and the default local sign-in.
5. Run `npm run dev`. Wait for `[dev] API ready` and Vite's `Local` URL; the API loads the lab runtime before the web server starts. Open `http://127.0.0.1:5173`, the portal enters the local `learner` automatically. Keep the terminal running.
6. Open Lab 00, read Learn, select Run and run the example. Expect a succeeded result with all checks passed. Use Source to inspect the reference code. Continue through the modules in order.

`COURSE-MAP.json` connects all 75 labs plus orientation to modules, stable Learn/Run/Source URLs and local reference folders. Quizzes, objectives, hints and instructor outlines are included inside the platform. Your Udemy lecture tells you which lab to open.

## Visual study tabs

Use **Infographic Content** for a Mastra concept map and checked code excerpt, or **Exercise Walkthrough** for six practice phases using the lesson's real input, checks and challenge. Zoom/fullscreen and SVG/PNG/text downloads are available. Guidance never starts runs or completes lessons; your current Run input is preserved when you follow a walkthrough link. See [visual guide usage](VISUAL-GUIDES.md).

## Guided Narrated Learning Tour

Run, Source and both visual tabs include a **Start Guided Narrated Learning Tour** button. Open it and press **Play narration** for included Inworld Yash MP3s with captions, timed red outlines and vertical follow-scrolling. Follow narration can be disabled for manual inspection. Pause/replay/section/speed controls and Escape/Close are available; exercise narration waits for you to choose Next. Listening preserves current inputs, scratch drafts, hidden solutions and progress. Playback requires no Inworld key or provider payment. See [the tour guide](NARRATED-TOURS.md) for details and instructor-only recording instructions.

## Ask AI Tutor

Open any lesson and select **AI Tutor** in its header. Start with **Offline · free study guide** and choose **Give me a hint** or **Debug my approach** for that lesson's authored guidance. For custom AI answers, deliberately select **Live** and a configured model; the cost notice appears before you submit. Replies stream with formatted text and coloured code. Stop, retry and clear controls are included. Each question starts fresh, and tutor use does not change your progress or quiz results. See [AI Tutor setup, examples and limits](AI-TUTOR.md).

## Build and run without development servers

Run `npm run build`. In PowerShell, set `$env:WEB_DIST_DIR='apps/web/dist'`, then run `npm start`. In macOS/Linux use `WEB_DIST_DIR=apps/web/dist npm start`. Open `http://127.0.0.1:8787`. Keep offline mode and the local loopback host.

## Optional live providers

First complete the offline example. All 75 lessons and orientation support optional Live mode. Obtain your own provider API key, place it only in your local `.env`, set `MASTRA_MODE=live` and restart the API. Choose Live in the lab only after reading its cost notice. Provider API usage is billed separately; chat subscriptions do not supply API credit. Request, step and token limits are not dollar budgets. Set spending controls in your provider account. Never submit a key in a course question, screenshot, Git commit or public repository. The app never asks you to paste a key into the browser UI.

In labs 00, 01, 02, 05, 36, 37, 46–49, 61, 62 and 66, Live adds a real-model checkpoint after the practical exercise. It sends a bounded, redacted excerpt of the result to the selected provider. Do not use confidential learner or document data. Leave **Live checkpoint model** as `auto`, or enter an enabled `provider/model` ID. Inspect `liveCheckpoint.answer`, the model identity, usage and `live-checkpoint` workflow step. A local fixture or recorded Studio response retains that label; the checkpoint does not claim a remote deployment was contacted. A failed provider call is an error, not a simulated success. See the lesson's shared Source files for details.

## Save, reset and update

The default API session and HTTP run buffers are in memory. Account progress is saved locally on the API, with queued browser edits when offline. Standard Run tabs can recover retained work after reload; an interrupted process does not automatically rerun actions. Durable session/journal options are documented in `docs/SESSIONS.md` and `docs/RUN-RECOVERY.md`; keep those separate keys stable if you enable them.

Before updating, stop the app with Ctrl+C and back up your `.env` and entire `.data` directory. Extract the next release into a new folder, run `npm ci`, and restore your own configuration/data after reading its compatibility notes. Never send your data or configuration to another student. Do not overwrite one student's data with someone else's. Use the platform's progress reset controls for intentional resets; avoid deleting databases while the API is running.

## Troubleshooting

- API unavailable: wait for `[dev] API ready`; first startup can take several seconds. If startup times out after 120 seconds, check the `[api]` terminal output, `.env` settings and port availability, then restart `npm run dev`. Check `http://127.0.0.1:8787/api/health` (adjust for your configured port). Offline mode does not need keys.
- Port occupied: close the previous platform instance or change PORT in `.env`. Root `npm run dev` automatically adjusts its API proxy; see README for advanced overrides.
- Unsupported Node or native-module error: use Node 24 LTS and rerun `npm ci`; do not copy another computer's node_modules.
- 429 response: wait for the displayed allowance to reset and retry deliberately. Cancel remains available for your active run.
- Live authentication/billing failure: return to Offline, check your provider account and restart after editing your local configuration.
- Report a problem with OS, Node version, lab ID, offline/live mode and the visible request ID. Include sanitized error text; exclude keys, cookies, passwords, `.env` and `.data`.

Original project code is MIT licensed; retain LICENSE and third-party notices when reusing it. Course recordings and other separately supplied instructor media are outside this source bundle. Public/shared hosting has additional requirements in `docs/RELEASE-GATES.md` and is not part of the local student setup.


## Automatic local learner entry

The default local portal enters the sole configured learner automatically. No manual sign-in is needed for runs or AI Tutor. The header shows **Local learner**; progress and notes still belong to that normal server session. Offline Tutor is free; live Tutor requires configured provider credentials and retains its cost notice.

Automatic entry requires the development identity provider, a loopback host, one allowed learner and no passcode. Set `AUTH_LOCAL_AUTO_LOGIN=false` in the repository-root `.env` and restart the API to require explicit sign-in. Passcode, multiple-profile and password-provider configurations always require explicit sign-in. Existing sessions are preserved. Session startup failures offer retry; recovery never submits or replays a Tutor question.
