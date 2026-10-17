# Proposal

## Why

Once conversations are stored, every user must only ever see their own. Mastra checks ownership in some places (`recall()` and agent calls refuse another user's thread) but not in others. `getThreadById` returns any thread, and `deleteThread` and `updateThread` take only an id. Its refusal messages also name the real owner. Learners need to:

- give every call an explicit resource (user) and thread,
- generate thread ids on the server,
- put an ownership check in front of every thread operation, which answers "not found" without revealing who owns what.

## What Changes

- **New lab `lab-22`** (Module 05).
- **`ThreadGuard`** is an app-level boundary over Mastra Memory, and the lab's only path to threads. Its operations are `create`, `list`, `history`, `send`, `reset` and `delete`.
  - Each operation takes the signed-in user and a thread id, and checks `thread.resourceId === user` first.
  - For a thread the user doesn't own, it returns the same `NOT_FOUND` answer as for a missing one, with a generic message and no owner ids.
  - `create` uses Mastra's server-generated UUIDs.
  - `reset` deletes the thread's messages but keeps the thread and its owner.
- **A script of actions.** The learner writes 1–14 operations, each as a user (alice, bob or carol). Threads are referenced as `$1`, `$2` and so on, because ids are unguessable UUIDs.
  - Each run uses fresh user identities scoped to the run, so runs never see each other's data.
  - The example includes Bob trying to read, write to, reset and delete Alice's thread.
- **Strategy toggle:**
  - `guarded` (correct);
  - `raw-mastra` (anti-pattern): the same operations call Mastra directly. Bob then sees Alice's thread title through `getThreadById` and can delete it with `deleteThread`, and Mastra's refusal messages name Alice's resource id. The checks fail.

## Capabilities

### New Capabilities

- `course-labs/lab-22-threads-and-user-boundaries`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-22/`, using `services.memory` (`lab-22` database). Offline is free. Live mode makes one model call per allowed `send`.
