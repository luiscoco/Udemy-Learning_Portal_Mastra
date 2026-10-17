# Design

## Context

Spiked with the installed version: stream chunks `tool-call {toolCallId, toolName, args}`, `tool-result {toolCallId, toolName, args, result}`; invalid arguments yield a `tool-result` whose result is `{ error: true, message: "Tool input validation failed…" }` without running `execute`; thrown errors and unknown tools yield `tool-error`. `mastra.listTools()` indexes tools by key and by id.

## Decisions

- `streamAgent` (shared) turns those chunks into `tool-start`/`tool-finish` events so every tool lab gets a live trace for free; it checks the abort signal after the loop.
- Money in integer cents; the check recomputes totals independently of the tool's output.
- Offline script: turn 1 calls the tool with the learner's cart; turn 2 answers from the tool result. Live: the cart is embedded in the prompt and instructions require the tool.
