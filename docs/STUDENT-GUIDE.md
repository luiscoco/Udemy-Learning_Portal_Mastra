# Start here: your local learning platform

This course runs on your own computer. Start offline: no provider account, payment card, cloud deployment or Docker is required. Your progress and sample documents stay in your local data directory. Refunds and customer cases in the lessons are simulations.

## Install

1. Install Node.js 24 LTS, npm (included with Node) and Git. Use `node --version`, `npm --version` and `git --version` to check. Native SQLite dependencies need a supported 64-bit operating system; a platform without a prebuilt binary may need its compiler toolchain. CI checks release tooling on Windows, Linux and macOS; the instructor release report states which full installation drills actually ran.
2. Download the course source ZIP and extract it to a writable local folder. Open a terminal in `mastra-learning-platform`, where `package.json` is located. Keep the supplied lockfile.
3. Run `npm ci`. Internet is needed to install packages. The lessons themselves can then use deterministic offline models at no provider cost.
4. Windows PowerShell: `Copy-Item .env.example .env`. macOS/Linux: `cp .env.example .env`. Keep `MASTRA_MODE=offline`, `HOST=127.0.0.1` and the default local sign-in.
5. Run `npm run dev`. Open `http://127.0.0.1:5173`, choose Sign in and use `learner`. Keep the terminal running.
6. Open Lab 00, read Learn, select Run and run the example. Expect a succeeded result with all checks passed. Use Source to inspect the reference code. Continue through the modules in order.

`COURSE-MAP.json` connects all 75 labs plus orientation to modules, stable Learn/Run/Source URLs and local reference folders. Quizzes, objectives, hints and instructor outlines are included inside the platform. Your Udemy lecture tells you which lab to open.

## Build and run without development servers

Run `npm run build`. In PowerShell, set `$env:WEB_DIST_DIR='apps/web/dist'`, then run `npm start`. In macOS/Linux use `WEB_DIST_DIR=apps/web/dist npm start`. Open `http://127.0.0.1:8787`. Keep offline mode and the local loopback host.

## Optional live providers

First complete the offline example. If the lesson supports live mode, obtain your own provider API key, place it only in your local `.env`, set `MASTRA_MODE=live` and restart the API. Choose Live in the lab only after reading its cost notice. Provider API usage is billed separately; chat subscriptions do not supply API credit. Request, step and token limits are not dollar budgets. Set spending controls in your provider account. Never submit a key in a course question, screenshot, Git commit or public repository. The app never asks you to paste a key into the browser UI.

## Save, reset and update

The default API session and HTTP run buffers are in memory. Account progress is saved locally on the API, with queued browser edits when offline. Standard Run tabs can recover retained work after reload; an interrupted process does not automatically rerun actions. Durable session/journal options are documented in `docs/SESSIONS.md` and `docs/RUN-RECOVERY.md`; keep those separate keys stable if you enable them.

Before updating, stop the app with Ctrl+C and back up your `.env` and entire `.data` directory. Extract the next release into a new folder, run `npm ci`, and restore your own configuration/data after reading its compatibility notes. Never send your data or configuration to another student. Do not overwrite one student's data with someone else's. Use the platform's progress reset controls for intentional resets; avoid deleting databases while the API is running.

## Troubleshooting

- API unavailable: keep the terminal running and check `http://127.0.0.1:8787/api/health`. Offline mode does not need keys.
- Port occupied: close the previous platform instance. If changing PORT, also configure API_PROXY_TARGET for the development web server as described in README.
- Unsupported Node or native-module error: use Node 24 LTS and rerun `npm ci`; do not copy another computer's node_modules.
- 429 response: wait for the displayed allowance to reset and retry deliberately. Cancel remains available for your active run.
- Live authentication/billing failure: return to Offline, check your provider account and restart after editing your local configuration.
- Report a problem with OS, Node version, lab ID, offline/live mode and the visible request ID. Include sanitized error text; exclude keys, cookies, passwords, `.env` and `.data`.

Original project code is MIT licensed; retain LICENSE and third-party notices when reusing it. Course recordings and other separately supplied instructor media are outside this source bundle. Public/shared hosting has additional requirements in `docs/RELEASE-GATES.md` and is not part of the local student setup.
