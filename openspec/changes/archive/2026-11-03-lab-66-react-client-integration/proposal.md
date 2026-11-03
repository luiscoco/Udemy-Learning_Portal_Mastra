# Proposal

## Why

The web app talks to the API through hand-written helpers in `apps/web/src/api` that call `fetch('/api/…')` directly. They are typed and validated, but they belong to the web app and cover only the routes it uses: nothing calls `GET /api/labs`, and that route has no contract schema at all. The L66 DoD: a typed client SDK consumes backend agent execution and renders results, model keys never reach the browser, and API contract tests pass.

## What Changes

- **New browser-safe package `@mlp/client` (`packages/client`).** It depends only on `@mlp/contracts` and `zod`.
  - **`createApiClient({ baseUrl?, fetch?, reconnect? })`** returns typed methods for **every** API route: health, catalog, auth (session/login/logout), labs (list/get/source/preflight) and runs (start/get/cancel/decide/events).
  - **Validation.** Every success response is parsed with its contract schema. A response that does not match throws `ApiClientError` with code `CONTRACT` (drift is never accepted silently). Error bodies parse into typed `ApiClientError { code, status, details, retryable, requestId }`; a network failure becomes `NETWORK`.
  - **Event streaming.** `runs.events(runId, onEvent, signal)` uses an incremental SSE parser, reconnects with `Last-Event-ID` (bounded attempts and backoff), never delivers an event twice, and returns on `complete`.
  - **No credentials.** The client accepts no credential options and a runtime guard rejects unknown options such as `apiKey`. The only header it sends besides content negotiation is the per-run `X-Run-Token`. Requests use the session cookie (`credentials: 'same-origin'`).
  - **`CLIENT_ROUTES`** maps each SDK method to its route key.
  - Lint applies the browser rule (no `@mastra/*` or server-only packages).
- **Contracts.** A new `LabSummarySchema` for `GET /api/labs`; the route's response is type-checked against it. This is additive.
- **Web app.** `apps/web/src/api/*` keep their exported functions but delegate to one `createApiClient()`. `lib/sse` re-exports the SDK parser. The UI is unchanged.
- **API contract tests (`apps/api/src/contract.test.ts`):**
  - the SDK runs against the real Express app over HTTP (with a small cookie jar) and exercises every route: success shapes, error shapes (401, 404, 422) and event resume;
  - every key of `ROUTE_CLASSES` must have an SDK method in `CLIENT_ROUTES`, and vice versa.
- **New lab `lab-66` (Module 14).** The SDK runs against a disposable loopback API built from the real `LabRunner` and Dummy Lab 00. Learner inputs:
  - a message;
  - "drop the stream after N events" (shows the resume);
  - "contract drift" (the server sends a snapshot without `status`, or an event of an unknown type);
  - "cancel after N ms".

  The output lists every SDK call (method, HTTP status, validated or typed error), the events received with their sequence numbers and reconnects, the rendered result, and a scan of every request the server saw for credentials. Offline only (no model).
- **Tests:**
  - SDK unit tests (validation, errors, SSE chunk boundaries, resume without duplicates, option guard, headers);
  - contract tests;
  - lab tests;
  - an e2e happy path for the lab;
  - the existing bundle secret scan.
