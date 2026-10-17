# Design

## Context

A spike against the installed `@mastra/core` 1.78.0 confirmed:

- **Pause:** `requireApproval: true` emits a `tool-call-approval` chunk `{ toolCallId, toolName, args }`, and the stream then ends without running `execute()`.
- **Approve:** `agent.approveToolCall({ runId, toolCallId })` returns a new stream with `tool-call-resumed` and `tool-result`; `execute()` runs once.
- **Decline:** `agent.declineToolCall({ runId, toolCallId, reason })` returns `tool-call-resumed` and `tool-output-denied`, and `execute()` does not run. The reason is shown to the model.
- **Resume storage:** this works in memory when the agent is registered on `new Mastra({ agents })`, which provides the run snapshot.
- **Conditional approval:** `requireApproval` also accepts a function of the input (`tools/types.d.ts`). This is used in the challenge.

## Decisions

- The tool set is filtered by role before the agent is constructed. This is stronger than `activeTools` or instructions, because a blocked tool cannot run whatever the model emits.
- The approval decision is supplied up front (`userDecision`) and applied when the run suspends, at most 3 rounds. A UI button flow would need the run to stay paused across HTTP requests; that is out of scope here, and the engine's run model is single-request.
- Policy is checked inside `execute()` after approval, and `executeCount` counts invocations separately from ledger writes. This proves approval is necessary but not sufficient.
- `AuditTrail` stores frozen entries behind a private field and exposes copies. Blocked calls are recorded from stream traces, because `execute()` never runs for them.
- The offline script attempts the requested action even when it isn't allowed, to demonstrate blocking. Live models only see the tools they were given.

## Risks

- Live models may answer without calling `issueRefund`. Checks then pass trivially, with no approval and no side effect. The live probe confirmed gpt-5-mini calls it in both the approve and decline paths.
