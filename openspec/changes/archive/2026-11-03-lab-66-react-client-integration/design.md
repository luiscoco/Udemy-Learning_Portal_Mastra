# Design

## `packages/client/src/`

- **`errors.ts`:** `ApiClientError` (moved from the web app; the same fields plus `requestId`) with client-only codes `NETWORK` and `CONTRACT`. `toApiClientError(res)` parses `ApiErrorSchema`.
- **`sse.ts`:** `SseParser`, moved unchanged from `apps/web/src/lib/sse.ts`.
- **`client.ts`:**
  - `createApiClient(options)`. `request(method, path, { body?, headers?, signal?, schema })` sends `credentials: 'same-origin'` and `accept: application/json`, maps network errors to `NETWORK` and non-OK responses to `toApiClientError`, and parses success bodies with `schema.safeParse`; a failed parse throws `CONTRACT` with the first issue path.
  - `events()`:
    - fetch with `Last-Event-ID`; validate each frame with `ExecutionEventSchema` (a failure throws `CONTRACT`); skip `seq <= lastSeq` (no duplicates); stop at `complete`;
    - reconnect on network errors or on a stream that ends without `complete`, at most `reconnect.max` times (default 3) with `reconnect.baseDelayMs × attempt` (default 300);
    - an `onReconnect(attempt, lastSeq)` hook.
  - The option guard rejects unknown option names. Allowed: `baseUrl`, `fetch`, `reconnect`, `onReconnect`.
- **`routes.ts`:** `CLIENT_ROUTES`, a record from route key to SDK method path, for example `'POST /api/labs/:labId/runs': 'runs.start'`.

## Web app

`apps/web/src/api/client.ts` creates the SDK once (`export const api = createApiClient()`) and re-exports `ApiClientError` and `toApiClientError`. `runs.ts` and `auth.ts` keep their function names and signatures, implemented with `api.*`. `useLabRun` is unchanged.

## Contract test

The test uses `createApp`, listens on `127.0.0.1:0` and passes the SDK a `fetch` with a cookie jar. It calls:

- health, catalog, `labs.list` (parsed with `LabSummarySchema`), `labs.get`, `source`, `preflight`;
- login, session, a lab-00 run start with streamed events to `complete`;
- `runs.get`;
- a lab-15 `ask` run, to cover `decide` and then `cancel`;
- logout.

Error cases: anonymous start → 401 `UNAUTHORIZED`; unknown lab → 404 `NOT_FOUND`; invalid input → 422 `VALIDATION_FAILED` with details. A coverage assertion compares `Object.keys(ROUTE_CLASSES)` with `Object.keys(CLIENT_ROUTES)`.

## Lab 66 (`packages/labs/src/lab-66/`)

- **`server.ts`:** `startDemoApi({ drift, dropAfterEvents, signal })` is a `node:http` loopback server that implements:
  - `GET /api/labs/:id`, `POST /api/labs/:id/runs`, `GET /api/runs/:id`, `GET /api/runs/:id/events` (SSE with `id:`, honouring `Last-Event-ID`) and `POST /api/runs/:id/cancel` (checks `X-Run-Token`);
  - using a private `LabRunner` with lab-00;
  - it records every request's method, path and header names, and flags secret-looking header names and values.
- **`run.ts`:** creates the SDK against the loopback base URL and:
  - fetches the definition (`labs.get`);
  - starts a run, streams its events (with drop and resume) and cancels after N ms if asked;
  - reads the final snapshot;
  - then makes two deliberate errors (an invalid input and an unknown lab) and shows the typed codes;
  - with drift, shows the `CONTRACT` error.

  It always closes the server.

### Checks

| Check | Meaning |
| --- | --- |
| `responses-validated` | Every SDK call returned schema-valid data or a typed error. |
| `stream-resumed` | When the stream was dropped, it reconnected with `Last-Event-ID` and the sequence numbers are contiguous with no duplicates. |
| `drift-rejected` | Injected drift became a `CONTRACT` error, not data. |
| `errors-typed` | The invalid input became `VALIDATION_FAILED` with details; the unknown lab became `NOT_FOUND`. |
| `no-browser-credentials` | No request carried `authorization`, `x-api-key` or a provider-key-like value, and the SDK refused an `apiKey` option. |
| `cancel-honoured` | With a cancel requested, the run ended `cancelled` through `runs.cancel` with the token. |
| `resources-released` | The server is closed and no sockets are open. |
