# Design

## Context

Verified against the installed versions (spike, `@mastra/core` 1.78.0, `@mastra/memory` 1.38.0, `@mastra/libsql` 1.26.2):

- **Setup.** `new LibSQLStore({ id, url: 'file:<path>' })` works with spaces in the Windows path. `new Memory({ storage, options: { lastMessages } })` is passed to `new Agent({ memory })`.
- **Turns are stored per thread.** `agent.generate(text, { memory: { thread, resource } })` stores user and assistant messages. The next turn's model call received the earlier user messages: 1, then 2.
- **History survives a reopen.** After `storage.close()` and brand-new store, memory and agent instances, the next turn received all three user messages from the file.
- **Reading back.**
  - `memory.recall({ threadId, resourceId })` returns `{ messages, total, page, perPage, hasMore }`, in chronological order, each with `role`, `createdAt`, `threadId`, `resourceId` and `content.parts`.
  - `getThreadById({ threadId })` and `listThreads({ filter: { resourceId } })` return thread records.
- **`lastMessages: 2` limits what the model receives** to the most recent messages.

## Decisions

- **LibSQL on a local file.** It is Mastra's own adapter, needs no server, and is good enough for a single-machine platform. Each lab gets its own database file, so labs cannot corrupt each other. Production hosting would switch the URL to a remote libSQL/Turso or Postgres adapter, and that is listed in the release gates.
- **Stores are opened and closed per run.** There is no shared singleton: the lab owns the instance lifecycle, and the "restart" is real at the client level. The run closes the store in `finally`, also on cancellation. SQLite file locking, plus LibSQLStore's own retry and backoff, handles concurrent runs.
- **Restart inside the lab versus in tests.**
  - The lab simulates a restart in-process: it closes the store and discards every Mastra object. That is cheap and safe, and it is what learners watch.
  - The integration test performs a **real** process restart. A child process writes and exits, then a new child process reads. That is the definition of done.
- **Thread and resource ids.** `threadId` is learner-chosen (validated slug). `resource` is fixed to `learner` in L21; L22 introduces user boundaries. Reset uses `memory.deleteThread()`.
- **Checks work offline and live.** "Survived the restart" is checked through `recall()` on the *new* instances before the follow-up, plus the answer mentioning the remembered facts. Offline, the model's received messages are also checked against the `lastMessages` window.

## Risks

- **Shared database file.** Learners on the same machine share `lab-21.db`. That's acceptable for local use. Per-learner isolation comes with L22 and the auth release gate.
