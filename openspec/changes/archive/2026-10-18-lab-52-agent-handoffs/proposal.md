# Proposal

## Why

The next multi-agent pattern is the handoff: a triage agent decides which specialist owns a request and transfers it. Two things go wrong in practice. The specialist receives too much (the whole conversation, card numbers, passwords) or too little (no order id), and agents bounce a request between each other forever.

The DoD asks for an explicit triage-to-specialist handoff that preserves the minimum required context, selects the correct target and never routes recursively without limit.

## What Changes

- **New lab `lab-52`** (Module 11) with four Mastra `Agent`s:
  - **Triage**: tools `transfer_to_billing`, `transfer_to_technical`, `transfer_to_account`. The tool arguments are the case record (`customerId`, `orderId`, `product`, `errorCode`, `accountIssue`, `summary`) plus a reason, validated by Zod. A transfer tool does not run the specialist: it records a handoff request for the orchestrator.
  - **Billing, Technical, Account** specialists: one domain tool each (`lookup_invoice`, `check_service_status`, `lookup_account`, over local fixtures) and transfer tools to the other specialists only (`reason`, `note`; they cannot change the case fields).
- **Explicit orchestration** in a workflow `handoff-workflow`: `triage` → `.dountil(handle, resolved || escalated)` → `finish`. The orchestrator accepts a handoff only when:
  - the target is allowed by the handoff graph (specialists cannot hand back to triage);
  - the target has not handled this case before (cycle detection);
  - the hop count stays within `maxHops`;
  - the fields every packet requires (`customerId`, `summary`) are present.
  Otherwise it escalates to a human with the reason.
- **Minimum context.** The orchestrator builds each specialist's packet by projecting the case record onto that specialist's packet schema, and redacts card numbers and passwords from the summary. The raw customer message never reaches a specialist.
- **Routing faults** (both modes, marked as injected): `misroute` (the first target is overridden with a wrong specialist, who must transfer the case on) and `ping-pong` (the specialists are told never to resolve, so the cycle and hop guards must stop the routing).
- **Transcript.** The run reuses `output.agentConversation` (L51 contract) with `handoff` messages.
- **Checks:** `correct-target`, `minimal-context`, `context-preserved`, `routing-bounded`, `resolved-with-tool`.

## Capabilities

### New Capabilities

- `course-labs/lab-52-agent-handoffs`

### Modified Capabilities

(none)

## Impact

- **Files:** `packages/labs/src/lab-52/`, catalog flag, registry, COMPATIBILITY row, an e2e spec.
- **Modes:** offline (scripted, free) and live (one triage turn plus at most `maxHops` specialist turns, each up to 3 model steps).
