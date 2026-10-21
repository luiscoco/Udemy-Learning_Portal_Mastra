# Authenticated API

Authentication creates a trusted principal. Authorization compares that principal with the owner recorded by the server when a run starts. Never accept an owner id from the request body.

```ts
// After middleware has verified the session cookie:
if (!req.principal) throw new LabError('UNAUTHORIZED', 'Sign in to run labs.');
if (runner.ownerOf(runId) !== req.principal.sub)
  throw new LabError('NOT_FOUND', 'Unknown run');
// Cancellation and approvals additionally check the existing run token.
runner.authorize(runId, req.header('x-run-token'));
```

Start a run as Alice, then attempt its snapshot, event stream, cancel and approval routes as Bob. Bob must get 404 even when he has the correct run token. Alice must still read the snapshot and stream; her mutation without a token must fail with 403, and a valid token must preserve the existing cancellation/approval behavior. Anonymous clients receive 401 before execution.

The session cookie carries an opaque random id plus its HMAC, never user claims. HttpOnly, SameSite=Strict and the origin check complement signature validation, expiry and server-side revocation. Replaying the cookie after logout must fail, as must changing its signature or advancing the injected clock past expiry.

The local development allowlist is an application adapter, not a Mastra account API. `NODE_ENV=production` refuses this provider. Before public hosting implement a real identity provider and shared session storage, HTTPS, tenant isolation and the remaining `docs/RELEASE-GATES.md` items. A stable signing secret alone does not persist the in-memory sessions.

Example input: `{ "username": "alice", "otherUser": "bob", "ttlMs": 2000 }`.
Expected statuses: anonymous 401, login 200, owner start 202, owner read 200, altered cookie 401, expired cookie 401, other learner 404, logout 200, replay after logout 401, foreign origin 403.
