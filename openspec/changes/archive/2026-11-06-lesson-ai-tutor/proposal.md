## Why
Students need a tutor alongside every Mastra lesson. The reference portal's LiveTutor provides example questions, incremental answers, paid-mode notices and explicit stop/error states; this platform has no equivalent course-wide aid.

## What Changes
- Add an AI Tutor launcher and accessible lesson-aware panel to all 76 available lessons.
- Offer free deterministic lesson guidance and explicit live provider selection, example questions, formatted streamed answers, stop/retry/reset and setup/error states.
- Add validated server-side tutor streaming and typed SDK methods with session binding, rate/concurrency limits, deadlines and secret masking.
- Keep learner progress independent from tutor use and preserve existing lesson routes/catalog.

## Capabilities
### New Capabilities
- `lesson-tutor`: optional lesson-grounded offline/live tutor with secure streamed answers and accessible lifecycle controls.
### Modified Capabilities
None. Existing typed-route, authentication and formatted-response requirements continue to apply.

## Impact
Contracts, client SDK, API tutor service/router and lesson UI; new tests and instructor/student documentation. Reuses installed Mastra 1.79.0 and existing models, no new dependencies or browser credentials. Reference inspected at commit 9eb76ee88b8dd57fe4b086b3810b3631048115b6.
