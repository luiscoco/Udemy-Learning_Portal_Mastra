# React client integration

The browser knows only your API. One typed client is the way in:

```ts
import { createApiClient, ApiClientError } from '@mlp/client';

const api = createApiClient(); // same origin; the session cookie authenticates; no keys accepted

const { runId, runToken } = await api.runs.start('lab-06', { input });
await api.runs.events(runId, (event) => dispatch(event), signal); // resumes with Last-Event-ID
await api.runs.cancel(runId, runToken); // the per-run token, never a provider key

try {
  await api.runs.get(runId);
} catch (e) {
  if (e instanceof ApiClientError && e.code === 'CONTRACT') showBug(e); // drift, not data
}
```

Inside the SDK, `request()` parses every success body with the contract schema the server uses (for example `RunSnapshotSchema`) and throws `CONTRACT` on mismatch. Error bodies become `ApiClientError { code, status, details, retryable, requestId }`; network failures become `NETWORK`. `events()` validates each SSE frame, remembers the last `seq`, reconnects at most `reconnect.max` times with `Last-Event-ID`, and skips any `seq` it already delivered.

`CLIENT_ROUTES` lists the route each method calls; `apps/api/src/contract.test.ts` runs the SDK against the real API and fails when the server's routes and `CLIENT_ROUTES` differ.

Challenge outline:

```ts
export function useRunEvents(runId: string) {
  const store = useMemo(() => createRunStore(api, runId), [runId]); // subscribe/getSnapshot over api.runs.events
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
```

Test it with a fake fetch whose first stream ends after two token events and whose second replays from the start: the rendered text must contain each token once.

Example input: drop after 3 events, no drift. Expected: one reconnect, contiguous seq, `rendered.status` succeeded, VALIDATION_FAILED and NOT_FOUND for the two deliberate mistakes, no credential headers.
