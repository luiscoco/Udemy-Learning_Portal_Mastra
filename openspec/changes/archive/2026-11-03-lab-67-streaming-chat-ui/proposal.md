# Proposal

## Why

The L67 DoD: a chat with incremental tokens, stop/retry, thread history and error recovery, with no duplicated streamed tokens and a responsive Stop. Every Run tab so far is a form that runs once and shows one output. A chat needs many turns on a thread, a live bubble while tokens stream, and history that survives reloads.

A spike with @mastra/core 1.78.0 and LibSQL memory found what Stop and Retry must handle. When a memory-backed `agent.stream()` is aborted, Mastra still persists the user message and the **partial** assistant reply; only a complete reply has model metadata. Resending the same question then stores it a second time next to the truncated answer. `memory.updateMessages()` (tagging metadata) and `memory.deleteMessages()` both work on that thread.

## What Changes

- **Contracts (additive):**
  - `LabDefinition.presentation?: 'form' | 'chat'`.
  - `ChatTranscriptSchema` for `output.chat`: `{ threadId, threads[], messages[{ id, role, text, status: complete | stopped | failed, createdAt }], turn? }`.
- **New lab `lab-67` (Module 14), presentation `chat`:**
  - **Actions:** `history` (no model), `send` and `delete-thread`, on a thread id kept in the learner's own storage partition (L62), with runs serialized per thread.
  - **`send` streams** through Mastra memory (`agent.stream({ memory: { thread, resource } })`). Token events reach the browser through the SDK.
  - **Stop:** cancelling the run aborts the model stream. Once the abort has settled, the lab tags the partial reply `chatStatus: 'stopped'` with `updateMessages`, so history shows it as stopped, not as a real answer.
  - **Retry** (`retry: true`) removes the unfinished turn (a dangling user message and its stopped or failed partial reply) with `deleteMessages`, then sends the message again. History never holds the question twice.
  - **Faults:**
    - `fail` makes the provider return 503 before any token, injected before the provider call, so it costs nothing live; the turn is kept as failed and can be retried;
    - `slow` paces offline tokens slowly, so Stop can be tried.
- **Web: `ChatPanel`** replaces the form for labs with `presentation: 'chat'`:
  - thread picker and new thread;
  - history loaded on open and on thread change;
  - message bubbles with a live streaming bubble;
  - Send (Enter), **Stop** (immediate "Stopping…", cancel with the run token) and **Retry** on a stopped or failed last turn;
  - typed errors shown with recovery;
  - progress recorded like any run.

  Tokens come from the run reducer, which already ignores replayed `seq`, on top of the SDK's Last-Event-ID resume.
- **Tests:**
  - lab tests (send, history, stop tags the partial, retry replaces the turn, fail then retry, thread isolation through partitions);
  - a reducer test that replayed tokens are not appended twice;
  - ChatPanel component tests (streaming bubble, Stop responsiveness, Retry, error);
  - an e2e chat (send, stop mid-stream within 1 s, retry, reload keeps history);
  - live.
