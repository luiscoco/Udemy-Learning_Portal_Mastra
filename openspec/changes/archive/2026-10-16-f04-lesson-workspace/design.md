# Design

## Context

F02 provides run/SSE endpoints and contracts; F03 provides shell, routing and the `ProgressStore` adapter (read path). See proposal.md.

## Goals / Non-Goals

**Goals:** a generic, definition-driven workspace; resilient streaming; truthful progress.

**Non-Goals:** executing learner-written code (scratchpad is text only), server-side progress storage, Mermaid rendering library (diagram slot shows source with caption; a renderer can be added later without contract change).

## Decisions

- **SSE client over `fetch` streams** rather than `EventSource`: the same parser works in browsers and tests, supports `AbortController` (closing = disconnect → server grace-cancel) and reconnects up to 3 times with `Last-Event-ID`. Events are Zod-validated; malformed frames are reported as client errors, not crashes.
- **Run state reducer** (`useLabRun`): `idle → starting → streaming → finished|error`, accumulating events, token text, tool calls (paired by `toolCallId`), workflow steps, result and terminal status. Token events update a single output string (not one DOM node per token); the timeline renders non-token events plus a token counter to keep the DOM small.
- **Dynamic form** builds values from field defaults/example input; client validation mirrors field constraints; server `details` paths `input.<field>` map back to fields.
- **Progress updates** via `useProgressActions(labId)`: merge patch, recompute `status` with `deriveProgressStatus`, stamp `updatedAt`, save. Locked labs never call it.
- **Tabs**: roving tabindex, Left/Right/Home/End; panels keep state mounted (`hidden`) so a running stream survives tab switches.
- **Highlighting**: `prism-react-renderer` (no runtime fetches, MIT, small) with light/dark themes following `data-theme`.
- **Download/export**: `Blob` + temporary object URL anchor.
- **Quiz** pass threshold 70% (`PASS_RATIO = 0.7`); answers saved with the attempt.
- **Prediction** stored on `ProgressRecord.prediction` (optional, default `''`).

## Risks / Trade-offs

- [Long token streams] → single string state; event buffer capped server-side.
- [Clipboard API unavailable on http/insecure contexts] → fallback message "Select and copy manually".

## Migration Plan

`ProgressRecord.prediction` has a default, so stored v1 records stay valid.
