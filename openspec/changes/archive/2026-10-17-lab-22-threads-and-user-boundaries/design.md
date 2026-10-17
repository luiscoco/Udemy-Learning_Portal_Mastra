# Design

## Context

Verified against the installed `@mastra/memory` 1.38.0 and `@mastra/libsql` 1.26.2 (spike, thread `alice-t1` owned by resource `alice`):

- **`getThreadById({ threadId })`** returns Alice's thread to any caller, including its id, `resourceId` and title. It has no owner parameter.
- **`recall({ threadId: 'alice-t1', resourceId: 'bob' })` throws** "Thread with id alice-t1 is for resource with id alice but resource bob was queried."
- **`agent.generate(…, { memory: { thread: 'alice-t1', resource: 'bob' } })` fails** with `AGENT_GENERATE_FAILED`: "Thread "alice-t1" belongs to resource "alice" but resource "bob" was provided." Ownership is unchanged.
- **`listThreads({ filter: { resourceId: 'bob' } })`** returns only Bob's threads.
- **`createThread({ resourceId, title })`** returns a thread with a server-generated UUID.
- **`deleteThread(threadId)` and `updateThread({ id, … })`** take no owner. The memory API also has `deleteMessages`.

## Decisions

- **One guard, checked first.** `ThreadGuard.ownedThread(user, id)` returns the thread only when `resourceId === user`. A missing thread and a foreign thread both return `{ ok: false, code: 'NOT_FOUND', message: 'Thread not found' }`, so a caller cannot tell "exists but not yours" from "does not exist". Mastra's own checks remain a second line of defence, but their messages are never shown to callers.
- **Server-generated ids only.** `$n` references are resolved by the lab runner to the id that the nth `create` returned, so learners never type ids. Unknown references resolve to a fresh random UUID that does not exist, which exercises the not-found path.
- **Reset versus delete.**
  - `reset` keeps the thread (id, owner, title) and removes its messages. It recalls the message ids, then calls `deleteMessages`.
  - `delete` removes the thread.
  - Both are owner-only.
- **Run-scoped identities.** Resource ids are `<runId8>:<user>`, which keeps each run's world separate in the shared `lab-22.db` without locks. The lesson says production uses the authenticated user id.
- **Anti-pattern for contrast.** `raw-mastra` calls `getThreadById`, `recall`, `deleteThread` and the agent directly, and reports raw error messages. The checks compute the ground truth (which user created each thread), so leaks and cross-user changes are detected objectively.

## Risks

- **Ownership check and action are separate calls (TOCTOU).** Threads only change owner through `updateThreadResourceId`, which the lab never exposes. A multi-instance production system would enforce ownership in the storage query or with a transaction.
