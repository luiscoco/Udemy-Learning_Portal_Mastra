# Design

## Contracts

- **`lab.ts`:** `presentation: z.enum(['form', 'chat']).optional()` on `LabDefinitionSchema`.
- **`chat.ts`:**
  - `ChatMessageSchema` `{ id, role: user | assistant, text, status: complete | stopped | failed, createdAt }`;
  - `ChatTranscriptSchema` `{ threadId, threads: [{ id, title, updatedAt }], messages, turn?: { status: complete | failed, retried, tokens, replyId? } }`;
  - `chatTranscriptOf(output)` parses `output.chat`.

## Lab 67 (`packages/labs/src/lab-67/`)

**Input:**

| Field | Values |
| --- | --- |
| `action` | `send` \| `history` \| `delete-thread` |
| `threadId` | regex `^[a-z0-9][a-z0-9-]{2,40}$` |
| `message` | max 1,000 characters; required for `send` |
| `retry` | boolean |
| `fault` | `none` \| `fail` \| `slow` |
| `modelId` | a model id |

**`transcript.ts`:**

- `readTranscript(memory, threadId)` returns messages with status. Status is the `chatStatus` metadata when present. Otherwise an assistant message without model metadata that is the last message is treated as stopped, and a trailing user message without a reply is failed.
- `listThreads(memory)` lists the learner's threads.
- `unfinishedTurn(messages)` returns the ids of the trailing user message plus a following non-complete reply.

**`run.ts`:**

- Lock per thread, then open the store (`lab-67-chat`) and run the action.
- `send`:
  1. If `retry`, delete `unfinishedTurn`.
  2. Create the agent, with offline script `chatScript` that answers from the thread (it counts earlier turns and echoes the question) with `tokenDelayMs` 25, or 120 for `slow`.
  3. Stream with `memory: { thread, resource: 'learner' }` and `abortSignal: ctx.signal`.
  4. Count tokens, then tag the outcome.
- **Fault `fail`:** a guard model throws `HTTP 503` before the provider. The lab catches it, saves a failed marker (the dangling user message is detected as failed), and returns `turn.status: 'failed'` with a provider error log. The run succeeds, so the transcript renders, and the check "failure recoverable" passes.
- **Stop:** when `ctx.signal` aborts, `finally` awaits the persisted partial (polling up to 1 s), tags it `chatStatus: 'stopped'` and closes the store. The run itself ends `cancelled` through the runner.
- The output is `{ chat: ChatTranscript, streamed: { tokens, text }, ... }`.

**Checks (`send`):**

| Check | Passes when |
| --- | --- |
| `streamed-incrementally` | At least 2 token events arrived before the result. |
| `no-duplicate-tokens` | Concatenated tokens equal the saved reply text, and seq values strictly increase. |
| `history-persisted` | The last two messages are the user message and a complete reply. |
| `retry-replaced-turn` | After a retry, the message appears once at the end of the thread. |
| `failure-recoverable` | A failed turn is marked failed, and a retry can follow. |

`history` and `delete-thread` have a single check each.

## Web

**`components/workspace/ChatPanel.tsx`**, using `useLabRun`:

- **On mount and on thread change:** run `history` and set the transcript.
- **Send:** append an optimistic user bubble and a streaming bubble (`state.tokenText`), then `run({ action: 'send', … })`. When it finishes, replace the transcript with `output.chat`.
- **Stop:** set `stopping` at once, call `cancel()`, then reload history; the partial is shown as stopped.
- **Retry:** send the last user text with `retry: true`.

The thread picker lists threads from the transcript, and a new thread id is `chat-<n>`. Controls: a model select if live, and a fault select. `RunTab` renders `ChatPanel` when `definition.presentation === 'chat'`, keeping the session gate and mode selection.
