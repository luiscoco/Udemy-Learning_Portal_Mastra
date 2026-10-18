# Design

## Context

Verified in a spike with `@mastra/core` 1.78.0:

- **Native options.** `Agent({ agents: { … } })` exposes sub-agents to a supervisor as callable tools, and `agent.network()` routes between primitives with a model-driven routing agent. In both, the model picks the route. This lab needs an explicit, auditable handoff with guards, so it is implemented at the app level with transfer tools and a workflow. The concept text names the native options without claiming they are used.
- **Stopping after a transfer.** `agent.stream(prompt, { stopWhen })` accepts AI SDK stop conditions. A condition `({ steps }) => steps.some((s) => s.toolCalls.some((c) => c.toolName.startsWith('transfer_to_')))` ends the loop right after the transfer tool runs: one model call, no follow-up text. Tool calls in a step are `{ toolCallId, toolName, args }`.
- **Stop on a queued request, not on the call.** A first live run of the example ended with no handoff. The suspected cause is a transfer call with invalid arguments, but it was not reproduced. A stop condition that matches any `transfer_to_*` call ends the loop even when the call was rejected, so the lab uses `stopWhenQueued(desk, from)` (stop once the desk holds a request from that agent) with `maxSteps: 3`. The model then sees the validation error and can retry; a unit test covers invalid → valid.
- **`toolChoice: 'required'`** reaches the model (`{ type: 'required' }`), so triage must call a transfer tool.

## Decisions

- **Case record** (`routing.ts`): `CaseSchema = { customerId, orderId, product, errorCode, accountIssue, summary }` (nullable fields, enum `accountIssue ∈ locked | login | two-factor`). `extractCase(message)` is the deterministic oracle (regex `C-\d+`, `ORD-\d+`, `E\d{3}`, keyword product and issue maps) used by the offline triage script and by the checks; `expectedTarget(message)` likewise.
- **Packets.** `PACKET_FIELDS = { billing: [customerId, orderId, summary], technical: [customerId, product, errorCode, summary], account: [customerId, accountIssue, summary] }`, Only `customerId` and `summary` are required at handoff time. The domain fields (`orderId`, `product`, `accountIssue`) are what a specialist needs to resolve, so a misrouted specialist still receives the case and can transfer it on. The orchestrator keeps the full case record and projects a fresh packet at every hop, so context survives hops without specialists carrying it. `packetFor(target, case)` projects and redacts (`redact()`: 13–19 digit card numbers with spaces or dashes → `[card]`, `password is X` / `password: X` → `password [redacted]`).
- **Guard** `decideHandoff({ from, to, visited, hops, maxHops, case })` → `{ accepted: true, packet } | { accepted: false, reason: 'not-allowed' | 'cycle' | 'hop-limit' | 'missing-context', detail }`. The graph allows triage → any specialist and specialist → another specialist. Order of checks: not-allowed, hop-limit, cycle, missing-context.
- **Agents** (`agents.ts`): triage with three transfer tools whose input is the case record plus `reason`; each specialist with its domain tool and transfer tools to the two other specialists (`reason`, `note` ≤ 200). Transfer tools only push a request into the run's `HandoffDesk` and return `{ queued: true }`. Domain tools read `fixtures-data.ts` (invoices, service incidents, accounts).
- **Workflow** `handoff-workflow`: `triage` (streamAgent with `toolChoice: 'required'` and the stop condition) → `.dountil(handle, ({ inputData }) => inputData.done)` → `finish`. Each `handle` iteration first decides the pending handoff with the guard; refused → escalate; accepted → the target runs on its packet (prompt `HANDOFF PACKET` JSON + reason + previous note) with the stop condition and `maxSteps: 3`. A transfer request becomes the next pending handoff; text without a transfer resolves the case. A hard safety cap ends the loop at `maxHops + 1` iterations.
- **Faults.** `misroute`: the orchestrator replaces triage's target with the next specialist in the list and marks the handoff message `injected`. `ping-pong`: each specialist's instructions get the appended line "Fault injection: never resolve; always transfer the case to another specialist.", marked in the transcript.
- **Offline scripts.** Triage: `transfer_to_<expectedTarget>` with `extractCase(lastUser)` and a reason. Specialist: when the system prompt has the fault line → transfer to the first other specialist; when the packet does not belong to its domain (`expectedTarget` from the summary words and the fields present) → transfer there; otherwise call its domain tool with the packet field and reply from the result.

## Risks

- A live triage model may write a card number into `summary`; redaction runs before any packet is built, and the check scans every specialist prompt.
- A live specialist may resolve instead of transferring on a misroute; `correct-target` then fails, which is the honest outcome.
