# Streaming chat UI

Each message is a run on a thread. The server streams tokens as run events; memory is the source of truth for history.

```ts
// Server (run.ts): stream through Mastra memory; the browser gets each text delta as a token event.
const stream = await agent.stream(message, { memory: { thread: threadId, resource: 'learner' }, abortSignal: ctx.signal });

// After Stop (ctx.signal aborted): Mastra 1.78 has saved the question AND the partial reply. Tag it.
await memory.updateMessages({ messages: [{ id: partial.id, content: { ...partial.content, metadata: { chatStatus: 'stopped' } } }] });

// Retry: replace the unfinished turn instead of asking again on top of it.
await memory.deleteMessages(unfinishedTurn(messages, message)); // trailing question + its stopped/failed reply
```

Browser (ChatPanel): every token event has a `seq`; the run reducer ignores a `seq` it already applied, and the SDK resumes with `Last-Event-ID`, so a reconnect never shows a token twice. Stop sets “Stopping…” immediately, then calls `api.runs.cancel(runId, runToken)`; when the run ends, the panel reloads history, where the partial reply shows as stopped.

Status rules (transcript.ts): a tag wins; otherwise a trailing reply without model metadata is stopped (Mastra adds `modelId`/`provider` only to a finished reply), and a trailing question without a reply is failed.

Challenge outline: add `action: 'edit'` with `replaceMessageId`. Delete that user message and every message after it (only if it is the last user message), then send the new text; reuse the Stop tagging unchanged.

Example input: send “Hi! What can you do?” on chat-1. Expected: several token events, the saved reply equals the streamed text, and the thread ends with the question and a complete reply.
